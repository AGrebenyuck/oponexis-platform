import { db } from '@/lib/prisma'
import { normalizePhone } from '@/lib/date'
import { CONTACT_STATUSES } from '@/lib/season'

function normalizedPhoneOrRaw(phone) {
	return normalizePhone(phone) || String(phone || '').trim()
}

export async function createSmsContactEvent({
	campaignId,
	recipientId,
	customerId,
	direction,
	type,
	phone,
	message,
	providerMessageId,
	occurredAt,
	raw,
}) {
	if (providerMessageId && type) {
		const existing = await db.smsContactEvent.findUnique({
			where: { providerMessageId_type: { providerMessageId, type } },
		})
		if (existing) return existing
	}

	return db.smsContactEvent.create({
		data: {
			campaignId: campaignId || null,
			recipientId: recipientId || null,
			customerId: customerId || null,
			direction,
			type,
			phone: phone ? normalizedPhoneOrRaw(phone) : null,
			message: message || null,
			providerMessageId: providerMessageId || null,
			occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
			raw: raw || undefined,
		},
	})
}

async function updateSeasonContactStatus({ campaign, recipient, status, note }) {
	if (
		!recipient?.customerId ||
		!campaign?.sourceSeason ||
		!campaign?.sourceYear ||
		!CONTACT_STATUSES.includes(status)
	) {
		return null
	}

	return db.customerSeasonStatus.upsert({
		where: {
			customerId_season_year: {
				customerId: recipient.customerId,
				season: campaign.sourceSeason,
				year: campaign.sourceYear,
			},
		},
		create: {
			customerId: recipient.customerId,
			season: campaign.sourceSeason,
			year: campaign.sourceYear,
			status,
			note: note || null,
			lastContactAt: new Date(),
		},
		update: {
			status,
			note: note || undefined,
			lastContactAt: new Date(),
		},
	})
}

export async function recordIncomingSms({ sender, recipientPhone, message, messageId, receivedAt, raw }) {
	const phone = normalizedPhoneOrRaw(sender)
	if (!phone) throw new Error('Brak numeru nadawcy SMS.')

	const recipient = await db.smsCampaignRecipient.findFirst({
		where: { phone },
		include: { campaign: true },
		orderBy: { updatedAt: 'desc' },
	})

	const note = message ? `Odpowiedź SMS: ${message}` : 'Odpowiedź SMS'

	const event = await createSmsContactEvent({
		campaignId: recipient?.campaignId || null,
		recipientId: recipient?.id || null,
		customerId: recipient?.customerId || null,
		direction: 'IN',
		type: 'sms_received',
		phone,
		message,
		providerMessageId: messageId,
		occurredAt: receivedAt,
		raw,
	})

	if (recipient) {
		await db.smsCampaignRecipient.update({
			where: { id: recipient.id },
			data: {
				status: 'INTERESTED',
				note,
			},
		})
		await updateSeasonContactStatus({
			campaign: recipient.campaign,
			recipient,
			status: 'INTERESTED',
			note,
		})
	}

	console.info('[smsgate incoming sms] saved', {
		phone,
		recipientPhone: recipientPhone || null,
		messageId: messageId || null,
		eventId: event.id,
		matchedRecipientId: recipient?.id || null,
		matchedCampaignId: recipient?.campaignId || null,
		matchedCustomerId: recipient?.customerId || null,
	})

	return { event, recipient }
}

export async function recordSmsDeliveryEvent({ event, payload, raw }) {
	const messageId = payload?.messageId
	if (!messageId) return null

	const recipient = await db.smsCampaignRecipient.findFirst({
		where: { providerMessageId: messageId },
		include: { campaign: true },
	})

	const statusByEvent = {
		'sms:sent': 'SENT',
		'sms:delivered': 'DELIVERED',
		'sms:failed': 'FAILED',
		'sms:cancelled': 'CANCELLED',
	}
	const status = statusByEvent[event]
	const deliveryError = status === 'FAILED' ? payload.reason || 'SMSGate failed' : null

	if (recipient && status) {
		await db.smsCampaignRecipient.update({
			where: { id: recipient.id },
			data: {
				status,
				sentAt: ['SENT', 'DELIVERED'].includes(status)
					? new Date(payload.sentAt || payload.deliveredAt || Date.now())
					: undefined,
				failedAt: status === 'FAILED' ? new Date(payload.failedAt || Date.now()) : undefined,
				error: status === 'FAILED' ? payload.reason || 'SMSGate failed' : null,
			},
		})
	}

	if (status) {
		const formLog = await db.smsFormLog.findFirst({
			where: {
				OR: [
					{ providerMessageId: messageId },
					{ reminderProviderMessageId: messageId },
				],
			},
		})
		if (formLog) {
			await db.smsFormLog.update({
				where: { id: formLog.id },
				data: {
					deliveryStatus: status,
					deliveryError,
					deliveryUpdatedAt: new Date(
						payload.sentAt || payload.deliveredAt || payload.failedAt || payload.cancelledAt || Date.now()
					),
				},
			})
		}
	}

	return createSmsContactEvent({
		campaignId: recipient?.campaignId || null,
		recipientId: recipient?.id || null,
		customerId: recipient?.customerId || null,
		direction: 'OUT',
		type: event.replace(':', '_'),
		phone: payload.recipient,
		message: payload.reason || null,
		providerMessageId: messageId,
		occurredAt:
			payload.sentAt || payload.deliveredAt || payload.failedAt || payload.cancelledAt,
		raw,
	})
}
