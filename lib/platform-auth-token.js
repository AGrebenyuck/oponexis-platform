import { createHmac, timingSafeEqual } from 'node:crypto'

export const PLATFORM_SESSION_COOKIE = 'oponexis_platform_session'
export const PLATFORM_ROLES = ['ADMIN', 'SUPERADMIN']

function sessionSecret() {
	const secret = process.env.OPONEXIS_SESSION_SECRET?.trim()
	if (!secret || secret.length < 32) {
		throw new Error('OPONEXIS_SESSION_SECRET must contain at least 32 characters.')
	}
	return secret
}

function signature(value) {
	return createHmac('sha256', sessionSecret()).update(value).digest('base64url')
}

export function createPlatformSessionToken({ role, sessionVersion, sessionId, expiresAt }) {
	const payload = Buffer.from(
		JSON.stringify({
			role,
			version: sessionVersion,
			sessionId,
			expiresAt: expiresAt.getTime(),
		})
	).toString('base64url')
	return `${payload}.${signature(payload)}`
}

export function verifyPlatformSessionToken(token) {
	try {
		const [payload, providedSignature, extra] = String(token || '').split('.')
		if (!payload || !providedSignature || extra) return null

		const expectedSignature = signature(payload)
		const provided = Buffer.from(providedSignature)
		const expected = Buffer.from(expectedSignature)
		if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

		const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
		if (!PLATFORM_ROLES.includes(parsed.role)) return null
		if (!Number.isInteger(parsed.version) || parsed.version < 1) return null
		if (!parsed.sessionId || typeof parsed.sessionId !== 'string') return null
		if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) return null

		return {
			role: parsed.role,
			sessionVersion: parsed.version,
			sessionId: parsed.sessionId,
			expiresAt: new Date(parsed.expiresAt),
		}
	} catch {
		return null
	}
}
