import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { findMarketingSmsIneligibleRecipients } from '@/lib/sms/marketingConsent'
import { smsCampaignTestModeEnabled } from '@/lib/sms/smsCampaignTestMode'
import { normalizePhone } from '@/lib/date'

function normalizeRecipients(recipients = []) {
	const seen = new Set()
	return recipients
		.map(item => ({
			customerId: item.customerId || item.id || null,
			name: item.name || null,
			phone: normalizePhone(item.phone),
			isManualPhone: false,
		}))
		.filter(item => {
			if (!item.phone || seen.has(item.phone)) return false
			seen.add(item.phone)
			return true
		})
}

function normalizeManualPhones(phones = []) {
	const seen = new Set()
	const recipients = []
	for (const item of phones) {
		const phone = normalizePhone(item)
		if (!phone) return { recipients: [], invalid: true }
		if (seen.has(phone)) continue
		seen.add(phone)
		recipients.push({ customerId: null, name: null, phone, isManualPhone: true })
	}
	return { recipients, invalid: false }
}

export async function GET() {
	try {
		const campaigns = await db.smsCampaign.findMany({
			orderBy: { createdAt: 'desc' },
			include: { recipients: true },
			take: 100,
		})

		return NextResponse.json({
			success: true,
			data: campaigns.map(campaign => ({
				...campaign,
				stats: {
					total: campaign.recipients.length,
					pending: campaign.recipients.filter(item => item.status === 'PENDING').length,
					queued: campaign.recipients.filter(item => item.status === 'QUEUED').length,
					sent: campaign.recipients.filter(item => item.status === 'SENT').length,
					delivered: campaign.recipients.filter(item => item.status === 'DELIVERED').length,
					failed: campaign.recipients.filter(item => item.status === 'FAILED').length,
				},
			})),
		})
	} catch (error) {
		console.error('GET /api/admin/sms-campaigns failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie udało się pobrać kampanii.' },
			{ status: 500 }
		)
	}
}

export async function POST(req) {
	try {
		const body = await req.json()
		const selectedRecipients = normalizeRecipients(body.recipients)
		if (selectedRecipients.some(item => !item.customerId)) {
			return NextResponse.json(
				{ success: false, error: 'Wpisz numery spoza bazy w polu numerów ręcznych.' },
				{ status: 400 }
			)
		}
		const rawManualPhones = Array.isArray(body.manualPhones) ? body.manualPhones : []
		if (rawManualPhones.length > 50) {
			return NextResponse.json(
				{ success: false, error: 'Możesz dodać maksymalnie 50 numerów ręcznie.' },
				{ status: 400 }
			)
		}
		const manual = normalizeManualPhones(rawManualPhones)
		if (manual.invalid) {
			return NextResponse.json(
				{ success: false, error: 'Jeden z ręcznie wpisanych numerów jest nieprawidłowy.' },
				{ status: 400 }
			)
		}
		const manualConsentConfirmed = body.manualConsentConfirmed === true && manual.recipients.length > 0
		if (manual.recipients.length && !manualConsentConfirmed) {
			return NextResponse.json(
				{ success: false, error: 'Potwierdź, że ręcznie wpisane numery są przeznaczone do tej kampanii.' },
				{ status: 400 }
			)
		}
		const recipients = [...selectedRecipients]
		const seenPhones = new Set(selectedRecipients.map(item => item.phone))
		for (const recipient of manual.recipients) {
			if (!seenPhones.has(recipient.phone)) recipients.push(recipient)
			seenPhones.add(recipient.phone)
		}
		if (!body.name?.trim() || !body.message?.trim()) {
			return NextResponse.json(
				{ success: false, error: 'Nazwa i treść SMS są wymagane.' },
				{ status: 400 }
			)
		}
		if (!recipients.length) {
			return NextResponse.json(
				{ success: false, error: 'Wybierz przynajmniej jednego odbiorcę.' },
				{ status: 400 }
			)
		}
		const allowWithoutMarketingConsent = body.allowWithoutMarketingConsent === true
		if (allowWithoutMarketingConsent && !smsCampaignTestModeEnabled()) {
			return NextResponse.json(
				{ success: false, error: 'Tryb testowy SMS jest wyłączony na tym serwerze.' },
				{ status: 403 }
			)
		}
		const ineligible = await findMarketingSmsIneligibleRecipients(recipients, {
			allowWithoutConsent: allowWithoutMarketingConsent,
			allowManuallyConfirmed: manualConsentConfirmed,
		})
		if (ineligible.length) {
			return NextResponse.json(
				{
					success: false,
					error: `${ineligible.length} odbiorców nie ma aktywnej zgody marketingowej SMS lub numer nie zgadza się z kartą klienta. Usuń ich z listy, aby utworzyć kampanię.`,
				},
				{ status: 400 }
			)
		}

		const data = {
			name: body.name.trim(),
			message: body.message.trim(),
			status: body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
			delaySeconds: Number(body.delaySeconds || 7),
			sourceSeason: Array.isArray(body.filters?.seasons)
				? body.filters.seasons.join(',')
				: null,
			sourceYear: body.filters?.year ? Number(body.filters.year) : null,
			filters: {
				...(body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
					? body.filters
					: {}),
				smsCampaignTestMode: allowWithoutMarketingConsent,
				smsCampaignManualConsentConfirmed: manualConsentConfirmed,
			},
			recipients: {
				create: recipients.map(item => ({
					customerId: item.customerId,
					name: item.name,
					phone: item.phone,
				})),
			},
		}
		if (body.scheduledAt) {
			data.scheduledAt = new Date(body.scheduledAt)
		}

		const campaign = await db.smsCampaign.create({
			data,
			include: { recipients: true },
		})

		return NextResponse.json({ success: true, data: campaign })
	} catch (error) {
		console.error('POST /api/admin/sms-campaigns failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie utworzono kampanii.' },
			{ status: 500 }
		)
	}
}
