import { jsonCors, optionsCors } from '@/lib/cors'
import { normalizePhone } from '@/lib/date'
import { canonicalSourceFromAttribution } from '@/lib/attribution'
import { db } from '@/lib/prisma'

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url)
		const leadId = searchParams.get('leadId') || ''
		const rawPhone = searchParams.get('phone') || ''
		const token = searchParams.get('token') || ''
		const phone = normalizePhone(rawPhone) || rawPhone.trim()

		if (!token && !leadId && !phone) {
			return jsonCors({ ok: false, error: 'Missing token, leadId or phone' }, { status: 400 })
		}

		const log = await db.smsFormLog.findFirst({
			where: token
				? { publicToken: token, status: { notIn: ['deleted', 'failed'] } }
				: {
						status: { in: ['pending', 'reminded'] },
						OR: [
							leadId ? { leadId } : null,
							phone ? { phone } : null,
							rawPhone && rawPhone !== phone ? { phone: rawPhone } : null,
						].filter(Boolean),
				  },
			orderBy: [{ visitDate: 'desc' }, { sentAt: 'desc' }, { id: 'desc' }],
		})
		const expired = Boolean(log?.expiresAt && log.expiresAt <= new Date() && log.status !== 'done')
		const lead = log?.leadId
			? await db.lead.findUnique({
					where: { id: log.leadId },
					select: {
						id: true,
						firstTouchSource: true,
						firstTouchMedium: true,
						firstTouchCampaign: true,
						firstTouchContent: true,
						firstTouchTerm: true,
						firstTouchReferrer: true,
						firstTouchLandingPage: true,
						firstTouchGclid: true,
						firstTouchFbclid: true,
						firstTouchTtclid: true,
						firstTouchMsclkid: true,
						firstTouchAt: true,
						customer: { select: { source: true } },
					},
			  })
			: null
		const attribution = lead?.firstTouchSource
			? {
					source: lead.firstTouchSource,
					medium: lead.firstTouchMedium,
					campaign: lead.firstTouchCampaign,
					content: lead.firstTouchContent,
					term: lead.firstTouchTerm,
					referrer: lead.firstTouchReferrer,
					landingPage: lead.firstTouchLandingPage,
					gclid: lead.firstTouchGclid,
					fbclid: lead.firstTouchFbclid,
					ttclid: lead.firstTouchTtclid,
					msclkid: lead.firstTouchMsclkid,
					capturedAt: lead.firstTouchAt?.toISOString() || null,
			  }
			: null
		const customer = log?.phone
			? await db.customer.findUnique({
					where: { phone: log.phone },
					select: {
						id: true,
						name: true,
						source: true,
						workOrders: {
							orderBy: [{ visitDate: 'desc' }, { updatedAt: 'desc' }],
							take: 1,
							select: {
								regNumber: true,
								service: true,
								color: true,
								carModel: true,
								address: true,
								lat: true,
								lng: true,
								wheelRimSize: true,
								tireSize: true,
								wantsInvoice: true,
								invoiceNip: true,
								invoiceEmail: true,
							},
						},
					},
			  })
			: null
		const previous = customer?.workOrders?.[0] || null
		const storedSource = lead?.customer?.source || customer?.source || ''
		const attributionSource = String(lead?.firstTouchSource || '').trim().toLowerCase()
		const sourceKnown =
			Boolean(attributionSource && attributionSource !== 'direct') ||
			Boolean(storedSource && storedSource !== 'Inne')

		return jsonCors({
			ok: true,
			expired,
			data: log
				? {
						id: log.id,
						status: log.status,
						leadId: log.leadId,
						name: log.name || customer?.name || null,
						phone: log.phone,
						service: log.service || previous?.service || null,
						source: attribution
							? canonicalSourceFromAttribution(attribution)
							: storedSource || null,
						sourceKnown,
						attribution,
						visitDate: log.visitDate
							? log.visitDate.toISOString().slice(0, 10)
							: null,
						visitTime: log.visitTime || null,
						previous: previous
							? {
								regNumber: previous.regNumber,
								color: previous.color,
								carModel: previous.carModel,
								address: previous.address,
								lat: previous.lat,
								lng: previous.lng,
								wheelRimSize: previous.wheelRimSize,
								tireSize: previous.tireSize,
								wantsInvoice: previous.wantsInvoice,
								invoiceNip: previous.invoiceNip,
								invoiceEmail: previous.invoiceEmail,
							  }
							: null,
				  }
				: null,
		})
	} catch (error) {
		console.error('/api/public/sms/latest failed:', {
			error: error?.message || String(error),
			stack: error?.stack || null,
		})
		return jsonCors({ ok: false, error: 'Server error' }, { status: 500 })
	}
}

export async function OPTIONS() {
	return optionsCors('GET, OPTIONS')
}
