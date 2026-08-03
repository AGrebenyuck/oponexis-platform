'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const modules = [
	{ href: '/admin/dashboard', label: 'CRM', description: 'Operacje i klienci' },
	{ href: '/admin/performance', label: 'Performance', description: 'Wyniki operacyjne' },
	{ href: '/admin/marketing', label: 'Marketing', description: 'Kanały i kampanie' },
	{ href: '/admin/finance', label: 'Finanse', description: 'Przychody i koszty' },
]

function currentModule(pathname) {
	return modules.find(module => module.href !== '/admin/dashboard' && pathname.startsWith(module.href)) || modules[0]
}

export default function PlatformModuleNav({ compact = false, isSuperadmin = false }) {
	const pathname = usePathname()
	const router = useRouter()
	const rootRef = useRef(null)
	const [open, setOpen] = useState(false)
	const selected = currentModule(pathname)

	useEffect(() => {
		function closeOnOutsidePointer(event) {
			if (!rootRef.current?.contains(event.target)) setOpen(false)
		}
		function closeOnEscape(event) {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', closeOnOutsidePointer)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('pointerdown', closeOnOutsidePointer)
			document.removeEventListener('keydown', closeOnEscape)
		}
	}, [])

	function choose(module) {
		setOpen(false)
		if (module.href !== selected.href) router.push(module.href)
	}

	function chooseSettings() {
		setOpen(false)
		if (!pathname.startsWith('/admin/settings')) router.push('/admin/settings')
	}

	return (
		<div ref={rootRef} className={`relative ${compact ? 'mt-3' : 'mt-5'}`}>
			<button
				type='button'
				onClick={() => setOpen(value => !value)}
				aria-expanded={open}
				aria-haspopup='listbox'
				className={compact
					? 'flex w-full items-center justify-between rounded-xl border border-[#d7e1e8] bg-white px-3 py-2.5 text-left text-[#132c43]'
					: 'flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 text-left text-white transition hover:bg-white/[0.11]'}
			>
				<span className='min-w-0 flex-1'>
					<span className='block text-sm font-semibold'>{selected.label}</span>
					<span className={compact ? 'block truncate text-[11px] text-[#6e8191]' : 'block truncate text-[11px] text-white/50'}>{selected.description}</span>
				</span>
				<span className={`text-xs text-current/60 transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
			</button>
			{open ? (
				<div role='listbox' aria-label='Wybierz moduł platformy' className={compact ? 'absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[#d7e1e8] bg-white p-1 shadow-xl' : 'absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-white/10 bg-[#1a354b] p-1 shadow-xl shadow-black/25'}>
					{modules.map(module => {
						const active = module.href === selected.href
						return (
							<button key={module.href} type='button' role='option' aria-selected={active} onClick={() => choose(module)} className={compact ? `w-full rounded-lg px-3 py-2.5 text-left transition ${active ? 'bg-[#eef3f6] text-[#132c43]' : 'text-[#42576a] hover:bg-[#f6f8f9]'}` : `w-full rounded-lg px-3 py-2.5 text-left transition ${active ? 'bg-white/[0.12] text-white' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'}`}>
								<span className='block text-sm font-semibold'>{module.label}</span>
								<span className='block text-[11px] opacity-55'>{module.description}</span>
							</button>
						)
					})}
					{isSuperadmin ? (
						<>
							<div className={compact ? 'my-1 border-t border-[#e2ebf2]' : 'my-1 border-t border-white/10'} />
							<button type='button' onClick={chooseSettings} className={compact ? 'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[#42576a] transition hover:bg-[#f6f8f9]' : 'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-white/70 transition hover:bg-white/[0.07] hover:text-white'}>
								<span className='grid h-6 w-6 place-items-center rounded-md bg-[#2c70b7]/15 text-sm text-[#2c70b7]'>⚙</span>
								<span><span className='block text-sm font-semibold'>Ustawienia platformy</span><span className='block text-[11px] opacity-55'>Dostęp superadministratora</span></span>
							</button>
						</>
					) : null}
				</div>
			) : null}
		</div>
	)
}
