import { jsonCors, optionsCors } from '@/lib/cors'
import { attachCustomerToLead } from '@/lib/customer'
import {
	canonicalSourceFromAttribution,
	firstTouchLeadData,
	normalizeFirstTouch,
} from '@/lib/attribution'
import { db } from '@/lib/prisma'
import { sendLeadToTelegram } from '@/lib/telegram'
import { headers } from 'next/headers'

export async function POST(req) {
	try {
		const body = await req.json()
		const {
			name,
			phone,
			serviceId,
			serviceName,
			selectedServiceIds,
			selectedServiceNames,
			partnerCode,
			visitorId,
			attribution: rawAttribution,
		} = body || {}

		if (!name?.trim() || !phone?.trim() || !serviceId?.toString().trim()) {
			return jsonCors({ ok: false, error: 'Brak wymaganych pol' }, { status: 400 })
		}

		const h = await headers()
		const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0'
		const ua = h.get('user-agent') || ''

		const recent = await db.lead.findFirst({
			where: {
				OR: [{ phone }, { ip }],
				createdAt: { gte: new Date(Date.now() - 30 * 1000) },
			},
			select: { id: true },
		})
		if (recent) return jsonCors({ ok: true, throttled: true })

		const attribution = normalizeFirstTouch(rawAttribution)
		const customerSource = canonicalSourceFromAttribution(attribution)
		const createdLead = await db.lead.create({
			data: {
				name: name.trim(),
				phone: phone.trim(),
				serviceId: String(serviceId),
				serviceName: serviceName || null,
				selectedIds: Array.isArray(selectedServiceIds)
					? selectedServiceIds.map(String)
					: [],
				selectedNames: Array.isArray(selectedServiceNames)
					? selectedServiceNames
					: [],
				partnerCode: partnerCode || null,
				ua,
				ip,
				status: 'new',
				monthKey: new Date().toISOString().slice(0, 7),
				...firstTouchLeadData(attribution),
			},
		})
		const lead = await attachCustomerToLead(createdLead, { source: customerSource })

		if (partnerCode && visitorId) {
			const day = new Date().toISOString().slice(0, 10)
			await db.referralHit
				.create({ data: { partnerCode, visitorId, day } })
				.catch(() => {})
		}

		try {
			await sendLeadToTelegram({
				id: lead.id,
				name: lead.name,
				phone: lead.phone,
				services: lead.selectedNames?.length
					? lead.selectedNames
					: [lead.serviceName],
				source: customerSource,
				attribution,
			})
		} catch (error) {
			console.error('[lead telegram]', error)
		}

		return jsonCors({ ok: true, lead })
	} catch (error) {
		console.error('/api/public/leads failed:', error)
		return jsonCors({ ok: false, error: 'Server error' }, { status: 500 })
	}
}

export async function OPTIONS() {
	return optionsCors('POST, OPTIONS')
}
