import { redirect } from 'next/navigation'
import { getPlatformAuthOverview, readPlatformSession } from '@/lib/platform-auth'
import PlatformSettingsClient from './PlatformSettingsClient'

export const dynamic = 'force-dynamic'

function formatDate(value) {
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(value)
}

export default async function PlatformSettingsPage() {
	const session = await readPlatformSession()
	if (session?.role !== 'SUPERADMIN') redirect('/admin/dashboard')
	const { credentials, setting, sessions } = await getPlatformAuthOverview()
	const orderedCredentials = ['ADMIN', 'SUPERADMIN'].map(role => {
		const credential = credentials.find(item => item.role === role)
		return {
			role,
			updatedAtLabel: credential ? formatDate(credential.updatedAt) : 'brak konfiguracji',
		}
	})

	return (
		<section className='space-y-5'>
			<div>
				<p className='text-xs font-bold uppercase tracking-[0.16em] text-[#fd6d02]'>Superadministrator</p>
				<h1 className='mt-1 text-2xl font-semibold text-white'>Ustawienia platformy</h1>
				<p className='mt-1 text-sm text-[#d7e4ef]'>
					Zarządzanie dostępem i czasem zapamiętania urządzeń.
				</p>
			</div>
			<div className='rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
				Hasła nie są wyświetlane ani przechowywane w otwartym tekście. Można je wyłącznie bezpiecznie zmienić.
			</div>
			<PlatformSettingsClient
				initialSessionDays={setting.sessionDays}
				credentials={orderedCredentials}
				initialSessions={sessions.map(item => ({
					id: item.id,
					role: item.role,
					deviceLabel: item.deviceLabel || 'Nieznane urządzenie',
					ipAddress: item.ipAddress || 'brak danych',
					createdAtLabel: formatDate(item.createdAt),
					lastSeenAtLabel: formatDate(item.lastSeenAt),
					expiresAtLabel: formatDate(item.expiresAt),
					current: item.id === session.sessionId,
				}))}
			/>
		</section>
	)
}
