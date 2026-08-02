import { NextResponse } from 'next/server'
import {
	PLATFORM_SESSION_COOKIE,
	verifyPlatformSessionToken,
} from './lib/platform-auth-token'
import { db } from './lib/prisma'

export async function proxy(request) {
	const pathname = request.nextUrl.pathname
	if (request.method === 'POST' && pathname === '/') {
		return NextResponse.rewrite(new URL('/api/telegram/webhook', request.url))
	}

	let session = verifyPlatformSessionToken(
		request.cookies.get(PLATFORM_SESSION_COOKIE)?.value
	)
	const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
	const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/')
	if (session && (isAdminPage || isAdminApi)) {
		const [credential, storedSession] = await Promise.all([
			db.platformCredential.findUnique({ where: { role: session.role }, select: { sessionVersion: true } }),
			db.platformSession.findUnique({ where: { id: session.sessionId }, select: { role: true, revokedAt: true, expiresAt: true } }),
		])
		const valid = credential?.sessionVersion === session.sessionVersion &&
			storedSession?.role === session.role &&
			!storedSession.revokedAt &&
			storedSession.expiresAt > new Date()
		if (!valid) session = null
	}
	const isSuperadminRoute =
		pathname === '/admin/settings' ||
		pathname.startsWith('/admin/settings/') ||
		pathname === '/api/admin/platform-settings' ||
		pathname.startsWith('/api/admin/platform-settings/')

	if ((isAdminPage || isAdminApi) && !session) {
		if (isAdminApi) {
			return NextResponse.json({ ok: false, error: 'Brak autoryzacji.' }, { status: 401 })
		}
		const loginUrl = new URL('/login', request.url)
		loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
		return NextResponse.redirect(loginUrl)
	}

	if (isSuperadminRoute && session?.role !== 'SUPERADMIN') {
		if (isAdminApi) {
			return NextResponse.json({ ok: false, error: 'Brak uprawnień.' }, { status: 403 })
		}
		return NextResponse.redirect(new URL('/admin/dashboard', request.url))
	}

	return NextResponse.next()
}

export const config = {
	matcher: ['/', '/login', '/admin/:path*', '/api/admin/:path*'],
}
