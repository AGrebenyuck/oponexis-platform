import { db } from '@/lib/prisma'
import { renderSmsTemplate } from '@/lib/sms/messageTemplate'
import {
	checkSmsGateConnection,
	sendSmsGateMessage,
	smsGateConfigSummary,
} from '@/lib/sms/smsGateClient'
import { markRecipientSmsSent } from '@/lib/sms/smsCampaignContacts'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'
import { findMarketingSmsIneligibleRecipients } from '@/lib/sms/marketingConsent'
import { companionSmsEnabled, getPrimaryCompanionDevice } from '@/lib/sms/companionSmsClient'
import { campaignAllowsMissingMarketingConsent } from '@/lib/sms/smsCampaignTestMode'

const CAMPAIGN_MAX_BATCH_SIZE = 3
const STALE_PROCESSING_MS = 2 * 60 * 1000

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runSmsCampaign(id) {
	const campaign = await db.smsCampaign.findUnique({
		where: { id },
	})
	if (!campaign) throw new Error('Nie znaleziono kampanii.')
	if (campaign.filters?.smsCampaignTestMode === true && !campaignAllowsMissingMarketingConsent(campaign)) {
		throw new Error('Tryb testowy SMS został wyłączony. Kampanię obejmującą odbiorców bez zgody można uruchomić tylko w aktywnym trybie testowym.')
	}
	const delaySeconds = Math.max(0, Math.min(Number(campaign.delaySeconds) || 0, 30))
	const batchSize = Math.max(1, Math.min(CAMPAIGN_MAX_BATCH_SIZE, Math.floor(55 / (delaySeconds + 10))))
	campaign.recipients = await db.smsCampaignRecipient.findMany({
		where: {
			campaignId: id,
			status: 'PENDING',
		},
		orderBy: { createdAt: 'asc' },
		take: batchSize,
	})
	if (!campaign.recipients.length) return campaign

	const profile = process.env.SMSGATE_CAMPAIGN_PROFILE || undefined
	if (companionSmsEnabled()) {
		const device = await getPrimaryCompanionDevice()
		if (!device) throw new Error('Brak aktywnego głównego urządzenia Companion do wysyłki SMS.')
	} else {
		await checkSmsGateConnection(profile, { signal: AbortSignal.timeout(5_000) })
	}
	const ineligibleIds = new Set(
		(
			await findMarketingSmsIneligibleRecipients(campaign.recipients, {
				allowWithoutConsent: campaignAllowsMissingMarketingConsent(campaign),
				allowManuallyConfirmed: campaign.filters?.smsCampaignManualConsentConfirmed === true,
			})
		).map(item => item.id)
	)

	const claim = await db.smsCampaign.updateMany({
		where: {
			id,
			OR: [
				{ status: { in: ['DRAFT', 'SCHEDULED', 'FAILED', 'PAUSED', 'RUNNING'] } },
				{ status: 'PROCESSING', startedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
			],
		},
		data: { status: 'PROCESSING', startedAt: new Date(), finishedAt: null },
	})
	if (!claim.count) {
		const error = new Error('Рассылка уже запущена или кампания не готова к старту.')
		error.code = 'SMS_CAMPAIGN_NOT_STARTABLE'
		throw error
	}

	const config = smsGateConfigSummary(profile)
	console.info('[sms campaign] run start', {
		campaignId: campaign.id,
		name: campaign.name,
		profile: config.profile,
		recipients: campaign.recipients.length,
		deviceIdUsed: config.deviceIdUsed,
		deviceId: config.deviceId,
		simNumber: config.simNumber,
	})
	let consecutiveFailures = 0
	let pausedForErrors = false

	for (let index = 0; index < campaign.recipients.length; index += 1) {
		const recipient = campaign.recipients[index]
		if (ineligibleIds.has(recipient.id)) {
			await db.smsCampaignRecipient.update({
				where: { id: recipient.id },
				data: {
					status: 'FAILED',
					failedAt: new Date(),
					error: 'Brak aktywnej zgody marketingowej SMS lub numer nie zgadza się z kartą klienta.',
				},
			})
			continue
		}
		let providerAccepted = false
		try {
			const text = renderSmsTemplate(campaign.message, recipient)
			console.info('[sms campaign] recipient send start', {
				campaignId: campaign.id,
				recipientId: recipient.id,
				phone: recipient.phone,
				textLength: text.length,
			})
			const result = await sendSmsGateMessage({
				phone: recipient.phone,
				text,
				customId: recipient.id,
				profile,
			})
			providerAccepted = true
			await db.smsCampaignRecipient.update({
				where: { id: recipient.id },
				data: {
					status: 'QUEUED',
					sentAt: null,
					providerMessageId: result?.id || recipient.id,
					failedAt: null,
					error: null,
				},
			})
			await createSmsContactEvent({
				campaignId: campaign.id,
				recipientId: recipient.id,
				customerId: recipient.customerId,
				direction: 'OUT',
				type: 'sms_campaign_queued',
				phone: recipient.phone,
				providerMessageId: result?.id || recipient.id,
				raw: { profile: config.profile, ...(result?.raw || {}) },
			})
			await markRecipientSmsSent({
				campaignId: campaign.id,
				recipient,
			})
			consecutiveFailures = 0
			console.info('[sms campaign] recipient queued', {
				campaignId: campaign.id,
				recipientId: recipient.id,
				phone: recipient.phone,
				providerMessageId: result?.id || recipient.id,
			})
		} catch (error) {
			if (providerAccepted) {
				console.error('[sms campaign] provider accepted; follow-up persistence failed', {
					campaignId: campaign.id,
					recipientId: recipient.id,
					error: error.message || 'Post-send persistence error',
				})
				pausedForErrors = true
				break
			}
			await db.smsCampaignRecipient.update({
				where: { id: recipient.id },
				data: {
					status: 'FAILED',
					failedAt: new Date(),
					error: error.message || 'SMSGate error',
				},
			})
			console.error('[sms campaign] recipient failed', {
				campaignId: campaign.id,
				recipientId: recipient.id,
				phone: recipient.phone,
				error: error.message || 'SMSGate error',
			})
			consecutiveFailures += 1
			if (consecutiveFailures >= 3) {
				pausedForErrors = true
				console.error('[sms campaign] paused after consecutive failures', {
					campaignId: campaign.id,
					consecutiveFailures,
				})
				break
			}
		}

		if (delaySeconds > 0 && index < campaign.recipients.length - 1) {
			await sleep(delaySeconds * 1000)
		}
	}

	const active = await db.smsCampaignRecipient.count({
		where: { campaignId: id, status: { in: ['PENDING', 'QUEUED', 'PROCESSED'] } },
	})
	const failed = await db.smsCampaignRecipient.count({
		where: { campaignId: id, status: 'FAILED' },
	})

	console.info('[sms campaign] run finish', {
		campaignId: campaign.id,
		active,
		failed,
	})

	return db.smsCampaign.update({
		where: { id },
		data: {
			status: pausedForErrors ? 'PAUSED' : active ? 'RUNNING' : failed ? 'FAILED' : 'COMPLETED',
			finishedAt: active && !pausedForErrors ? null : new Date(),
		},
		include: { recipients: true },
	})
}
