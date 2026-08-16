import { db } from '@/lib/prisma'
import { renderSmsTemplate } from '@/lib/sms/messageTemplate'
import { sendSmsGateMessage, smsGateConfigSummary } from '@/lib/sms/smsGateClient'
import { markRecipientSmsSent } from '@/lib/sms/smsCampaignContacts'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runSmsCampaign(id) {
	const campaign = await db.smsCampaign.findUnique({
		where: { id },
		include: {
			recipients: { where: { status: { in: ['PENDING', 'FAILED'] } } },
		},
	})
	if (!campaign) throw new Error('Nie znaleziono kampanii.')

	await db.smsCampaign.update({
		where: { id },
		data: { status: 'RUNNING', startedAt: new Date(), finishedAt: null },
	})

	const profile = process.env.SMSGATE_CAMPAIGN_PROFILE || undefined
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

	for (const recipient of campaign.recipients) {
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
				raw: { profile: config.profile },
			})
			await markRecipientSmsSent({
				campaignId: campaign.id,
				recipient,
			})
			console.info('[sms campaign] recipient queued', {
				campaignId: campaign.id,
				recipientId: recipient.id,
				phone: recipient.phone,
				providerMessageId: result?.id || recipient.id,
			})
		} catch (error) {
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
		}

		if (campaign.delaySeconds > 0) {
			await sleep(Math.min(campaign.delaySeconds, 30) * 1000)
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
			status: active ? 'RUNNING' : failed ? 'FAILED' : 'COMPLETED',
			finishedAt: active ? null : new Date(),
		},
		include: { recipients: true },
	})
}
