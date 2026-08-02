import { NextResponse, after } from 'next/server'
import { upsertCustomerFromContact } from '@/lib/customer'
import { normalizeCustomerSource } from '@/lib/customer-sources'
import { normalizeOptionalText, normalizePhone, parseYmdToUtcDate } from '@/lib/date'
import { db } from '@/lib/prisma'
import {
	getCustomCompletionQuestions,
	normalizeCustomAnswerValue,
	saveCustomCompletionAnswers,
} from '@/lib/completion-form-questions'
import {
	updateIncompleteCompletionMessage,
	updateScheduleMessage,
	updateWorkOrderMessage,
} from '@/lib/telegram'

function parseAmount(value) {
	const amount = Number(String(value || '').replace(',', '.'))
	return Number.isFinite(amount) ? amount : null
}

function boolOrNull(value) {
	if (value === true || value === 'true') return true
	if (value === false || value === 'false') return false
	return null
}

function trimTrailingSlash(value) {
	return String(value || '').replace(/\/+$/, '')
}

function getRedirectOrigin(req) {
	const forwardedHost = req.headers.get('x-forwarded-host')
	const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
	const host = forwardedHost || req.headers.get('host') || ''
	const publicUrl = trimTrailingSlash(process.env.CRM_PUBLIC_URL)

	if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
		return `${forwardedProto}://${host}`
	}

	if (publicUrl) return publicUrl

	return new URL(req.url).origin
}

function completionRedirectUrl(req, orderId) {
	return new URL(
		`/work-order-complete?id=${orderId}&saved=1`,
		getRedirectOrigin(req)
	)
}

async function parseBody(req) {
	const contentType = req.headers.get('content-type') || ''
	if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
		const form = await req.formData()
		const customQuestions = await getCustomCompletionQuestions({ activeOnly: true })
		const customAnswers = Object.fromEntries(
			customQuestions.map(question => [
				question.id,
				normalizeCustomAnswerValue(question, form),
			])
		)

		return {
			name: form.get('name') || '',
			gender: form.get('gender') || '',
			phone: form.get('phone') || '',
			source: form.get('source') || '',
			car: form.get('car') || '',
			serviceUsed: form.get('serviceUsed') || '',
			completedAt: form.get('completedAt') || '',
			serviceNames: form.getAll('serviceNames').map(String),
			amount: form.get('amount') || '',
			invoiceIssued: form.get('invoiceIssued') || '',
			paymentMethod: form.get('paymentMethod') || '',
			notes: form.get('notes') || '',
			customQuestions,
			customAnswers,
		}
	}

	return req.json()
}

async function getOrder(rawId) {
	const id = Number(rawId)
	if (!Number.isInteger(id)) return null
	return db.workOrder.findUnique({
		where: { id },
		include: {
			customer: {
				include: {
					_count: { select: { completions: true, workOrders: true } },
				},
			},
			lead: true,
			completions: {
				orderBy: { createdAt: 'desc' },
				take: 1,
				include: { customAnswers: true },
			},
		},
	})
}

export async function GET(_req, { params }) {
	try {
		const { id } = await params
		const order = await getOrder(id)
		if (!order) {
			return NextResponse.json(
				{ ok: false, error: 'Nie znaleziono zlecenia.' },
				{ status: 404 }
			)
		}

		return NextResponse.json({
			ok: true,
			order,
			completion: order.completions?.[0] || null,
		})
	} catch (error) {
		console.error('GET /api/work-orders/[id]/completion failed:', error)
		return NextResponse.json(
			{ ok: false, error: 'Blad ladowania formularza.' },
			{ status: 500 }
		)
	}
}

export async function POST(req, { params }) {
	try {
		const { id } = await params
		const order = await getOrder(id)
		if (!order) {
			return NextResponse.json(
				{ ok: false, error: 'Nie znaleziono zlecenia.' },
				{ status: 404 }
			)
		}

		const body = await parseBody(req)
		if (!body.customQuestions) {
			body.customQuestions = await getCustomCompletionQuestions({ activeOnly: true })
			body.customAnswers = body.customAnswers || {}
		}
		const normalizedPhone = normalizePhone(body.phone) || order.phone
		const serviceUsed = boolOrNull(body.serviceUsed)
		const completedAt = parseYmdToUtcDate(body.completedAt) || order.visitDate
		const source =
			normalizeCustomerSource(body.source) ||
			(order.leadId ? 'Strona internetowa' : null)
		const serviceNames = Array.isArray(body.serviceNames)
			? body.serviceNames.map(String).filter(Boolean)
			: String(body.serviceNames || order.service || '')
					.split(',')
					.map(item => item.trim())
					.filter(Boolean)

		if (!normalizedPhone) {
			return NextResponse.json(
				{ ok: false, error: 'Brak telefonu klienta.' },
				{ status: 400 }
			)
		}
		if (!source) {
			return NextResponse.json(
				{ ok: false, error: 'Wybierz źródło klienta.' },
				{ status: 400 }
			)
		}

		const customer = await upsertCustomerFromContact({
			phone: normalizedPhone,
			name: body.name || order.name,
			gender: body.gender,
			source,
		})

		const { customQuestions, ...rawBody } = body
		const payload = {
			customerId: customer?.id || order.customerId || null,
			workOrderId: order.id,
			formSubmittedAt: new Date(),
			completedAt,
			name: normalizeOptionalText(body.name) || order.name,
			phone: normalizedPhone,
			gender: normalizeOptionalText(body.gender),
			source,
			car:
				normalizeOptionalText(body.car) ||
				[order.carModel, order.regNumber].filter(Boolean).join(' / ') ||
				null,
			serviceUsed,
			serviceNames,
			amount: parseAmount(body.amount),
			invoiceIssued: boolOrNull(body.invoiceIssued),
			paymentMethod: normalizeOptionalText(body.paymentMethod),
			notes: normalizeOptionalText(body.notes),
			importSource: 'internal_form',
			isTest: false,
			rawData: rawBody,
		}

		const existing = await db.workOrderCompletion.findFirst({
			where: { workOrderId: order.id, importSource: 'internal_form' },
			orderBy: { createdAt: 'desc' },
		})

		const completion = existing
			? await db.workOrderCompletion.update({
					where: { id: existing.id },
					data: payload,
			  })
			: await db.workOrderCompletion.create({ data: payload })

		await saveCustomCompletionAnswers(
			completion.id,
			customQuestions,
			body.customAnswers || {}
		)

		const updatedOrder = await db.workOrder.update({
			where: { id: order.id },
			data: {
				customerId: customer?.id || order.customerId,
				status:
					serviceUsed === false
						? 'cancelled'
						: serviceUsed === true
						? 'completed'
						: order.status,
			},
		})

		after(async () => {
			await updateWorkOrderMessage(updatedOrder).catch(error =>
				console.error('[completion telegram update]', error)
			)
			await updateScheduleMessage().catch(error =>
				console.error('[completion schedule update]', error)
			)
			await updateIncompleteCompletionMessage().catch(error =>
				console.error('[completion incomplete tracker update]', error)
			)
		})

		const { searchParams } = new URL(req.url)
		if (searchParams.get('redirect')) {
			return NextResponse.redirect(completionRedirectUrl(req, order.id), 303)
		}

		return NextResponse.json({ ok: true, completion })
	} catch (error) {
		console.error('POST /api/work-orders/[id]/completion failed:', error)
		return NextResponse.json(
			{ ok: false, error: error.message || 'Nie udalo sie zapisac.' },
			{ status: 500 }
		)
	}
}
