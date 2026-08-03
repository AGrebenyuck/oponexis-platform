'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, CalendarDays, CalendarPlus, ClipboardCheck, ClipboardList, Inbox, LayoutDashboard, MessageSquareText, Settings2, TicketPercent, Users, UsersRound, Wrench } from 'lucide-react'

const itemIcons = {
	'/admin/dashboard': LayoutDashboard,
	'/admin/clients': Users,
	'/admin/segments': UsersRound,
	'/admin/reservation': CalendarPlus,
	'/admin/events': ClipboardList,
	'/admin/calendar': CalendarDays,
	'/admin/forms': ClipboardCheck,
	'/admin/sms-campaigns': MessageSquareText,
	'/admin/sms-inbox': Inbox,
	'/admin/services': Wrench,
	'/admin/availability': CalendarClock,
	'/admin/promocodes': TicketPercent,
}

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
						{group.items.map(item => {
							const Icon = itemIcons[item.href] || Settings2
							return <Link key={item.href} href={item.href} className='flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/78 hover:bg-white/10 hover:text-white'>
								<Icon aria-hidden='true' className='h-4 w-4 shrink-0 text-white/55' />
								{item.label}
							</Link>
						})}
					</div>
				</div>
			))}
		</nav>
	)
}
