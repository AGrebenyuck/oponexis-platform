import { NextResponse } from 'next/server'
import { authorizeMobileRequest, responseHeaders, validRequestId } from '@/lib/mobile-api'
import { sendBookingFormSms } from '@/lib/sms/formSms'
import { sendSmsGateMessage, smsGateConfigured } from '@/lib/sms/smsGateClient'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'
import { normalizePhone } from '@/lib/date'
import { db } from '@/lib/prisma'

function errorResponse(status, code, retryable, correlationId = null, detail = '') {
	return NextResponse.json(
		{
			result: 'error',
			error: { code, retryable, ...(detail ? { detail } : {}) },
			correlationId,
		},
		{ status, headers: responseHeaders() }
	)
}

function safeErrorDetail(error) {
	const detail = String(error?.message || '').trim()
	return detail ? detail.slice(0, 240) : 'SMS Gateway odrzucił wiadomość.'
}

export async function POST(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured', true)
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized', false)
	if (!smsGateConfigured(process.env.SMSGATE_FORM_PROFILE)) {
		return errorResponse(503, 'sms_gateway_not_configured', true)
	}
	if (Number(request.headers.get('content-length') || 0) > 4096) {
		return errorResponse(413, 'request_too_large', false)
	}

	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json', false)
	}
	const requestId = body?.requestId
	if (!validRequestId(requestId)) return errorResponse(400, 'invalid_request_id', false)
	if (!['send_booking_form', 'send_custom_message'].includes(body?.action) ||
		typeof body?.phoneNumber !== 'string') {
		return errorResponse(422, 'unsupported_sms_action', false, requestId)
	}
	if (body.action === 'send_custom_message' &&
		(typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > 1000)) {
		return errorResponse(422, 'invalid_custom_message', false, requestId)
	}
	if (body.action === 'send_booking_form' &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(body.visitDate || '') ||
			!/^\d{2}:\d{2}$/.test(body.visitTime || ''))) {
		return errorResponse(422, 'appointment_time_required', false, requestId)
	}
	if (body.action === 'send_booking_form' && body.messageOverride != null &&
		(typeof body.messageOverride !== 'string' || body.messageOverride.trim().length > 1000)) {
		return errorResponse(422, 'invalid_message_override', false, requestId)
	}

	try {
		const profile = process.env.SMSGATE_FORM_PROFILE
		if (body.action === 'send_custom_message') {
			const phone = normalizePhone(body.phoneNumber)
			if (!phone) return errorResponse(422, 'invalid_phone', false, requestId)
			const message = body.message.trim()
			const sent = await sendSmsGateMessage({
				phone,
				text: message,
				customId: `mobile-${requestId}`.slice(0, 64),
				profile,
			})
			await createSmsContactEvent({
				direction: 'OUT',
				type: 'sms_sent_mobile',
				phone,
				message,
				providerMessageId: sent.id,
				raw: sent.raw,
			})
			return NextResponse.json(
				{ result: 'sent', receiptId: String(sent.id), receiptType: 'message', correlationId: requestId },
				{ status: 201, headers: responseHeaders() }
			)
		}

		const result = await sendBookingFormSms({
			phone: body.phoneNumber,
			name: body.displayName,
			mobileRequestId: requestId,
			profile,
			templateKey: 'booking_form',
			visitDate: body.visitDate,
			visitTime: body.visitTime,
			messageOverride: body.messageOverride,
		})
		return NextResponse.json(
			{
				result: 'sent',
				receiptId: String(result.entry.id),
				receiptType: 'form',
				duplicate: result.duplicate,
				correlationId: requestId,
			},
			{ status: result.duplicate ? 200 : 201, headers: responseHeaders() }
		)
	} catch (error) {
		const detail = safeErrorDetail(error)
		console.error('[mobile sms action] failed', {
			event: 'mobile_sms_action_failed',
			correlationId: requestId,
			errorType: error?.constructor?.name || 'UnknownError',
			errorCode: error?.code || 'sms_send_failed',
			gatewayStatus: error?.status || null,
			detail,
		})
		return errorResponse(
			502,
			error?.code || 'sms_send_failed',
			!error?.status || error.status === 429 || error.status >= 500,
			requestId,
			detail
		)
	}
}

function statusResponse(status, detail = null, updatedAt = null) {
	return NextResponse.json(
		{ result: 'ok', status, ...(detail ? { detail } : {}), ...(updatedAt ? { updatedAt } : {}) },
		{ headers: responseHeaders() }
	)
}

export async function GET(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured', true)
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized', false)

	const { searchParams } = new URL(request.url)
	const receiptId = searchParams.get('receiptId')?.trim()
	const receiptType = searchParams.get('receiptType')
	if (!receiptId || !['form', 'message'].includes(receiptType || '')) {
		return errorResponse(422, 'invalid_sms_receipt', false)
	}

	if (receiptType === 'form') {
		const id = Number(receiptId)
		if (!Number.isSafeInteger(id) || id < 1) return errorResponse(422, 'invalid_sms_receipt', false)
		const log = await db.smsFormLog.findUnique({ where: { id } })
		if (!log) return errorResponse(404, 'sms_receipt_not_found', false)
		return statusResponse(log.deliveryStatus || 'QUEUED', log.deliveryError, log.deliveryUpdatedAt?.toISOString())
	}

	const events = await db.smsContactEvent.findMany({
		where: { providerMessageId: receiptId },
		select: { type: true, message: true, occurredAt: true },
		orderBy: { occurredAt: 'desc' },
	})
	const latest = events.find(event => ['sms_delivered', 'sms_failed', 'sms_cancelled', 'sms_sent'].includes(event.type))
	const statusByType = {
		sms_delivered: 'DELIVERED',
		sms_failed: 'FAILED',
		sms_cancelled: 'CANCELLED',
		sms_sent: 'SENT',
	}
	return statusResponse(
		statusByType[latest?.type] || 'QUEUED',
		latest?.type === 'sms_failed' ? latest.message : null,
		latest?.occurredAt?.toISOString()
	)
}
