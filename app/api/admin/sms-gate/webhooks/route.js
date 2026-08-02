import { NextResponse } from 'next/server'
import {
	listSmsGateWebhooks,
	registerSmsGateWebhook,
	smsGateConfigSummary,
} from '@/lib/sms/smsGateClient'

const DEFAULT_EVENTS = ['sms:received', 'sms:sent', 'sms:delivered', 'sms:failed']

function getWebhookUrl() {
	const base = process.env.CRM_PUBLIC_URL || process.env.NEXT_PUBLIC_CRM_API_URL
	if (!base) {
		throw new Error('Brak CRM_PUBLIC_URL w .env CRM.')
	}
	return new URL('/api/public/sms/webhook', base).toString()
}

function webhookEvent(item) {
	return item?.event || item?.eventType || item?.type || ''
}

function webhookUrl(item) {
	return item?.url || item?.endpoint || item?.targetUrl || ''
}

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url)
		const profile = searchParams.get('profile') || process.env.SMSGATE_CAMPAIGN_PROFILE
		const data = await listSmsGateWebhooks(profile)
		return NextResponse.json({
			success: true,
			data: {
				...data,
				targetUrl: getWebhookUrl(),
			},
		})
	} catch (error) {
		console.error('GET /api/admin/sms-gate/webhooks failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie pobrano webhooków SMSGate.' },
			{ status: 500 }
		)
	}
}

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}))
		const profile = body.profile || process.env.SMSGATE_CAMPAIGN_PROFILE
		const events = Array.isArray(body.events) && body.events.length ? body.events : DEFAULT_EVENTS
		const targetUrl = body.url || getWebhookUrl()
		const config = smsGateConfigSummary(profile)
		const current = await listSmsGateWebhooks(profile)
		const existingWebhooks = current.webhooks || []
		const registered = []
		const skipped = []

		for (const event of events) {
			const alreadyExists = existingWebhooks.some(item => {
				return webhookUrl(item) === targetUrl && webhookEvent(item) === event
			})
			if (alreadyExists) {
				skipped.push(event)
				continue
			}
			const result = await registerSmsGateWebhook({
				profile,
				url: targetUrl,
				event,
				deviceId: config.deviceIdUsed ? config.deviceId : undefined,
			})
			registered.push({ event, webhook: result.webhook })
		}

		console.info('[smsgate webhooks] ensured', {
			profile: config.profile,
			targetUrl,
			registered: registered.map(item => item.event),
			skipped,
			deviceIdUsed: config.deviceIdUsed,
		})

		return NextResponse.json({
			success: true,
			data: {
				profile: config.profile,
				targetUrl,
				registered,
				skipped,
				deviceIdUsed: config.deviceIdUsed,
			},
		})
	} catch (error) {
		console.error('POST /api/admin/sms-gate/webhooks failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie zarejestrowano webhooków SMSGate.' },
			{ status: 500 }
		)
	}
}
