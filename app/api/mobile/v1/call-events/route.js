import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/date'
import { authorizeMobileRequest, responseHeaders, validRequestId } from '@/lib/mobile-api'
import { db } from '@/lib/prisma'

const MAX_BODY_BYTES = 8192
const OUTCOMES = new Set([
	'interested',
	'follow_up_required',
	'not_interested',
	'wrong_number',
	'other',
])

function errorResponse(status, code, retryable, correlationId = null) {
	return NextResponse.json(
		{ result: 'error', error: { code, retryable }, correlationId },
		{ status, headers: responseHeaders() }
	)
}

function canonicalPayload(body) {
	return JSON.stringify({
		eventId: body.eventId,
		schemaVersion: body.schemaVersion,
		eventType: body.eventType,
		callRef: body.callRef,
		observedAt: body.observedAt,
		resolvedAt: body.resolvedAt,
		source: body.source,
		confidence: body.confidence,
		phoneNumber: body.phoneNumber ?? null,
		customerRef: body.customerRef ?? null,
		attributes: body.attributes,
	})
}

export async function POST(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured', true)
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized', false)
	if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
		return errorResponse(413, 'request_too_large', false)
	}

	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json', false)
	}
	const eventId = body?.eventId
	const idempotencyKey = request.headers.get('idempotency-key')
	const attributes = body?.attributes
	if (!validRequestId(eventId) || idempotencyKey !== eventId || !validRequestId(body?.callRef)) {
		return errorResponse(400, 'invalid_event_identity', false, eventId ?? null)
	}
	if (
		body.schemaVersion !== 1 ||
		body.eventType !== 'call_outcome' ||
		body.source !== 'android_post_call' ||
		body.confidence !== 'user_selected' ||
		!attributes ||
		!OUTCOMES.has(attributes.outcomeCode)
	) {
		return errorResponse(422, 'unsupported_event', false, eventId)
	}
	const observedAt = new Date(body.observedAt)
	const resolvedAt = new Date(body.resolvedAt)
	if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(resolvedAt.getTime())) {
		return errorResponse(400, 'invalid_timestamp', false, eventId)
	}
	const phone = typeof body.phoneNumber === 'string' ? normalizePhone(body.phoneNumber.trim()) : null
	const customerRef = typeof body.customerRef === 'string' ? body.customerRef.trim() : null
	const payloadHash = createHash('sha256').update(canonicalPayload(body)).digest('hex')

	try {
		const existing = await db.mobileCallEvent.findUnique({ where: { eventId } })
		if (existing) {
			if (existing.payloadHash !== payloadHash) {
				return errorResponse(409, 'idempotency_conflict', false, eventId)
			}
			return NextResponse.json(
				{ result: 'accepted', receiptId: existing.eventId, duplicate: true, correlationId: eventId },
				{ status: 200, headers: responseHeaders() }
			)
		}
		const customer = customerRef
			? await db.customer.findUnique({ where: { id: customerRef }, select: { id: true } })
			: phone
				? await db.customer.findUnique({ where: { phone }, select: { id: true } })
				: null
		const event = await db.mobileCallEvent.create({
			data: {
				eventId,
				callRef: body.callRef,
				schemaVersion: body.schemaVersion,
				eventType: body.eventType,
				source: body.source,
				confidence: body.confidence,
				observedAt,
				resolvedAt,
				disconnectCategory: String(attributes.disconnectCategory || '').slice(0, 32),
				durationBucket: String(attributes.durationBucket || '').slice(0, 32),
				outcomeCode: attributes.outcomeCode,
				phone: phone || null,
				payloadHash,
				customerId: customer?.id || null,
			},
			select: { eventId: true },
		})
		return NextResponse.json(
			{ result: 'accepted', receiptId: event.eventId, duplicate: false, correlationId: eventId },
			{ status: 201, headers: responseHeaders() }
		)
	} catch (error) {
		console.error('[mobile call event] failed', {
			event: 'mobile_call_event_failed',
			correlationId: eventId,
			errorType: error?.constructor?.name || 'UnknownError',
		})
		return errorResponse(500, 'server_error', true, eventId)
	}
}
