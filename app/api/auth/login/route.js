import { NextResponse } from 'next/server'
import {
	authenticatePlatformPassword,
	getPlatformAuthSetting,
	writePlatformSession,
} from '@/lib/platform-auth'

export async function POST(request) {
	try {
		const body = await request.json()
		const credential = await authenticatePlatformPassword(body.password)
		if (!credential) {
			return NextResponse.json(
				{ ok: false, error: 'Nieprawidłowe hasło.' },
				{ status: 401 }
			)
		}
		const setting = await getPlatformAuthSetting()
		const session = await writePlatformSession(credential, setting.sessionDays, { request })
		return NextResponse.json({ ok: true, role: session.role })
	} catch (error) {
		console.error('[platform login]', error)
		return NextResponse.json(
			{ ok: false, error: 'Logowanie jest chwilowo niedostępne.' },
			{ status: 500 }
		)
	}
}
