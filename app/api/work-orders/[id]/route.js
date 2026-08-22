import { db } from '@/lib/prisma'
import { sendAppointmentChangedSms } from '@/lib/sms/formSms'
import { upsertCustomerFromContact } from '@/lib/customer'
import {
	updateIncompleteCompletionMessage,
	updateScheduleMessage,
	updateWorkOrderMessage,
} from '@/lib/telegram'
import { DateTime } from 'luxon'
import { NextResponse } from 'next/server'

const ZONE = 'Europe/Warsaw'

function parseVisitDate(str) {
	if (!str) return null
	const dt = DateTime.fromISO(String(str), { zone: ZONE }).startOf('day')
	return dt.isValid ? dt.toJSDate() : null
}

function visitLabel(date, time) {
	if (!date || !time) return null
	const formatted = DateTime.fromJSDate(date, { zone: ZONE }).toFormat('dd.LL.yyyy')
	return `${formatted}, ${time}`
}

async function findWorkOrderById(rawId) {
	const id = Number(rawId)
	if (!Number.isNaN(id)) {
		return db.workOrder.findUnique({ where: { id } })
	}

	return null
}

export async function GET(req, ctx) {
	try {
		const params = await ctx.params
		const rawId = params?.id
		if (!rawId) {
			return NextResponse.json(
				{ ok: false, error: 'Missing id param' },
				{ status: 400 }
			)
		}

		const order = await findWorkOrderById(rawId)
		if (!order) {
			return NextResponse.json(
				{ ok: false, error: 'Work order not found' },
				{ status: 404 }
			)
		}

		return NextResponse.json({ ok: true, order })
	} catch (error) {
		console.error('GET /api/work-orders/[id] failed:', error)
		return NextResponse.json(
			{ ok: false, error: 'Server error' },
			{ status: 500 }
		)
	}
}

export async function PUT(req, ctx) {
	try {
		const params = await ctx.params
		const rawId = params?.id
		if (!rawId) {
			return NextResponse.json(
				{ ok: false, error: 'Missing id param' },
				{ status: 400 }
			)
		}

		const existing = await findWorkOrderById(rawId)
		if (!existing) {
			return NextResponse.json(
				{ ok: false, error: 'Work order not found' },
				{ status: 404 }
			)
		}

		const incoming = await req.json()
		const nextVisitDate =
			typeof incoming.visitDate === 'string'
				? parseVisitDate(incoming.visitDate)
				: existing.visitDate
		const nextVisitTime = incoming.visitTime ?? existing.visitTime
		const previousVisit = visitLabel(existing.visitDate, existing.visitTime)
		const nextVisit = visitLabel(nextVisitDate, nextVisitTime)
		const appointmentChanged = Boolean(previousVisit && nextVisit && previousVisit !== nextVisit)
		const nextAddress = incoming.address ?? existing.address
		const addressChanged =
			typeof incoming.address === 'string' &&
			incoming.address.trim() !== (existing.address || '').trim()

		const nextPhone = incoming.phone ?? existing.phone
		const nextName = incoming.name ?? existing.name
		const customer = await upsertCustomerFromContact({
			phone: nextPhone,
			name: nextName,
			source: 'work_order',
		})

		const updated = await db.workOrder.update({
			where: { id: existing.id },
			data: {
				customerId: customer?.id || existing.customerId,
				name: nextName,
				phone: nextPhone,
				service: incoming.service ?? existing.service,
				regNumber: incoming.regNumber ?? existing.regNumber,
				color: incoming.color ?? existing.color,
				carModel: incoming.carModel ?? existing.carModel,
				address: nextAddress,
				notes: incoming.notes ?? existing.notes,
				lat:
					typeof incoming.lat === 'number'
						? incoming.lat
						: addressChanged
						? null
						: existing.lat,
				lng:
					typeof incoming.lng === 'number'
						? incoming.lng
						: addressChanged
						? null
						: existing.lng,
				visitTime: nextVisitTime,
				visitDate: nextVisitDate,
				wheelRimSize: incoming.wheelRimSize ?? existing.wheelRimSize,
				tireSize: incoming.tireSize ?? existing.tireSize,
				wantsInvoice:
					typeof incoming.wantsInvoice === 'boolean'
						? incoming.wantsInvoice
						: existing.wantsInvoice,
				invoiceNip: incoming.invoiceNip ?? existing.invoiceNip,
				invoiceEmail: incoming.invoiceEmail ?? existing.invoiceEmail,
			},
		})

		await updateWorkOrderMessage(updated)
		await updateScheduleMessage()
		await updateIncompleteCompletionMessage()
		if (appointmentChanged) {
			await sendAppointmentChangedSms({
				phone: updated.phone,
				name: updated.name,
				previousVisit,
				nextVisit,
				workOrderId: updated.id,
				profile: process.env.SMSGATE_FORM_PROFILE,
			}).catch(error =>
				console.error('[work-order appointment change sms]', {
					workOrderId: updated.id,
					errorCode: error?.code || null,
					errorType: error?.constructor?.name || 'UnknownError',
				})
			)
		}

		return NextResponse.json({ ok: true, order: updated })
	} catch (error) {
		console.error('PUT /api/work-orders/[id] failed:', error)
		return NextResponse.json(
			{ ok: false, error: 'Server error' },
			{ status: 500 }
		)
	}
}

export async function DELETE(_req, ctx) {
	try {
		const params = await ctx.params
		const rawId = params?.id
		const existing = await findWorkOrderById(rawId)
		if (!existing) {
			return NextResponse.json(
				{ ok: false, error: 'Work order not found' },
				{ status: 404 }
			)
		}

		const updated = await db.workOrder.update({
			where: { id: existing.id },
			data: {
				status: 'cancelled',
				visitDate: null,
				visitTime: null,
			},
		})
		await db.workOrderCompletion.updateMany({
			where: { workOrderId: existing.id },
			data: { serviceUsed: false },
		})

		await updateWorkOrderMessage(updated).catch(error =>
			console.error('[work-order delete telegram]', error)
		)
		await updateScheduleMessage().catch(error =>
			console.error('[work-order delete schedule]', error)
		)
		await updateIncompleteCompletionMessage().catch(error =>
			console.error('[work-order delete incomplete tracker]', error)
		)

		return NextResponse.json({ ok: true, order: updated })
	} catch (error) {
		console.error('DELETE /api/work-orders/[id] failed:', error)
		return NextResponse.json(
			{ ok: false, error: 'Server error' },
			{ status: 500 }
		)
	}
}
