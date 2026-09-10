import { NextResponse } from 'next/server'
import { authorizeMobileRequest, responseHeaders } from '@/lib/mobile-api'
import { db } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { companionProviderMessageId } from '@/lib/sms/companionSmsClient'
import { recordIncomingSms, recordSmsDeliveryEvent } from '@/lib/sms/smsContactEvents'

const CLAIM_LIMIT = 20
const CLAIM_TTL_MS = 5 * 60 * 1000
const REPORT_STATUSES = new Set(['SENT', 'DELIVERED', 'FAILED'])

function errorResponse(status, code, retryable = status >= 500) {
	return NextResponse.json(
		{ result: 'error', error: { code, retryable } },
		{ status, headers: responseHeaders() }
	)
}

function installationId(request) {
	return String(request.headers.get('x-installation-id') || '').trim()
}

async function activeDevice(request) {
	const id = installationId(request)
	if (id.length < 16 || id.length > 256) return null
	return db.mobilePushDevice.findFirst({
		where: { installationId: id, enabled: true },
		select: { id: true, installationId: true },
	})
}

export async function GET(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured')
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized', false)
	const device = await activeDevice(request)
	if (!device) return errorResponse(403, 'unregistered_device', false)

	const now = new Date()
	const expiredAt = new Date(now.getTime() - CLAIM_TTL_MS)
	const items = await db.$queryRaw(Prisma.sql`
		WITH candidates AS (
			SELECT "id"
			FROM "MobileSmsDispatch"
			WHERE (
				"status" = 'QUEUED'
				OR ("status" = 'CLAIMED' AND "claimedAt" < ${expiredAt})
			)
			AND ("deviceId" IS NULL OR "deviceId" = ${device.id})
			ORDER BY "createdAt" ASC
			FOR UPDATE SKIP LOCKED
			LIMIT ${CLAIM_LIMIT}
		)
		UPDATE "MobileSmsDispatch" AS dispatch
		SET "status" = 'CLAIMED',
			"claimedBy" = ${device.installationId},
			"claimedAt" = ${now},
			"attemptCount" = dispatch."attemptCount" + 1,
			"updatedAt" = ${now}
		FROM candidates
		WHERE dispatch."id" = candidates."id"
		RETURNING dispatch.*
	`)

	return NextResponse.json({
		result: 'ok',
		items: items.map(item => ({
			id: item.id,
			providerMessageId: companionProviderMessageId(item.id),
			phone: item.phone,
			message: item.message,
			source: item.source,
			attempt: item.attemptCount,
			createdAt: item.createdAt.toISOString(),
		})),
	}, { headers: responseHeaders() })
}

export async function POST(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured')
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized', false)
	const device = await activeDevice(request)
	if (!device) return errorResponse(403, 'unregistered_device', false)

	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json', false)
	}

	if (body?.event === 'incoming') {
		const sender = String(body.sender || '').trim()
		const message = String(body.message || '')
		const messageId = String(body.messageId || '').trim()
		if (!sender || !messageId || message.length > 5000) {
			return errorResponse(422, 'invalid_incoming_sms', false)
		}
		const result = await recordIncomingSms({
			sender,
			recipientPhone: body.recipientPhone,
			message,
			messageId: `cmp-in:${messageId}`,
			receivedAt: body.receivedAt,
			raw: { provider: 'companion', installationId: device.installationId },
		})
		return NextResponse.json({ result: 'ok', eventId: result.event.id }, { headers: responseHeaders() })
	}

	const id = String(body?.id || '').trim()
	const status = String(body?.status || '').trim().toUpperCase()
	const detail = String(body?.detail || '').trim().slice(0, 500) || null
	if (!id || !REPORT_STATUSES.has(status)) return errorResponse(422, 'invalid_sms_report', false)

	const current = await db.mobileSmsDispatch.findUnique({ where: { id } })
	if (!current) return errorResponse(404, 'sms_dispatch_not_found', false)
	if (current.claimedBy && current.claimedBy !== device.installationId) {
		return errorResponse(409, 'sms_dispatch_claimed_by_another_device', false)
	}
	if (current.status === 'DELIVERED') {
		return NextResponse.json({ result: 'ok', status: current.status }, { headers: responseHeaders() })
	}

	const occurredAt = new Date()
	const dispatch = await db.mobileSmsDispatch.update({
		where: { id },
		data: {
			status,
			error: status === 'FAILED' ? detail || 'Direct SMS send failed' : null,
			sentAt: status === 'SENT' || status === 'DELIVERED' ? (current.sentAt || occurredAt) : undefined,
			deliveredAt: status === 'DELIVERED' ? occurredAt : undefined,
			failedAt: status === 'FAILED' ? occurredAt : undefined,
		},
	})
	await db.mobilePushDevice.update({
		where: { id: device.id },
		data: { lastSeenAt: occurredAt, lastSmsAt: occurredAt },
	})
	const timestampKey = status === 'DELIVERED' ? 'deliveredAt' : status === 'FAILED' ? 'failedAt' : 'sentAt'
	await recordSmsDeliveryEvent({
		event: `sms:${status.toLowerCase()}`,
		payload: {
			messageId: companionProviderMessageId(dispatch.id),
			recipient: dispatch.phone,
			reason: dispatch.error,
			[timestampKey]: occurredAt.toISOString(),
		},
		raw: { provider: 'companion', installationId: device.installationId, source: dispatch.source },
	})
	return NextResponse.json({ result: 'ok', status: dispatch.status }, { headers: responseHeaders() })
}
