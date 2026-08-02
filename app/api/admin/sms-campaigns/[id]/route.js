import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { normalizePhone } from '@/lib/date'

export async function GET(_req, { params }) {
	try {
		const { id } = await params
		const campaign = await db.smsCampaign.findUnique({
			where: { id },
			include: {
				recipients: {
					orderBy: { createdAt: 'asc' },
					include: {
						contactEvents: { orderBy: { occurredAt: 'asc' } },
					},
				},
			},
		})
		if (!campaign) {
			return NextResponse.json(
				{ success: false, error: 'Nie znaleziono kampanii.' },
				{ status: 404 }
			)
		}

		const recipientPhones = campaign.recipients
			.map(recipient => normalizePhone(recipient.phone))
			.filter(Boolean)
		const customerIds = campaign.recipients
			.map(recipient => recipient.customerId)
			.filter(Boolean)

		const looseContactEvents = await db.smsContactEvent.findMany({
			where: {
				OR: [
					{ campaignId: id },
					recipientPhones.length ? { phone: { in: recipientPhones } } : undefined,
					customerIds.length ? { customerId: { in: customerIds } } : undefined,
				].filter(Boolean),
			},
			orderBy: { occurredAt: 'asc' },
		})

		const eventsByRecipientId = new Map()
		const eventsByPhone = new Map()
		const eventsByCustomerId = new Map()
		for (const event of looseContactEvents) {
			if (event.recipientId) {
				if (!eventsByRecipientId.has(event.recipientId)) {
					eventsByRecipientId.set(event.recipientId, [])
				}
				eventsByRecipientId.get(event.recipientId).push(event)
			}
			if (event.phone) {
				const phone = normalizePhone(event.phone)
				if (phone) {
					if (!eventsByPhone.has(phone)) eventsByPhone.set(phone, [])
					eventsByPhone.get(phone).push(event)
				}
			}
			if (event.customerId) {
				if (!eventsByCustomerId.has(event.customerId)) {
					eventsByCustomerId.set(event.customerId, [])
				}
				eventsByCustomerId.get(event.customerId).push(event)
			}
		}

		const data = {
			...campaign,
			recipients: campaign.recipients.map(recipient => {
				const phone = normalizePhone(recipient.phone)
				const merged = [
					...(recipient.contactEvents || []),
					...(eventsByRecipientId.get(recipient.id) || []),
					...(phone ? eventsByPhone.get(phone) || [] : []),
					...(recipient.customerId
						? eventsByCustomerId.get(recipient.customerId) || []
						: []),
				]
				const unique = Array.from(
					new Map(merged.map(event => [event.id, event])).values()
				).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))

				return {
					...recipient,
					contactEvents: unique,
				}
			}),
		}

		return NextResponse.json({ success: true, data })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message || 'Błąd kampanii.' },
			{ status: 500 }
		)
	}
}

export async function PATCH(req, { params }) {
	try {
		const { id } = await params
		const body = await req.json()
		const updated = await db.smsCampaign.update({
			where: { id },
			data: {
				name: body.name,
				message: body.message,
				delaySeconds:
					body.delaySeconds == null ? undefined : Number(body.delaySeconds),
				scheduledAt:
					body.scheduledAt === undefined
						? undefined
						: body.scheduledAt
							? new Date(body.scheduledAt)
							: null,
				status:
					body.scheduledAt === undefined
						? undefined
						: body.scheduledAt
							? 'SCHEDULED'
							: 'DRAFT',
			},
			include: { recipients: true },
		})
		return NextResponse.json({ success: true, data: updated })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie zapisano kampanii.' },
			{ status: 500 }
		)
	}
}

export async function DELETE(_req, { params }) {
	try {
		const { id } = await params
		await db.smsCampaign.delete({ where: { id } })
		return NextResponse.json({ success: true })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie usunięto kampanii.' },
			{ status: 500 }
		)
	}
}
