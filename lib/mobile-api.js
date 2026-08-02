import { createHash, timingSafeEqual } from 'node:crypto'

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function digest(value) {
	return createHash('sha256').update(value).digest()
}

export function authorizeMobileRequest(request) {
	const expectedToken = process.env.OPONEXIS_MOBILE_API_TOKEN?.trim()
	if (!expectedToken) return 'not_configured'

	const authorization = request.headers.get('authorization') || ''
	if (!authorization.startsWith('Bearer ')) return 'unauthorized'

	const providedToken = authorization.slice('Bearer '.length).trim()
	if (!providedToken) return 'unauthorized'

	return timingSafeEqual(digest(providedToken), digest(expectedToken))
		? 'authorized'
		: 'unauthorized'
}

export function validRequestId(value) {
	return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function responseHeaders() {
	return {
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
	}
}
