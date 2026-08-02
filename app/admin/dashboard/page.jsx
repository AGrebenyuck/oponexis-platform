import { db } from '@/lib/prisma'
import {
	formatMoney,
	getCustomerAnalyticsRows,
	groupCounts,
	isActiveCustomerRow,
	isRealCompletion,
	splitServiceNames,
} from '@/lib/crmAnalytics'
import { seasonFromDate, seasonPeriodLabel, seasonYearFromDate } from '@/lib/season'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

function percent(value, total) {
	if (!total) return '0%'
	return `${Math.round((value / total) * 100)}%`
}

function serializeCustomer(row) {
	return {
		id: row.id,
		name: row.name,
		phone: row.phone,
		source: row.source,
		totalOrders: row.totalOrders,
		totalSpent: row.totalSpent,
		totalSpentLabel: formatMoney(row.totalSpent),
		latestActivity: row.latestActivity ? new Date(row.latestActivity).toISOString() : null,
		services: row.services,
		hasStorage: row.hasStorage,
		kind: 'customer',
	}
}

function serializeCompletion(row) {
	const date = row.completedAt || row.createdAt
	return {
		id: row.id,
		customerId: row.customerId,
		name: row.name || 'Brak imienia',
		phone: row.phone,
		source: row.source || 'Nieznane',
		totalOrders: 1,
		totalSpent: row.amount || 0,
		totalSpentLabel: formatMoney(row.amount || 0),
		latestActivity: date ? new Date(date).toISOString() : null,
		services: splitServiceNames(row.serviceNames || []),
		kind: 'order',
	}
}

function modalGroup(title, rows, kind = 'customer') {
	return {
		title,
		kind,
		rows: kind === 'order' ? rows : rows.map(serializeCustomer),
	}
}

function DashboardUnavailable({ error }) {
	const message =
		error?.message?.split('\n').find(line => line.includes("Can't reach database server")) ||
		error?.message ||
		'Nie udało się pobrać danych dashboardu.'

	return (
		<section className='space-y-6'>
			<div>
				<p className='text-sm font-bold uppercase tracking-wide text-[#89a7bf]'>Dashboard</p>
				<h1 className='text-3xl font-black text-white'>Panel wyników</h1>
			</div>
			<div className='rounded-md border border-red-300 bg-red-50 p-5 text-[#7f1d1d]'>
				<p className='text-lg font-black'>Nie udało się połączyć z bazą danych.</p>
				<p className='mt-2 text-sm'>
					Neon albo połączenie sieciowe chwilowo nie odpowiada. Sprawdź `DATABASE_URL`,
					dostępność Neon i połączenie z internetem, a potem odśwież stronę.
				</p>
				<pre className='mt-4 overflow-auto rounded-md bg-white/80 p-3 text-xs text-[#7f1d1d]'>
					{message}
				</pre>
				<a
					href='/admin/dashboard'
					className='mt-4 inline-flex rounded-md bg-[#132c43] px-4 py-2 text-sm font-bold text-white no-underline'
				>
					Odśwież dashboard
				</a>
			</div>
		</section>
	)
}

async function getDashboardData() {
	const [customers, completions, campaigns, events] = await Promise.all([
		getCustomerAnalyticsRows(),
		db.workOrderCompletion.findMany({ where: { isTest: false } }),
		db.smsCampaign.findMany({
			orderBy: { createdAt: 'desc' },
			take: 5,
			include: { recipients: true },
		}),
		db.smsContactEvent.findMany({
			where: { direction: 'IN' },
			orderBy: { occurredAt: 'desc' },
			take: 20,
		}),
	])

	return { customers, completions, campaigns, events }
}

export default async function DashboardPage() {
	let data
	try {
		data = await getDashboardData()
	} catch (error) {
		console.error('[admin dashboard] failed to load data', error)
		return <DashboardUnavailable error={error} />
	}

	const { customers, completions, campaigns, events } = data

	const activeCustomers = customers.filter(isActiveCustomerRow)
	const realCompletions = completions.filter(isRealCompletion)
	const submittedForms = completions.filter(item => !item.isTest)
	const revenue = realCompletions.reduce((sum, item) => sum + (item.amount || 0), 0)
	const returningCustomers = activeCustomers.filter(item => item.totalOrders >= 2)
	const averageCheck = realCompletions.length ? revenue / realCompletions.length : 0
	const storageCustomers = activeCustomers.filter(item => item.hasStorage)
	const sentRecipients = campaigns.flatMap(item => item.recipients).filter(item =>
		['QUEUED', 'PROCESSED', 'SENT', 'DELIVERED', 'BOOKED', 'INTERESTED', 'CALL_BACK'].includes(
			item.status
		)
	)
	const bookedRecipients = campaigns
		.flatMap(item => item.recipients)
		.filter(item => item.status === 'BOOKED')

	const services = groupCounts(realCompletions.flatMap(item => splitServiceNames(item.serviceNames)))
	const sources = groupCounts(activeCustomers.map(item => item.source))
	const seasonOrders = Object.values(
		realCompletions.reduce((acc, item) => {
			const date = item.completedAt || item.createdAt
			const season = seasonFromDate(date)
			const year = seasonYearFromDate(date)
			const key = `${year}-${season}`
			acc[key] ||= {
				key,
				season,
				year,
				label: seasonPeriodLabel(season, year),
				orders: 0,
				revenue: 0,
				rows: [],
			}
			acc[key].orders += 1
			acc[key].revenue += item.amount || 0
			acc[key].rows.push(serializeCompletion(item))
			return acc
		}, {})
	)
		.map(item => ({ ...item, revenue: Math.round(item.revenue), revenueLabel: formatMoney(item.revenue) }))
		.sort((a, b) => a.key.localeCompare(b.key))
		.slice(-6)

	const sourceGroups = activeCustomers.reduce((acc, customer) => {
		const key = customer.source || 'Nieznane'
		acc[key] ||= []
		acc[key].push(customer)
		return acc
	}, {})
	const modalGroups = {
		contacts: modalGroup('Kontakty w bazie', customers),
		active: modalGroup('Aktywni klienci', activeCustomers),
		returning: modalGroup('Powracający klienci', returningCustomers),
		storage: modalGroup('Klienci z przechowaniem', storageCustomers),
		sourcesAll: modalGroup('Źródła klientów', activeCustomers),
		sources: Object.fromEntries(
			Object.entries(sourceGroups).map(([source, rows]) => [
				source,
				modalGroup(`Źródło: ${source}`, rows),
			])
		),
		seasons: Object.fromEntries(
			seasonOrders.map(item => [
				item.key,
				modalGroup(
					`Sezon: ${item.label}`,
					item.rows,
					'order'
				),
			])
		),
	}

	const kpis = [
		{
			label: 'Kontakty w bazie',
			value: customers.length,
			hint: 'Customer bez testowych',
			modalKey: 'contacts',
		},
		{
			label: 'Aktywni klienci',
			value: activeCustomers.length,
			hint: 'lead, zlecenie albo wykonanie',
			modalKey: 'active',
		},
		{
			label: 'Powracający',
			value: returningCustomers.length,
			hint: percent(returningCustomers.length, activeCustomers.length),
			modalKey: 'returning',
		},
		{
			label: 'Formularze wykonania',
			value: submittedForms.length,
			hint: `${realCompletions.length} płatnych/użytych`,
			href: '/admin/forms',
		},
		{
			label: 'Przychód wykonany',
			value: formatMoney(revenue),
			hint: 'z płatnych formularzy',
			href: '/admin/forms',
		},
		{
			label: 'Średni rachunek',
			value: formatMoney(averageCheck),
			hint: 'z wykonanych zleceń',
			href: '/admin/forms',
		},
		{
			label: 'Z przechowaniem',
			value: storageCustomers.length,
			hint: percent(storageCustomers.length, activeCustomers.length),
			modalKey: 'storage',
		},
		{
			label: 'SMS odpowiedzi',
			value: events.length,
			hint: 'ostatnie inbound',
			href: '/admin/sms-inbox',
		},
	]

	return (
		<DashboardClient
			kpis={kpis}
			services={services}
			sources={sources}
			seasonOrders={seasonOrders.map(({ rows, ...item }) => item)}
			campaigns={campaigns.map(campaign => ({
				id: campaign.id,
				name: campaign.name,
				status: campaign.status,
				createdAt: campaign.createdAt.toISOString(),
			}))}
			sentRecipientsCount={sentRecipients.length}
			bookedRecipientsCount={bookedRecipients.length}
			modalGroups={modalGroups}
		/>
	)
}
