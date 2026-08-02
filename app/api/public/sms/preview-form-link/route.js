import { jsonCors, optionsCors } from '@/lib/cors'
import { previewBookingFormSms } from '@/lib/sms/formSms'

export async function POST(req) {
	try {
		const body = await req.json()
		const preview = await previewBookingFormSms({
			phone: body?.phone,
			name: body?.name,
			service: body?.service,
			leadId: body?.leadId,
			visitDate: body?.visitDate,
			visitTime: body?.visitTime,
			messageOverride: body?.messageOverride,
		})
		return jsonCors({ ok: true, ...preview })
	} catch (error) {
		return jsonCors(
			{ ok: false, error: error?.message || 'Nie udało się przygotować podglądu SMS.' },
			{ status: 400 }
		)
	}
}

export async function OPTIONS() {
	return optionsCors('POST, OPTIONS')
}
