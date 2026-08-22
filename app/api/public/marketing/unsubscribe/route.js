import { jsonCors, optionsCors } from '@/lib/cors'
import { revokeMarketingSmsConsent } from '@/lib/customer-consent'
import { normalizePhone } from '@/lib/date'
import { db } from '@/lib/prisma'

export async function POST(request) {
	try {
		const body = await request.json()
		const phone = normalizePhone(body?.phone) || String(body?.phone || '').trim()
		if (!phone) return jsonCors({ ok: false, error: 'Podaj poprawny numer telefonu.' }, { status: 400 })
		const customer = await db.customer.findUnique({ where: { phone }, select: { id: true } })
		if (!customer) return jsonCors({ ok: true })
		await revokeMarketingSmsConsent({ customerId: customer.id })
		return jsonCors({ ok: true })
	} catch (error) {
		console.error('[marketing unsubscribe]', error)
		return jsonCors({ ok: false, error: 'Nie udało się zapisać rezygnacji.' }, { status: 500 })
	}
}

export async function OPTIONS() {
	return optionsCors('POST, OPTIONS')
}
