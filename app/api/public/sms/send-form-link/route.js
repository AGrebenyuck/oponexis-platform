import { jsonCors, optionsCors } from '@/lib/cors'
import { sendBookingFormSms } from '@/lib/sms/formSms'
import { smsGateConfigured, smsGateConfigSummary } from '@/lib/sms/smsGateClient'

function clean(value) {
	return String(value || '').trim()
}

function publicError(error) {
	const message = error?.message || String(error)
	if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
		return 'Nie udało się połączyć z SMSGate. Sprawdź internet i status urządzenia.'
	}
	return message
}

export async function POST(req) {
	try {
		const body = await req.json()
		const profile = clean(body?.profile || process.env.SMSGATE_FORM_PROFILE)
		if (!smsGateConfigured(profile)) {
			return jsonCors(
				{ ok: false, error: 'Brak konfiguracji SMSGate w .env.', config: smsGateConfigSummary(profile) },
				{ status: 400 }
			)
		}

		const result = await sendBookingFormSms({
			phone: body?.phone,
			name: body?.name,
			service: body?.service,
			leadId: body?.leadId,
			visitDate: body?.visitDate,
			visitTime: body?.visitTime,
			profile,
			templateKey: body?.templateKey,
			messageOverride: body?.messageOverride,
		})

		return jsonCors({
			ok: true,
			providerMessageId: result.providerMessageId,
			smsFormLogId: result.entry.id,
			phone: result.entry.phone,
			visitDate: body?.visitDate || null,
			visitTime: body?.visitTime || null,
			config: smsGateConfigSummary(profile),
		})
	} catch (error) {
		console.error('[sms form auto] send failed', {
			event: 'sms_form_send_failed',
			errorType: error?.constructor?.name || 'UnknownError',
		})
		return jsonCors({ ok: false, error: publicError(error) }, { status: 500 })
	}
}

export async function OPTIONS() {
	return optionsCors('POST, OPTIONS')
}
