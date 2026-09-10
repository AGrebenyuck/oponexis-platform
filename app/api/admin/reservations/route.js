import { DateTime } from 'luxon'
import { NextResponse } from 'next/server'
import { upsertCustomerFromContact } from '@/lib/customer'
import { db } from '@/lib/prisma'
import { realWorkOrderWhere } from '@/lib/test-data'
import {
	sendWorkOrderToTelegram,
	updateIncompleteCompletionMessage,
	updateScheduleMessage,
} from '@/lib/telegram'
import { incompleteCompletionWhere } from '@/lib/work-order-queries'

const ZONE = 'Europe/Warsaw'

function parseVisitDate(value) {
	if (!value) return null
	const dt = DateTime.fromISO(String(value), { zone: ZONE }).startOf('day')
	return dt.isValid ? dt.toJSDate() : null
}

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url)
		const view = searchParams.get('view') || 'future'
		const today = DateTime.now().setZone(ZONE).startOf('day').toJSDate()
		const todayEnd = DateTime.now().setZone(ZONE).endOf('day').toJSDate()

		const workOrders = await db.workOrder.findMany({
			where:
				view === 'incomplete'
					? incompleteCompletionWhere(todayEnd)
					: view === 'past'
					? realWorkOrderWhere({
							OR: [
								{ visitDate: { lt: today } },
								{ completions: { some: { serviceUsed: { not: false } } } },
								{ status: 'completed' },
							],
					  })
					: realWorkOrderWhere({ visitDate: { gte: today } }),
			orderBy:
				view === 'past'
					? [{ visitDate: 'desc' }, { visitTime: 'desc' }, { createdAt: 'desc' }]
					: [{ visitDate: 'asc' }, { visitTime: 'asc' }, { createdAt: 'desc' }],
			include: {
				customer: true,
				completions: {
					where: { serviceUsed: { not: false } },
					orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
					take: 1,
				},
			},
			take: 200,
		})

		return NextResponse.json({
			success: true,
			data: {
				workOrders,
				reservations: [],
			},
		})
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 }
		)
	}
}

export async function PUT(req) {
	try {
		const body = await req.json()
		const id = Number(body.id)
		if (!id) {
			return NextResponse.json(
				{ success: false, error: 'Missing work order id' },
				{ status: 400 }
			)
		}

		const customer = await upsertCustomerFromContact({
			phone: body.phone,
			name: body.name,
			source: 'admin',
		})

		const updated = await db.workOrder.update({
			where: { id },
			data: {
				customerId: customer?.id || null,
				name: body.name,
				phone: body.phone,
				service: body.service || null,
				address: body.address || null,
				notes: body.notes || null,
				visitDate: parseVisitDate(body.visitDate),
				visitTime: body.visitTime || null,
			},
		})

		await updateScheduleMessage().catch(error =>
			console.error('[reservations put schedule]', error)
		)
		await updateIncompleteCompletionMessage().catch(error =>
			console.error('[reservations put incomplete tracker]', error)
		)

		return NextResponse.json({ success: true, data: updated })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 }
		)
	}
}

export async function POST(req) {
	try {
		const body = await req.json()
		if (!body.name || !body.phone) {
			return NextResponse.json(
				{ success: false, error: 'Name and phone are required' },
				{ status: 400 }
			)
		}

		const customer = await upsertCustomerFromContact({
			phone: body.phone,
			name: body.name,
			source: 'admin',
		})

		const created = await db.workOrder.create({
			data: {
				customerId: customer?.id || null,
				name: body.name,
				phone: body.phone,
				service:
					Array.isArray(body.selectedServiceNames) &&
					body.selectedServiceNames.length
						? body.selectedServiceNames.join(', ')
						: body.service || null,
				regNumber: body.regNumber || null,
				color: body.color || null,
				carModel: body.carModel || null,
				wheelRimSize: body.wheelRimSize || null,
				tireSize: body.tireSize || null,
				address: body.address || null,
				lat: typeof body.lat === 'number' ? body.lat : null,
				lng: typeof body.lng === 'number' ? body.lng : null,
				notes: body.notes || null,
				visitDate: parseVisitDate(body.visitDate),
				visitTime: body.visitTime || null,
			},
		})

		await sendWorkOrderToTelegram(created).catch(error =>
			console.error('[reservations post telegram]', error)
		)
		await updateScheduleMessage().catch(error =>
			console.error('[reservations post schedule]', error)
		)
		await updateIncompleteCompletionMessage().catch(error =>
			console.error('[reservations post incomplete tracker]', error)
		)

		return NextResponse.json({ success: true, data: created })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 }
		)
	}
}

export async function DELETE(req) {
	try {
		const { searchParams } = new URL(req.url)
		const id = Number(searchParams.get('id'))
		if (!id) {
			return NextResponse.json(
				{ success: false, error: 'Missing work order id' },
				{ status: 400 }
			)
		}

		await db.workOrder.update({
			where: { id },
			data: {
				status: 'cancelled',
				visitDate: null,
				visitTime: null,
			},
		})
		await db.workOrderCompletion.updateMany({
			where: { workOrderId: id },
			data: { serviceUsed: false },
		})
		await updateScheduleMessage().catch(error =>
			console.error('[reservations delete schedule]', error)
		)
		await updateIncompleteCompletionMessage().catch(error =>
			console.error('[reservations delete incomplete tracker]', error)
		)
		return NextResponse.json({ success: true })
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: error.message },
			{ status: 500 }
		)
	}
}
