import { jsonCors, optionsCors } from '@/lib/cors'
import { smsGateConfigSummary, smsGateConfigured } from '@/lib/sms/smsGateClient'

function cleanText(value) {
	return String(value || '').trim()
}

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url)
		const profile = cleanText(
			searchParams.get('profile') || process.env.SMSGATE_FORM_PROFILE
		)
		const config = smsGateConfigSummary(profile)

		return jsonCors({
			ok: true,
			data: {
				profile: config.profile,
				configured: smsGateConfigured(profile),
				deviceId: config.deviceId,
				deviceIdUsed: config.deviceIdUsed,
				senderPhone: config.senderPhone,
				simNumber: config.simNumber,
			},
		})
	} catch (error) {
		console.error('/api/public/sms/gate-profile failed:', {
			error: error?.message || String(error),
		})
		return jsonCors({ ok: false, error: 'Server error' }, { status: 500 })
	}
}

export async function OPTIONS() {
	return optionsCors('GET, OPTIONS')
}
