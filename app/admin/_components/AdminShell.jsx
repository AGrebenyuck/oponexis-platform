import Link from 'next/link'
import Image from 'next/image'
import AdminMobileMenu from './AdminMobileMenu'
import PlatformModuleNav from './PlatformModuleNav'
import AdminModuleSidebar from './AdminModuleSidebar'
import LogoutButton from './LogoutButton'

const navGroups = [
	{
		label: 'Analiza',
		items: [
			{ href: '/admin/dashboard', label: 'Dashboard' },
			{ href: '/admin/clients', label: 'Klienci' },
			{ href: '/admin/segments', label: 'Segmenty' },
		],
	},
	{
		label: 'Operacje',
		items: [
			{ href: '/admin/reservation', label: 'Nowa rezerwacja' },
			{ href: '/admin/events', label: 'Zlecenia' },
			{ href: '/admin/calendar', label: 'Kalendarz' },
			{ href: '/admin/forms', label: 'Formularz' },
		],
	},
	{
		label: 'SMS',
		items: [
			{ href: '/admin/sms-campaigns', label: 'SMS kampanie' },
			{ href: '/admin/sms-inbox', label: 'Inbox SMS' },
		],
	},
	{
		label: 'Ustawienia',
		items: [
			{ href: '/admin/services', label: 'Usługi' },
			{ href: '/admin/availability', label: 'Dostępność' },
			{ href: '/admin/promocodes', label: 'Promokody' },
		],
	},
]

export default function AdminShell({ children, role }) {
	const isSuperadmin = role === 'SUPERADMIN'
	return (
		<div className='min-h-screen text-[#132c43]'>
			<aside className='fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-[#132c43] px-4 py-5 text-white lg:block'>
				<Link href='/admin/dashboard' className='block px-2 no-underline'>
					<Image src='/oponexis-logo.svg' alt='Oponexis' width={192} height={34} priority className='h-auto w-44' />
				</Link>
				<p className='mt-2 px-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/55'>Platform</p>
				<PlatformModuleNav />
				<div className='mt-3 space-y-1'>
					{isSuperadmin ? (
						<Link href='/admin/settings' className='block rounded-lg px-3 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white'>
							Ustawienia platformy
						</Link>
					) : null}
					<LogoutButton />
				</div>
				<AdminModuleSidebar groups={navGroups} />
			</aside>

			<div className='lg:pl-64'>
				<header className='sticky top-0 z-10 border-b border-white/10 bg-[#132c43]/95 px-4 py-3 text-white backdrop-blur lg:hidden'>
					<div className='flex items-center justify-between gap-3'>
						<div className='flex items-center gap-2 font-black'><Image src='/oponexis-logo.svg' alt='Oponexis' width={120} height={21} priority className='h-auto w-24' /><span className='text-xs tracking-wide text-white/70'>PLATFORM</span></div>
						<LogoutButton compact />
					</div>
					<PlatformModuleNav compact />
					{isSuperadmin ? (
						<Link href='/admin/settings' className='mt-2 block rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-bold text-white/80'>
							Ustawienia platformy
						</Link>
					) : null}
				</header>
				<main className='mx-auto max-w-7xl px-4 pb-28 pt-6 text-[#132c43] lg:px-8 lg:pb-6'>
					{children}
				</main>
				<AdminMobileMenu groups={navGroups} />
			</div>
		</div>
	)
}
