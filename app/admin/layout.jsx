import AdminShell from './_components/AdminShell'
import { redirect } from 'next/navigation'
import { readPlatformSession } from '@/lib/platform-auth'

export default async function AdminLayout({ children }) {
	const session = await readPlatformSession()
	if (!session) redirect('/login')
	const databaseTarget = process.env.OPONEXIS_DB_TARGET || (process.env.NODE_ENV === 'production' ? 'production' : 'development')
	return <AdminShell role={session.role} databaseTarget={databaseTarget}>{children}</AdminShell>
}
