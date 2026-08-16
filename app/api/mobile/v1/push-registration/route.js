import { NextResponse } from 'next/server'
import { authorizeMobileRequest, responseHeaders } from '@/lib/mobile-api'
import { db } from '@/lib/prisma'

const ALLOWED_APP_IDS = new Set([
	'com.oponexis.companion',
	'com.oponexis.companion.dev',
])

function errorResponse(status, code) {
	return NextResponse.json(
		{ result: 'error', error: { code, retryable: status >= 500 } },
		{ status, headers: responseHeaders() }
	)
}

export async function POST(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured')
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized')

	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json')
	}
	const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : ''
	const appId = typeof body?.appId === 'string' ? body.appId.trim() : ''
	if (installationId.length < 16 || installationId.length > 256 || !ALLOWED_APP_IDS.has(appId)) {
		return errorResponse(422, 'invalid_push_registration')
	}

	await db.mobilePushDevice.upsert({
		where: { installationId },
		create: { installationId, appId },
		update: { appId, enabled: true, lastSeenAt: new Date() },
	})
	return NextResponse.json({ result: 'ok' }, { headers: responseHeaders() })
}

export async function DELETE(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized')
	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json')
	}
	const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : ''
	if (!installationId) return errorResponse(422, 'invalid_push_registration')
	await db.mobilePushDevice.updateMany({ where: { installationId }, data: { enabled: false } })
	return NextResponse.json({ result: 'ok' }, { headers: responseHeaders() })
}
