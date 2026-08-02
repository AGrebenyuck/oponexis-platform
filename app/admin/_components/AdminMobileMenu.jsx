'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const primaryItems = [
	{ href: '/admin/dashboard', label: 'Dashboard', icon: '⌂' },
	{ href: '/admin/sms-campaigns', label: 'SMS', icon: '✉' },
	{ href: '/admin/calendar', label: 'Kalendarz', icon: '◷' },
]

function matchesPath(pathname, href) {
	if (href === '/admin/dashboard') return pathname === href || pathname === '/admin'
	return pathname === href || pathname.startsWith(`${href}/`)
}

function isCrmPath(pathname) {
	return !['/admin/performance', '/admin/marketing', '/admin/finance', '/admin/settings'].some(href => pathname.startsWith(href))
}

function NavPill({ item, active, onClick, compact = false }) {
	return (
		<Link
			href={item.href}
			onClick={onClick}
			className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 text-center no-underline transition ${
				active
					? 'bg-[#132c43] text-white shadow-lg shadow-[#132c43]/25'
					: 'text-[#42576a] hover:bg-white/70'
			} ${compact ? 'max-w-[78px]' : ''}`}
		>
			<span className='text-lg leading-none'>{item.icon}</span>
			<span className='max-w-full truncate text-[11px] font-bold leading-tight'>{item.label}</span>
		</Link>
	)
}

export default function AdminMobileMenu({ groups }) {
	const [open, setOpen] = useState(false)
	const pathname = usePathname()

	const flatItems = useMemo(
		() =>
			groups.flatMap(group =>
				group.items.map(item => ({
					...item,
					group: group.label,
					icon:
						item.href.includes('sms')
							? '✉'
							: item.href.includes('calendar')
								? '◷'
								: item.href.includes('dashboard')
									? '⌂'
									: item.href.includes('events') || item.href.includes('reservation')
										? '◫'
										: item.href.includes('clients') || item.href.includes('segments')
											? '◎'
											: '•',
				}))
			),
		[groups]
	)
	if (!isCrmPath(pathname)) return null

	const currentItem = flatItems.find(item => matchesPath(pathname, item.href))
	const primaryHrefs = new Set(primaryItems.map(item => item.href))
	const extraItem =
		currentItem && !primaryHrefs.has(currentItem.href)
			? { ...currentItem, label: currentItem.label.length > 10 ? currentItem.label : currentItem.label }
			: null

	return (
		<>
			<div className='fixed inset-x-0 bottom-3 z-50 px-3 lg:hidden'>
				<nav className='mx-auto flex max-w-md items-center gap-1 rounded-full border border-white/80 bg-white/88 p-1.5 shadow-2xl shadow-[#132c43]/25 backdrop-blur-xl'>
					{primaryItems.map(item => (
						<NavPill
							key={item.href}
							item={item}
							active={matchesPath(pathname, item.href)}
							onClick={() => setOpen(false)}
							compact={Boolean(extraItem)}
						/>
					))}
					{extraItem ? (
						<NavPill
							item={extraItem}
							active
							onClick={() => setOpen(false)}
							compact
						/>
					) : null}
					<button
						type='button'
						onClick={() => setOpen(value => !value)}
						className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-3 py-2 text-center transition ${
							open ? 'bg-[#fd6d02] text-white shadow-lg shadow-[#fd6d02]/25' : 'text-[#42576a]'
						} ${extraItem ? 'max-w-[72px]' : ''}`}
						aria-label='Otwórz wszystkie sekcje'
					>
						<span className='text-lg leading-none'>{open ? '×' : '•••'}</span>
						<span className='text-[11px] font-bold leading-tight'>Więcej</span>
					</button>
				</nav>
			</div>

			<div
				className={`fixed inset-0 z-40 bg-[#061b2b]/55 transition-opacity duration-200 lg:hidden ${
					open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
				}`}
				onClick={() => setOpen(false)}
			/>
			<div
				className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-24 transition-transform duration-300 ease-out lg:hidden ${
					open ? 'translate-y-0' : 'translate-y-full'
				}`}
			>
				<div className='mx-auto max-h-[72vh] max-w-md overflow-hidden rounded-t-3xl border border-white/80 bg-white shadow-2xl'>
					<div className='border-b border-[#e2ebf2] px-5 py-4'>
						<div className='mx-auto mb-3 h-1 w-12 rounded-full bg-[#d3dee8]' />
						<p className='text-lg font-black text-[#132c43]'>Oponexis Platform</p>
						<p className='text-xs font-semibold text-[#5f7487]'>Sekcje aktywnego modułu CRM</p>
					</div>
					<div className='max-h-[56vh] overflow-y-auto px-4 py-4'>
						<div className='space-y-5'>
							{groups.map(group => (
								<div key={group.label}>
									<p className='mb-2 px-1 text-xs font-black uppercase tracking-wide text-[#7b8fa1]'>
										{group.label}
									</p>
									<div className='grid grid-cols-2 gap-2'>
										{group.items.map(item => {
											const iconItem =
												flatItems.find(flatItem => flatItem.href === item.href) || item
											const active = matchesPath(pathname, item.href)
											return (
												<Link
													key={item.href}
													href={item.href}
													onClick={() => setOpen(false)}
													className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold no-underline transition ${
														active
															? 'bg-[#132c43] text-white'
															: 'bg-[#f3f7fa] text-[#132c43] hover:bg-[#e7eef4]'
													}`}
												>
													<span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-base text-[#fd6d02]'>
														{iconItem.icon || '•'}
													</span>
													<span className='min-w-0 truncate'>{item.label}</span>
												</Link>
											)
										})}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</>
	)
}
