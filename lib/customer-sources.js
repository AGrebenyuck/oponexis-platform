export const CUSTOMER_SOURCE_OPTIONS = [
	'Google Ads',
	'Google Maps',
	'Facebook Ads',
	'Facebook / Instagram',
	'TikTok / YouTube',
	'Polecenie / znajomi',
	'Wizytówka / QR',
	'B2B / partner',
	'Oklejony samochód',
	'Offline',
	'Wyszukiwarka Google',
	'Strona internetowa',
	'Inne',
]

function normalized(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ł/g, 'l')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function normalizeCustomerSource(value) {
	const raw = String(value || '').trim()
	const source = normalized(raw)
	if (!source) return ''

	const exact = CUSTOMER_SOURCE_OPTIONS.find(option => normalized(option) === source)
	if (exact) return exact
	if (source.includes('google ads') || source.includes('adwords')) return 'Google Ads'
	if (source.includes('google map') || source.includes('mapa')) return 'Google Maps'
	if (source.includes('facebook ads') || source.includes('meta ads')) return 'Facebook Ads'
	if (source.includes('facebook') || source.includes('instagram')) return 'Facebook / Instagram'
	if (source.includes('tiktok') || source.includes('youtube')) return 'TikTok / YouTube'
	if (source.includes('polecen') || source.includes('znajom') || source.includes('recommend')) {
		return 'Polecenie / znajomi'
	}
	if (source.includes('qr') || source.includes('business card') || source.includes('wizytow')) {
		return 'Wizytówka / QR'
	}
	if (source.includes('b2b') || source.includes('partner')) return 'B2B / partner'
	if (source.includes('oklejon') || source.includes('bus') || source.includes('samochod')) {
		return 'Oklejony samochód'
	}
	if (source.includes('offline') || source.includes('szyld') || source.includes('baner')) {
		return 'Offline'
	}
	if (source.includes('search') || source.includes('wyszukiw') || source.includes('organic')) {
		return 'Wyszukiwarka Google'
	}
	if (source.includes('site') || source.includes('strona') || source === 'lead') {
		return 'Strona internetowa'
	}
	return 'Inne'
}
