'use client'

import { useState } from 'react'

export default function LogoutButton({ compact = false }) {
	const [loading, setLoading] = useState(false)

	async function logout() {
		setLoading(true)
		try {
			await fetch('/api/auth/logout', { method: 'POST' })
			window.location.assign('/login')
		} finally {
			setLoading(false)
		}
	}

	return (
		<button
			type='button'
			onClick={logout}
			disabled={loading}
			className={compact
				? 'rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/75'
				: 'w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white'}
		>
			{loading ? 'Wylogowanie…' : 'Wyloguj się'}
		</button>
	)
}
