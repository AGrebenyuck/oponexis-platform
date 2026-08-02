import { NextResponse } from 'next/server'
import { exportSmsGateInbox, smsGateConfigSummary } from '@/lib/sms/smsGateClient'

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}))
		const profile = body.profile || process.env.SMSGATE_CAMPAIGN_PROFILE
		const config = smsGateConfigSummary(profile)
		const until = body.until || new Date().toISOString()
		const since =
			body.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

		const data = await exportSmsGateInbox({
			profile,
			since,
			until,
			deviceId: config.deviceIdUsed ? config.deviceId : undefined,
		})

		console.info('[smsgate inbox export] requested', {
			profile: config.profile,
			since,
			until,
			deviceIdUsed: config.deviceIdUsed,
		})

		return NextResponse.json({
			success: true,
			data: {
				...data,
				since,
				until,
			},
		})
	} catch (error) {
		console.error('POST /api/admin/sms-gate/inbox-export failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie uruchomiono eksportu inbox.' },
			{ status: 500 }
		)
	}
}
