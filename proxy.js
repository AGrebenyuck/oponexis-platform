import { NextResponse } from 'next/server'
import {
	PLATFORM_SESSION_COOKIE,
	verifyPlatformSessionToken,
} from './lib/platform-auth-token'

export function proxy(request) {
	const pathname = request.nextUrl.pathname
	if (request.method === 'POST' && pathname === '/') {
		return NextResponse.rewrite(new URL('/api/telegram/webhook', request.url))
	}

	const session = verifyPlatformSessionToken(
		request.cookies.get(PLATFORM_SESSION_COOKIE)?.value
	)
	const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
	const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/')
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

	if (pathname === '/login' && session) {
		return NextResponse.redirect(new URL('/admin/dashboard', request.url))
	}

	return NextResponse.next()
}

export const config = {
	matcher: ['/', '/login', '/admin/:path*', '/api/admin/:path*'],
}
