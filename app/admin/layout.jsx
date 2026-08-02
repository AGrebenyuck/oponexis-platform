import AdminShell from './_components/AdminShell'
import { redirect } from 'next/navigation'
import { readPlatformSession } from '@/lib/platform-auth'

export default async function AdminLayout({ children }) {
	const session = await readPlatformSession()
	if (!session) redirect('/login')
	return <AdminShell role={session.role}>{children}</AdminShell>
}
