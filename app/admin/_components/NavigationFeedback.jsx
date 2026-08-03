'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavigationFeedback() {
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		const timeout = window.setTimeout(() => setLoading(false), 0)
		return () => window.clearTimeout(timeout)
	}, [pathname, searchParams])

	useEffect(() => {
		function handleClick(event) {
			if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
			const link = event.target.closest('a[href]')
			if (!link || link.target === '_blank') return
			const url = new URL(link.href, window.location.href)
			if (url.origin === window.location.origin && url.pathname.startsWith('/admin') && url.href !== window.location.href) {
				setLoading(true)
			}
		}
		document.addEventListener('click', handleClick, true)
		return () => document.removeEventListener('click', handleClick, true)
	}, [])

	return loading ? (
		<div className='pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-white/15' role='status' aria-live='polite'>
			<span className='block h-full w-1/3 animate-[opx-loading_1s_ease-in-out_infinite] rounded-full bg-[#fd6d02]' />
			<span className='sr-only'>Ładowanie widoku…</span>
		</div>
	) : null
}
