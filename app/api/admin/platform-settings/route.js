import { NextResponse } from 'next/server'
import {
	ensurePlatformCredential,
	getPlatformAuthSetting,
	hashPlatformPassword,
	readPlatformSession,
	validatePlatformPassword,
	writePlatformSession,
} from '@/lib/platform-auth'
import { PLATFORM_ROLES } from '@/lib/platform-auth-token'
import { db } from '@/lib/prisma'

export async function PATCH(request) {
	try {
		const session = await readPlatformSession()
		if (!session) {
			return NextResponse.json({ ok: false, error: 'Brak autoryzacji.' }, { status: 401 })
		}
		if (session.role !== 'SUPERADMIN') {
			return NextResponse.json({ ok: false, error: 'Brak uprawnień.' }, { status: 403 })
		}

		const body = await request.json()
		if (body.action === 'session-days') {
			const sessionDays = Number(body.sessionDays)
			if (!Number.isInteger(sessionDays) || sessionDays < 1 || sessionDays > 90) {
				return NextResponse.json({ ok: false, error: 'Wybierz od 1 do 90 dni.' }, { status: 400 })
			}
			const setting = await db.platformAuthSetting.upsert({
				where: { id: 'platform' },
				update: { sessionDays },
				create: { id: 'platform', sessionDays },
			})
			return NextResponse.json({ ok: true, sessionDays: setting.sessionDays })
		}

		if (body.action === 'password') {
			const role = String(body.role || '')
			if (!PLATFORM_ROLES.includes(role)) {
				return NextResponse.json({ ok: false, error: 'Nieprawidłowa rola.' }, { status: 400 })
			}
			const password = String(body.password || '')
			const passwordError = validatePlatformPassword(password)
			if (passwordError) {
				return NextResponse.json({ ok: false, error: passwordError }, { status: 400 })
			}
			await ensurePlatformCredential(role)
			const { salt, hash } = hashPlatformPassword(password)
			const credential = await db.platformCredential.update({
				where: { role },
				data: {
					passwordHash: hash,
					passwordSalt: salt,
					sessionVersion: { increment: 1 },
				},
			})
			if (role === session.role) {
				const setting = await getPlatformAuthSetting()
				await writePlatformSession(credential, setting.sessionDays)
			}
			return NextResponse.json({ ok: true })
		}

		return NextResponse.json({ ok: false, error: 'Nieprawidłowa operacja.' }, { status: 400 })
	} catch (error) {
		console.error('[platform settings]', error)
		return NextResponse.json({ ok: false, error: 'Nie udało się zapisać ustawień.' }, { status: 500 })
	}
}
