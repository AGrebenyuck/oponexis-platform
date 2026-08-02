import { NextResponse } from 'next/server'
import {
	recordIncomingSms,
	recordSmsDeliveryEvent,
} from '@/lib/sms/smsContactEvents'

function validSecret(req) {
	const expected = process.env.SMSGATE_WEBHOOK_SECRET
	if (!expected) return true

	const { searchParams } = new URL(req.url)
	const provided =
		req.headers.get('x-smsgate-secret') ||
		req.headers.get('x-webhook-secret') ||
		searchParams.get('secret')

	return provided === expected
}

function pickValue(source, keys) {
	for (const key of keys) {
		if (source?.[key] !== undefined && source?.[key] !== null) return source[key]
	}
	return null
}

export async function GET(req) {
	if (!validSecret(req)) {
		return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
	}

	return NextResponse.json({
		ok: true,
		name: 'Oponexis SMSGate webhook',
		method: 'POST',
		events: ['sms:received', 'sms:sent', 'sms:delivered', 'sms:failed', 'sms:cancelled'],
	})
}

export async function POST(req) {
	try {
		if (!validSecret(req)) {
			return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
		}

		const body = await req.json()
		const event = body?.event
		const payload = body?.payload || body?.message || body?.data || body || {}
		const messageId = pickValue(payload, ['messageId', 'id']) || body?.id
		const sender = pickValue(payload, ['sender', 'from', 'phoneNumber', 'address'])
		const recipient = pickValue(payload, ['recipient', 'to', 'devicePhone'])
		const message = pickValue(payload, ['message', 'text', 'content', 'contentPreview', 'body'])
		const receivedAt =
			pickValue(payload, ['receivedAt', 'createdAt', 'date', 'timestamp']) ||
			body?.createdAt

		console.info('[smsgate webhook] received', {
			event,
			deviceId: body?.deviceId || null,
			webhookId: body?.webhookId || null,
			messageId: messageId || null,
			sender: sender || null,
			recipient: recipient || null,
			payloadKeys: Object.keys(payload || {}),
		})

		if (event === 'sms:received') {
			const result = await recordIncomingSms({
				sender,
				recipientPhone: recipient,
				message,
				messageId,
				receivedAt,
				raw: body,
			})
			return NextResponse.json({
				ok: true,
				eventId: result.event?.id || null,
				recipientId: result.recipient?.id || null,
			})
		}

		if (['sms:sent', 'sms:delivered', 'sms:failed', 'sms:cancelled'].includes(event)) {
			const saved = await recordSmsDeliveryEvent({ event, payload, raw: body })
			return NextResponse.json({ ok: true, eventId: saved?.id || null })
		}

		return NextResponse.json({ ok: true, ignored: true })
	} catch (error) {
		console.error('[smsgate webhook] failed', {
			error: error?.message || String(error),
			stack: error?.stack || null,
		})
		return NextResponse.json(
			{ ok: false, error: error.message || 'Webhook error' },
			{ status: 500 }
		)
	}
}

export async function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, x-smsgate-secret, x-webhook-secret',
		},
	})
}
