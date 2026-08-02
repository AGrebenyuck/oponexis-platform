import { normalizeCustomerSource } from '@/lib/customer-sources'

const MAX = {
	short: 191,
	url: 1000,
}

function clean(value, max = MAX.short) {
	const text = typeof value === 'string' ? value.trim() : ''
	return text ? text.slice(0, max) : null
}

function sourceFromReferrer(referrer) {
	if (!referrer) return null
	try {
		const host = new URL(referrer).hostname.toLowerCase()
		if (host.includes('google.')) return 'Wyszukiwarka Google'
		if (host.includes('facebook.') || host.includes('instagram.')) {
			return 'Facebook / Instagram'
		}
		if (host.includes('tiktok.') || host.includes('youtube.')) {
			return 'TikTok / YouTube'
		}
	} catch {}
	return null
}

export function canonicalSourceFromAttribution(attribution) {
	const source = clean(attribution?.source)?.toLowerCase() || ''
	const medium = clean(attribution?.medium)?.toLowerCase() || ''
	const landingPage = clean(attribution?.landingPage, MAX.url)?.toLowerCase() || ''
	const referrer = clean(attribution?.referrer, MAX.url)?.toLowerCase() || ''

	if (source.includes('google_maps') || source === 'maps' || landingPage.includes('google_maps')) {
		return 'Google Maps'
	}
	if (attribution?.gclid || source.includes('google') && /(cpc|ppc|paid|ads?)/.test(medium)) {
		return 'Google Ads'
	}
	if (source.includes('google') && /(organic|search)/.test(medium)) {
		return 'Wyszukiwarka Google'
	}
	if (attribution?.fbclid || /(facebook|instagram|meta)/.test(source) && /(cpc|paid|ads?)/.test(medium)) {
		return 'Facebook Ads'
	}
	if (attribution?.ttclid || /(tiktok|youtube)/.test(source)) return 'TikTok / YouTube'
	if (source.includes('qr')) return 'Wizytówka / QR'
	if (/(partner|b2b)/.test(source)) return 'B2B / partner'
	if (/(referral|polecen|znajom)/.test(source)) return 'Polecenie / znajomi'
	if (/(offline|bus|van|car|auto)/.test(source)) return 'Oklejony samochód'
	if (source.includes('google')) return 'Wyszukiwarka Google'
	if (source && !['direct', '(direct)'].includes(source)) {
		return normalizeCustomerSource(source)
	}
	return sourceFromReferrer(referrer) || 'Strona internetowa'
}

export function normalizeFirstTouch(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null

	const capturedAt = new Date(value.capturedAt)
	return {
		source: clean(value.source),
		medium: clean(value.medium),
		campaign: clean(value.campaign),
		content: clean(value.content),
		term: clean(value.term),
		referrer: clean(value.referrer, MAX.url),
		landingPage: clean(value.landingPage, MAX.url),
		gclid: clean(value.gclid),
		fbclid: clean(value.fbclid),
		ttclid: clean(value.ttclid),
		msclkid: clean(value.msclkid),
		capturedAt: Number.isFinite(capturedAt.getTime()) ? capturedAt : new Date(),
	}
}

export function firstTouchLeadData(attribution) {
	if (!attribution) return {}
	return {
		firstTouchSource: attribution.source,
		firstTouchMedium: attribution.medium,
		firstTouchCampaign: attribution.campaign,
		firstTouchContent: attribution.content,
		firstTouchTerm: attribution.term,
		firstTouchReferrer: attribution.referrer,
		firstTouchLandingPage: attribution.landingPage,
		firstTouchGclid: attribution.gclid,
		firstTouchFbclid: attribution.fbclid,
		firstTouchTtclid: attribution.ttclid,
		firstTouchMsclkid: attribution.msclkid,
		firstTouchAt: attribution.capturedAt,
	}
}
