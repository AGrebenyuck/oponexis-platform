import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from './prisma'
import {
	createPlatformSessionToken,
	PLATFORM_ROLES,
	PLATFORM_SESSION_COOKIE,
	verifyPlatformSessionToken,
} from './platform-auth-token'

const DEFAULT_SESSION_DAYS = 30
const MIN_PASSWORD_LENGTH = 10

function initialPassword(role) {
	const key = role === 'SUPERADMIN'
		? 'OPONEXIS_SUPERADMIN_PASSWORD'
		: 'OPONEXIS_ADMIN_PASSWORD'
	return process.env[key]?.trim() || ''
}

export function validatePlatformPassword(password) {
	const value = String(password || '')
	if (value.length < MIN_PASSWORD_LENGTH) {
		return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`
	}
	if (value.length > 200) return 'Hasło jest zbyt długie.'
	return ''
}

export function hashPlatformPassword(password, salt = randomBytes(16).toString('hex')) {
	return {
		salt,
		hash: scryptSync(password, salt, 64).toString('hex'),
	}
}

function passwordMatches(password, credential) {
	if (!credential) {
		// Keep unsuccessful authentication timing close to configured credentials.
		scryptSync(password, 'oponexis-missing-credential', 64)
		return false
	}
	const actual = scryptSync(password, credential.passwordSalt, 64)
	const expected = Buffer.from(credential.passwordHash, 'hex')
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function ensurePlatformCredential(role) {
	if (!PLATFORM_ROLES.includes(role)) throw new Error('Unsupported platform role.')
	const existing = await db.platformCredential.findUnique({ where: { role } })
	if (existing) return existing

	const password = initialPassword(role)
	if (!password) return null
	const passwordError = validatePlatformPassword(password)
	if (passwordError) throw new Error(`${role}: ${passwordError}`)
	const { salt, hash } = hashPlatformPassword(password)

	return db.platformCredential.upsert({
		where: { role },
		update: {},
		create: { role, passwordHash: hash, passwordSalt: salt },
	})
}

export async function authenticatePlatformPassword(password) {
	const value = String(password || '')
	if (!value || value.length > 200) return null
	const credentials = await Promise.all(
		PLATFORM_ROLES.map(role => ensurePlatformCredential(role))
	)
	const matches = credentials.map(credential => passwordMatches(value, credential))
	const matchIndex = matches.findIndex(Boolean)
	return matchIndex >= 0 ? credentials[matchIndex] : null
}

export async function getPlatformAuthSetting() {
	return db.platformAuthSetting.upsert({
		where: { id: 'platform' },
		update: {},
		create: { id: 'platform', sessionDays: DEFAULT_SESSION_DAYS },
	})
}

export async function writePlatformSession(credential, sessionDays) {
	const days = Math.min(90, Math.max(1, Number(sessionDays) || DEFAULT_SESSION_DAYS))
	const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
	const token = createPlatformSessionToken({
		role: credential.role,
		sessionVersion: credential.sessionVersion,
		expiresAt,
	})
	const cookieStore = await cookies()
	cookieStore.set(PLATFORM_SESSION_COOKIE, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/',
		expires: expiresAt,
	})
	return { role: credential.role, expiresAt }
}

export async function clearPlatformSession() {
	const cookieStore = await cookies()
	cookieStore.delete(PLATFORM_SESSION_COOKIE)
}

export async function readPlatformSession({ verifyCredential = true } = {}) {
	const cookieStore = await cookies()
	const session = verifyPlatformSessionToken(
		cookieStore.get(PLATFORM_SESSION_COOKIE)?.value
	)
	if (!session || !verifyCredential) return session

	const credential = await db.platformCredential.findUnique({
		where: { role: session.role },
		select: { sessionVersion: true },
	})
	if (!credential || credential.sessionVersion !== session.sessionVersion) return null
	return session
}

export async function getPlatformAuthOverview() {
	await Promise.all(PLATFORM_ROLES.map(role => ensurePlatformCredential(role)))
	const [credentials, setting] = await Promise.all([
		db.platformCredential.findMany({
			where: { role: { in: PLATFORM_ROLES } },
			select: { role: true, updatedAt: true },
		}),
		getPlatformAuthSetting(),
	])
	return { credentials, setting }
}
