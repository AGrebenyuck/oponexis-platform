import { NextResponse } from 'next/server'
import { processGoogleAdsOfflineConversions } from '@/lib/google-ads-offline-conversions'

function authorized(request) {
	const secret = process.env.CRON_SECRET?.trim()
	if (!secret) return process.env.NODE_ENV !== 'production'
	return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request) {
	if (!authorized(request)) {
		return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
	}

	const result = await processGoogleAdsOfflineConversions(100)
	return NextResponse.json({ ok: true, ...result })
}
