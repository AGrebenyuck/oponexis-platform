import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { normalizePhone } from '@/lib/date'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'
import { sendSmsGateMessage, smsGateConfigSummary } from '@/lib/sms/smsGateClient'

const ATTENTION_STATUSES = ['INTERESTED', 'CALL_BACK', 'NO_ANSWER']

function serializeEvent(event) {
	return {
		id: event.id,
		direction: event.direction,
		type: event.type,
		phone: event.phone,
		message: event.message,
		providerMessageId: event.providerMessageId,
		occurredAt: event.occurredAt,
	}
}

function latestEvent(events = []) {
	return [...events].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))[0]
}

function statusNeedsAttention(status) {
	return ATTENTION_STATUSES.includes(status)
}

async function updateSeasonStatus({ recipient, campaign, status, note }) {
	if (!recipient.customerId || !campaign.sourceSeason || !campaign.sourceYear) return

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

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url)
		const status = searchParams.get('status') || ''
		const campaignId = searchParams.get('campaignId') || ''
		const search = searchParams.get('search')?.trim().toLowerCase() || ''

		const incomingEvents = await db.smsContactEvent.findMany({
			where: {
				direction: 'IN',
				...(campaignId ? { campaignId } : {}),
			},
			orderBy: { occurredAt: 'desc' },
			take: 250,
		})
		const eventRecipientIds = incomingEvents
			.map(event => event.recipientId)
			.filter(Boolean)
		const eventPhones = incomingEvents
			.map(event => normalizePhone(event.phone))
			.filter(Boolean)

		const recipientWhere = {
			...(campaignId ? { campaignId } : {}),
			OR: [
				{ status: { in: ATTENTION_STATUSES } },
				{ contactEvents: { some: { direction: 'IN' } } },
				eventRecipientIds.length ? { id: { in: eventRecipientIds } } : null,
				eventPhones.length ? { phone: { in: eventPhones } } : null,
			].filter(Boolean),
		}

		const recipientsWithLooseEvents = await db.smsCampaignRecipient.findMany({
			where: recipientWhere,
			orderBy: { updatedAt: 'desc' },
			include: {
				campaign: true,
				customer: true,
				contactEvents: { orderBy: { occurredAt: 'asc' } },
			},
			take: 250,
		})

		const eventsByPhone = new Map()
		for (const event of incomingEvents) {
			const phone = normalizePhone(event.phone)
			if (!phone) continue
			if (!eventsByPhone.has(phone)) eventsByPhone.set(phone, [])
			eventsByPhone.get(phone).push(event)
		}

		let items = recipientsWithLooseEvents.map(recipient => {
			const phone = normalizePhone(recipient.phone)
			const mergedEvents = [
				...recipient.contactEvents,
				...(phone ? eventsByPhone.get(phone) || [] : []),
			]
			const uniqueEvents = Array.from(
				new Map(mergedEvents.map(event => [event.id, event])).values()
			).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
			const events = uniqueEvents.map(serializeEvent)
			const latest = latestEvent(events)
			return {
				id: recipient.id,
				recipientId: recipient.id,
				campaignId: recipient.campaignId,
				campaignName: recipient.campaign?.name || '-',
				customerId: recipient.customerId,
				customerUrl: recipient.customerId ? `/admin/customers/${recipient.customerId}` : null,
				name: recipient.name || recipient.customer?.name || 'Klient',
				phone: recipient.phone,
				status: recipient.status,
				note: recipient.note,
				updatedAt: recipient.updatedAt,
				lastAt: latest?.occurredAt || recipient.updatedAt,
				lastMessage: latest?.message || latest?.type || recipient.note || '',
				needsAttention: statusNeedsAttention(recipient.status),
				events,
			}
		})

		if (status) items = items.filter(item => item.status === status)
		if (search) {
			items = items.filter(item =>
				[item.name, item.phone, item.campaignName, item.lastMessage]
					.filter(Boolean)
					.some(value => String(value).toLowerCase().includes(search))
			)
		}

		const stats = {
			total: items.length,
			inbox: items.filter(item => item.events.some(event => event.direction === 'IN')).length,
			attention: items.filter(item => item.needsAttention).length,
			interested: items.filter(item => item.status === 'INTERESTED').length,
			callback: items.filter(item => item.status === 'CALL_BACK').length,
			booked: items.filter(item => item.status === 'BOOKED').length,
		}

		return NextResponse.json({ success: true, data: { items, stats } })
	} catch (error) {
		console.error('GET /api/admin/sms-inbox failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie pobrano inbox SMS.' },
			{ status: 500 }
		)
	}
}

export async function PATCH(req) {
	try {
		const body = await req.json()
		const recipientId = body.recipientId
		const status = body.status
		const note = body.note || null

		if (!recipientId || !status) {
			return NextResponse.json(
				{ success: false, error: 'Brak odbiorcy lub statusu.' },
				{ status: 400 }
			)
		}

		const recipient = await db.smsCampaignRecipient.update({
			where: { id: recipientId },
			data: { status, note: note || undefined },
			include: { campaign: true },
		})

		await createSmsContactEvent({
			campaignId: recipient.campaignId,
			recipientId: recipient.id,
			customerId: recipient.customerId,
			direction: 'NOTE',
			type: 'status_changed',
			phone: recipient.phone,
			message: note || `Status: ${status}`,
		})

		await updateSeasonStatus({ recipient, campaign: recipient.campaign, status, note })

		return NextResponse.json({ success: true, data: recipient })
	} catch (error) {
		console.error('PATCH /api/admin/sms-inbox failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie zapisano statusu.' },
			{ status: 500 }
		)
	}
}

export async function POST(req) {
	try {
		const body = await req.json()
		const recipientIds = Array.isArray(body.recipientIds) ? body.recipientIds : []
		const message = String(body.message || '').trim()
		if (!recipientIds.length || !message) {
			return NextResponse.json(
				{ success: false, error: 'Wybierz odbiorców i wpisz wiadomość.' },
				{ status: 400 }
			)
		}

		const recipients = await db.smsCampaignRecipient.findMany({
			where: { id: { in: recipientIds } },
			include: { campaign: true },
		})
		const profile = process.env.SMSGATE_CAMPAIGN_PROFILE || process.env.SMSGATE_DEFAULT_PROFILE
		const config = smsGateConfigSummary(profile)
		const result = { sent: 0, failed: 0, errors: [] }

		for (const recipient of recipients) {
			const customId = `fu_${recipient.id.slice(-10)}_${Date.now().toString(36).slice(-6)}`
			try {
				const sent = await sendSmsGateMessage({
					phone: recipient.phone,
					text: message,
					customId,
					profile,
				})

				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: {
						status: 'SENT',
						providerMessageId: sent.id,
						sentAt: new Date(),
						error: null,
					},
				})
				await createSmsContactEvent({
					campaignId: recipient.campaignId,
					recipientId: recipient.id,
					customerId: recipient.customerId,
					direction: 'OUT',
					type: 'sms_sent_followup',
					phone: recipient.phone,
					message,
					providerMessageId: sent.id,
					raw: sent.raw,
				})
				await updateSeasonStatus({
					recipient,
					campaign: recipient.campaign,
					status: 'SMS_SENT',
					note: 'Follow-up SMS wysłany',
				})
				result.sent += 1
			} catch (sendError) {
				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: { status: 'FAILED', error: sendError.message },
				})
				result.failed += 1
				result.errors.push(`${recipient.phone}: ${sendError.message}`)
			}
		}

		console.info('[sms inbox followup] sent', {
			profile: config.profile,
			deviceIdUsed: config.deviceIdUsed,
			...result,
		})

		return NextResponse.json({ success: true, data: result })
	} catch (error) {
		console.error('POST /api/admin/sms-inbox failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie wysłano follow-up SMS.' },
			{ status: 500 }
		)
	}
}
