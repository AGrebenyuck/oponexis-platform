import { NextResponse } from 'next/server'
import { authorizeMobileRequest, responseHeaders, validRequestId } from '@/lib/mobile-api'
import {
	checkSmsGateConnection,
	smsGateConfigured,
} from '@/lib/sms/smsGateClient'
import { companionSmsEnabled, getPrimaryCompanionDevice } from '@/lib/sms/companionSmsClient'
import { db } from '@/lib/prisma'

function errorResponse(status, code, retryable, correlationId) {
	return NextResponse.json(
		{
			result: 'error',
			error: { code, retryable },
			correlationId,
		},
		{ status, headers: responseHeaders() }
	)
}

export async function GET(request) {
	const authorization = authorizeMobileRequest(request)
	const requestedCorrelationId = request.headers.get('x-correlation-id')
	const correlationId = validRequestId(requestedCorrelationId)
		? requestedCorrelationId
		: crypto.randomUUID()

	if (authorization === 'not_configured') {
		return errorResponse(503, 'mobile_api_not_configured', true, correlationId)
	}
	if (authorization !== 'authorized') {
		return errorResponse(401, 'unauthorized', false, correlationId)
	}

	if (companionSmsEnabled()) {
		const device = await getPrimaryCompanionDevice()
		if (!device) return errorResponse(503, 'companion_sms_device_not_registered', true, correlationId)
		return NextResponse.json({
			result: 'ok',
			status: 'ready',
			profile: 'companion',
			deviceIdConfigured: true,
			deviceIdUsed: true,
			simNumber: device.simSlot,
			phoneNumber: device.phoneNumber,
			deviceName: device.label || [device.manufacturer, device.model].filter(Boolean).join(' ') || 'Oponexis Companion',
			deviceLastSeen: device.lastSeenAt.toISOString(),
			deviceAgeSeconds: Math.max(0, Math.round((Date.now() - device.lastSeenAt.getTime()) / 1000)),
			checkedAt: new Date().toISOString(),
			correlationId,
		}, { headers: responseHeaders() })
	}

	const profile = process.env.SMSGATE_FORM_PROFILE
	if (!smsGateConfigured(profile)) {
		return errorResponse(503, 'sms_gateway_not_configured', true, correlationId)
	}

	try {
		const data = await checkSmsGateConnection(profile, {
			signal: AbortSignal.timeout(4_500),
		})
		return NextResponse.json(
			{
				result: 'ok',
				status: 'ready',
				profile: data.profile,
				deviceIdConfigured: data.deviceIdConfigured,
				deviceIdUsed: data.deviceIdUsed,
				simNumber: data.simNumber,
				phoneNumber: data.senderPhone,
				deviceName: data.deviceName,
				deviceLastSeen: data.deviceLastSeen,
				deviceAgeSeconds: data.deviceAgeSeconds,
				checkedAt: new Date().toISOString(),
				correlationId,
			},
			{ headers: responseHeaders() }
		)
	} catch (error) {
		const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
		const errorCode = timeout
			? 'sms_gateway_timeout'
			: error?.code || 'sms_gateway_unavailable'
		console.error('[mobile sms gateway health] failed', {
			event: 'mobile_sms_gateway_health_failed',
			correlationId,
			errorType: error?.constructor?.name || 'UnknownError',
			errorCode,
		})
		return errorResponse(
			503,
			errorCode,
			true,
			correlationId
		)
	}
}
