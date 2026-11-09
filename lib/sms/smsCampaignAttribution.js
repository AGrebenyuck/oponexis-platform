import { normalizePhone } from '@/lib/date'
import { db } from '@/lib/prisma'
import { createSmsContactEvent, updateSeasonContactStatus } from '@/lib/sms/smsContactEvents'

const ATTRIBUTABLE_STATUSES = [
	'QUEUED',
	'PROCESSED',
	'SENT',
	'DELIVERED',
	'INTERESTED',
	'CALL_BACK',
	'NO_ANSWER',
	'BOOKED',
	'DECLINED',
]

const CALL_OUTCOME_STATUS = {
	interested: 'INTERESTED',
	follow_up_required: 'CALL_BACK',
	not_interested: 'DECLINED',
	wrong_number: 'DECLINED',
}

const CALL_OUTCOME_LABEL = {
	interested: 'Rozmowa: zainteresowany',
	follow_up_required: 'Rozmowa: wymagany ponowny kontakt',
	not_interested: 'Rozmowa: brak zainteresowania',
	wrong_number: 'Rozmowa: nieprawidłowy numer',
	other: 'Rozmowa: inny wynik',
}

async function findLatestCampaignRecipient(phone) {
	const normalized = normalizePhone(phone)
	if (!normalized) return null
	return db.smsCampaignRecipient.findFirst({
		where: { phone: normalized, status: { in: ATTRIBUTABLE_STATUSES } },
		include: { campaign: true },
		orderBy: { updatedAt: 'desc' },
	})
}

export async function recordSmsCampaignCallOutcome({
	eventId,
	phone,
	customerId,
	outcomeCode,
	topicLabel,
	disconnectCategory,
	durationBucket,
	occurredAt,
}) {
	const recipient = await findLatestCampaignRecipient(phone)
	if (!recipient) return null

	const status = CALL_OUTCOME_STATUS[outcomeCode]
	const previousEvent = await db.smsContactEvent.findUnique({
		where: { providerMessageId_type: { providerMessageId: eventId, type: 'call_outcome' } },
	})
	const message = [CALL_OUTCOME_LABEL[outcomeCode] || 'Rozmowa z klientem', topicLabel]
		.filter(Boolean)
		.join(': ')
	const event = await createSmsContactEvent({
		campaignId: recipient.campaignId,
		recipientId: recipient.id,
		customerId: recipient.customerId || customerId,
		direction: 'CALL',
		type: 'call_outcome',
		phone,
		message,
		providerMessageId: eventId,
		occurredAt,
		raw: { outcomeCode, topicLabel, disconnectCategory, durationBucket },
	})

	if (
		!status ||
		recipient.status === 'BOOKED' ||
		(previousEvent && !['QUEUED', 'PROCESSED', 'SENT', 'DELIVERED'].includes(recipient.status))
	) {
		return { recipient, event }
	}

	const updated = await db.smsCampaignRecipient.updateMany({
		where: { id: recipient.id, status: recipient.status },
		data: { status, note: message },
	})
	if (updated.count) {
		await updateSeasonContactStatus({
			campaign: recipient.campaign,
			recipient,
			status,
			note: message,
		})
	}

	return { recipient, event }
}

export async function markSmsCampaignBookedFromWorkOrder({ phone, customerId, workOrderId }) {
	const recipient = await findLatestCampaignRecipient(phone)
	if (!recipient) return null

	const note = `Umówiono usługę — zlecenie ${workOrderId}.`
	await db.smsCampaignRecipient.update({
		where: { id: recipient.id },
		data: {
			status: 'BOOKED',
			customerId: recipient.customerId || customerId || undefined,
			note,
		},
	})
	await createSmsContactEvent({
		campaignId: recipient.campaignId,
		recipientId: recipient.id,
		customerId: recipient.customerId || customerId,
		direction: 'NOTE',
		type: 'status_booked',
		phone,
		message: note,
		providerMessageId: `work-order-${workOrderId}`,
	})
	await updateSeasonContactStatus({
		campaign: recipient.campaign,
		recipient: { ...recipient, customerId: recipient.customerId || customerId },
		status: 'BOOKED',
		note,
	})

	return recipient
}
