import { NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/date'
import { authorizeMobileRequest, responseHeaders, validRequestId } from '@/lib/mobile-api'
import { db } from '@/lib/prisma'

const MAX_BODY_BYTES = 4096

function errorResponse(status, code, retryable, correlationId = null) {
	return NextResponse.json(
		{
			result: 'error',
			error: { code, retryable },
			correlationId,
		},
		{ status, headers: responseHeaders() }
	)
}

export async function POST(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') {
		return errorResponse(503, 'mobile_api_not_configured', false)
	}
	if (authorization !== 'authorized') {
		return errorResponse(401, 'unauthorized', false)
	}

	const contentLength = Number(request.headers.get('content-length') || 0)
	if (contentLength > MAX_BODY_BYTES) {
		return errorResponse(413, 'request_too_large', false)
	}

	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json', false)
	}

	const clientRequestId = body?.clientRequestId
	if (!validRequestId(clientRequestId)) {
		return errorResponse(400, 'invalid_request_id', false)
	}

	const rawPhone = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
	if (!rawPhone || rawPhone.length > 64) {
		return errorResponse(400, 'invalid_phone_number', false, clientRequestId)
	}
	const phone = normalizePhone(rawPhone)
	if (!phone || phone.length > 20) {
		return errorResponse(400, 'invalid_phone_number', false, clientRequestId)
	}

	try {
		const customer = await db.customer.findUnique({
			where: { phone },
			select: {
				id: true,
				name: true,
				workOrders: {
					orderBy: [{ visitDate: 'desc' }, { updatedAt: 'desc' }],
					take: 1,
					select: {
						phone: true,
						service: true,
						address: true,
						carModel: true,
						regNumber: true,
						wheelRimSize: true,
						tireSize: true,
					},
				},
			},
		})

		if (!customer) {
			return NextResponse.json(
				{
					result: 'not_found',
					match: null,
					correlationId: clientRequestId,
				},
				{ status: 200, headers: responseHeaders() }
			)
		}

		const previous = customer.workOrders[0] || null
		const savedDetails = previous
			? [
					previous.phone && `tel. ${previous.phone}`,
					previous.service && `usługa: ${previous.service}`,
					previous.address && `adres: ${previous.address}`,
					[previous.carModel, previous.regNumber].filter(Boolean).join(' '),
					previous.wheelRimSize && `felgi: ${previous.wheelRimSize}`,
					previous.tireSize && `opony: ${previous.tireSize}`,
				]
					.filter(Boolean)
					.map(value => `• ${value}`)
					.join('\n')
			: null
		return NextResponse.json(
			{
				result: 'matched',
				match: {
					customerRef: customer.id,
					displayName: customer.name?.trim() || null,
					isReturningCustomer: Boolean(previous),
					savedDetails,
					lastVisit: previous
						? {
							phone: previous.phone,
							service: previous.service,
							address: previous.address,
							carModel: previous.carModel,
							regNumber: previous.regNumber,
							wheelRimSize: previous.wheelRimSize,
							tireSize: previous.tireSize,
						}
						: null,
				},
				correlationId: clientRequestId,
			},
			{ status: 200, headers: responseHeaders() }
		)
	} catch (error) {
		console.error('[mobile caller lookup] failed', {
			event: 'mobile_caller_lookup_failed',
			correlationId: clientRequestId,
			errorType: error?.constructor?.name || 'UnknownError',
			errorCode: typeof error?.code === 'string' ? error.code : null,
			detail: error instanceof Error ? error.message : String(error),
		})
		return errorResponse(500, 'server_error', true, clientRequestId)
	}
}
