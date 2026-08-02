import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { CONTACT_STATUSES } from '@/lib/season'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'

const RECIPIENT_STATUSES = new Set([
	'PENDING',
	'QUEUED',
	'PROCESSED',
	'SENT',
	'DELIVERED',
	'FAILED',
	'CANCELLED',
	'BOOKED',
	'DECLINED',
	'CALL_BACK',
	'NO_ANSWER',
	'INTERESTED',
])

const CONTACT_STATUS_BY_RECIPIENT = {
	BOOKED: 'BOOKED',
	DECLINED: 'DECLINED',
	CALL_BACK: 'CALL_BACK',
	NO_ANSWER: 'NO_ANSWER',
	INTERESTED: 'INTERESTED',
	SENT: 'SMS_SENT',
	DELIVERED: 'SMS_SENT',
	QUEUED: 'SMS_SENT',
	PROCESSED: 'SMS_SENT',
}

const EVENT_TYPE_BY_RECIPIENT = {
	BOOKED: 'status_booked',
	DECLINED: 'status_declined',
	CALL_BACK: 'call_back',
	NO_ANSWER: 'call_no_answer',
	INTERESTED: 'status_interested',
}

export async function PATCH(req, { params }) {
	try {
		const { id, recipientId } = await params
		const body = await req.json()
		const status = String(body?.status || '').trim().toUpperCase()
		const note = body?.note == null ? undefined : String(body.note).trim()

		if (!RECIPIENT_STATUSES.has(status)) {
			return NextResponse.json(
				{ success: false, error: 'Nieprawidłowy status odbiorcy.' },
				{ status: 400 }
			)
		}

		const updated = await db.smsCampaignRecipient.updateMany({
			where: { id: recipientId, campaignId: id },
			data: {
				status,
				note,
				error: ['FAILED'].includes(status) ? undefined : null,
			},
		})
		if (!updated.count) {
			return NextResponse.json(
				{ success: false, error: 'Nie znaleziono odbiorcy kampanii.' },
				{ status: 404 }
			)
		}

		const recipient = await db.smsCampaignRecipient.findUnique({
			where: { id: recipientId },
		})
		const eventType = EVENT_TYPE_BY_RECIPIENT[status]
		if (eventType) {
			await createSmsContactEvent({
				campaignId: id,
				recipientId: recipient.id,
				customerId: recipient.customerId,
				direction: status === 'NO_ANSWER' || status === 'CALL_BACK' ? 'CALL' : 'NOTE',
				type: eventType,
				phone: recipient.phone,
				message: note || status,
				occurredAt: new Date(),
			})
		}

		const campaign = await db.smsCampaign.findUnique({
			where: { id },
			select: { sourceSeason: true, sourceYear: true },
		})

		const contactStatus = CONTACT_STATUS_BY_RECIPIENT[status]
		if (
			recipient.customerId &&
			campaign?.sourceSeason &&
			campaign?.sourceYear &&
			CONTACT_STATUSES.includes(contactStatus)
		) {
			await db.customerSeasonStatus.upsert({
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
					status: contactStatus,
					note: note || null,
					lastContactAt: new Date(),
				},
				update: {
					status: contactStatus,
					note: note || undefined,
					lastContactAt: new Date(),
				},
			})
		}

		return NextResponse.json({ success: true, data: recipient })
	} catch (error) {
		console.error('PATCH /api/admin/sms-campaigns/[id]/recipients/[recipientId] failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie zapisano statusu odbiorcy.' },
			{ status: 500 }
		)
	}
}
