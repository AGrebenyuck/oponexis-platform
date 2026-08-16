import { NextResponse } from 'next/server'
import { authorizeMobileRequest, responseHeaders } from '@/lib/mobile-api'
import { smsActivityStatus } from '@/lib/mobile-push'
import { getSmsGateMessageStatus } from '@/lib/sms/smsGateClient'
import { recordSmsDeliveryEvent } from '@/lib/sms/smsContactEvents'
import { db } from '@/lib/prisma'

const TERMINAL_STATES = new Set(['SENT', 'DELIVERED', 'FAILED', 'CANCELLED'])

function errorResponse(status, code) {
	return NextResponse.json(
		{ result: 'error', error: { code, retryable: status >= 500 } },
		{ status, headers: responseHeaders() }
	)
}

function sourceFor(type) {
	if (type.includes('reminder')) return 'REMINDER'
	if (type.includes('form_completed')) return 'FORM_COMPLETED'
	if (type.includes('booking_form')) return 'BOOKING_FORM'
	if (type.includes('campaign')) return 'CAMPAIGN'
	if (type.includes('mobile')) return 'COMPANION'
	return 'PLATFORM'
}

function preferredProfile(type) {
	return type.includes('campaign')
		? process.env.SMSGATE_CAMPAIGN_PROFILE
		: process.env.SMSGATE_FORM_PROFILE
}

async function liveGatewayStatus(messageId, type) {
	const profiles = [...new Set([preferredProfile(type), 'work', 'test'].filter(Boolean))]
	for (const profile of profiles) {
		try {
			return await getSmsGateMessageStatus(messageId, { profile })
		} catch (error) {
			if (!String(error?.message || '').toLowerCase().includes('message not found')) throw error
		}
	}
	return null
}

async function reconcileQueuedMessage(providerMessageId) {
	if (!providerMessageId || providerMessageId.length > 100) return
	const latest = await db.smsContactEvent.findFirst({
		where: { providerMessageId, direction: 'OUT' },
		select: { type: true, phone: true },
		orderBy: { occurredAt: 'desc' },
	})
	if (!latest || TERMINAL_STATES.has(smsActivityStatus(latest))) return

	try {
		const current = await liveGatewayStatus(providerMessageId, latest.type)
		const state = String(current?.state || '').toUpperCase()
		if (!TERMINAL_STATES.has(state)) return
		const timestampKey = {
			SENT: 'sentAt',
			DELIVERED: 'deliveredAt',
			FAILED: 'failedAt',
			CANCELLED: 'cancelledAt',
		}[state]
		await recordSmsDeliveryEvent({
			event: `sms:${state.toLowerCase()}`,
			payload: {
				messageId: providerMessageId,
				recipient: latest.phone,
				reason: current.reason,
				[timestampKey]: new Date().toISOString(),
			},
			raw: { source: 'mobile_status_reconciliation', gateway: current.raw },
		})
	} catch (error) {
		console.warn('[mobile sms activity] reconciliation failed', {
			errorType: error?.constructor?.name || 'UnknownError',
		})
	}
}

export async function GET(request) {
	const authorization = authorizeMobileRequest(request)
	if (authorization === 'not_configured') return errorResponse(503, 'mobile_api_not_configured')
	if (authorization !== 'authorized') return errorResponse(401, 'unauthorized')

	const { searchParams } = new URL(request.url)
	await reconcileQueuedMessage(searchParams.get('reconcileProviderMessageId')?.trim())

	const events = await db.smsContactEvent.findMany({
		where: {
			direction: 'OUT',
			type: { startsWith: 'sms_' },
		},
		select: {
			id: true,
			type: true,
			phone: true,
			providerMessageId: true,
			occurredAt: true,
			message: true,
			direction: true,
		},
		orderBy: { occurredAt: 'desc' },
		take: 100,
	})

	return NextResponse.json({
		result: 'ok',
		items: events.map(event => ({
			id: event.id,
			providerMessageId: event.providerMessageId,
			status: smsActivityStatus(event),
			source: sourceFor(event.type),
			phone: event.phone,
			detail: event.type === 'sms_failed' ? event.message : null,
			occurredAt: event.occurredAt.toISOString(),
		})),
	}, { headers: responseHeaders() })
}
