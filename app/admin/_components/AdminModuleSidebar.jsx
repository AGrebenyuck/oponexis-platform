'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function isCrmPath(pathname) {
	return !['/admin/performance', '/admin/marketing', '/admin/finance', '/admin/settings'].some(href => pathname.startsWith(href))
}

export default function AdminModuleSidebar({ groups }) {
	const pathname = usePathname()

	if (!isCrmPath(pathname)) return null

	return (
		<nav className='mt-7 space-y-5' aria-label='Sekcje CRM'>
			{groups.map(group => (
				<div key={group.label}>
					<p className='mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-white/40'>{group.label}</p>
					<div className='space-y-1'>
						{group.items.map(item => (
							<Link key={item.href} href={item.href} className='block rounded-md px-3 py-2 text-sm font-medium text-white/78 hover:bg-white/10 hover:text-white'>
								{item.label}
							</Link>
						))}
					</div>
				</div>
			))}
		</nav>
	)
}
