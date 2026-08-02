import Link from 'next/link'
import { db } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const outcomeLabels = {
	interested: 'Zainteresowany',
	follow_up_required: 'Wymaga kontaktu',
	not_interested: 'Niezainteresowany',
	wrong_number: 'Błędny numer',
	other: 'Inne',
}

const dayFormatter = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' })
const dateTimeFormatter = new Intl.DateTimeFormat('pl-PL', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
})

function callerKey(event) {
	return event.customerId || event.phone || `call:${event.callRef}`
}

function latestBy(items, keyFor) {
	const result = new Map()
	for (const item of items) {
		const key = keyFor(item)
		if (!result.has(key)) result.set(key, item)
	}
	return result
}

function Metric({ label, value, hint }) {
	return (
		<div className='rounded-2xl border border-[#dbe6ee] bg-white p-5 shadow-sm'>
		<p className='text-xs font-bold uppercase tracking-wide text-[#7890a4]'>{label}</p>
		<p className='mt-2 text-3xl font-black text-[#132c43]'>{value}</p>
		{hint ? <p className='mt-1 text-xs text-[#7890a4]'>{hint}</p> : null}
		</div>
	)
}

function Bars({ rows, emptyLabel }) {
	const maximum = Math.max(...rows.map(row => row.value), 1)
	if (!rows.length) return <p className='text-sm text-[#7890a4]'>{emptyLabel}</p>
	return (
		<div className='space-y-3'>
			{rows.map(row => (
				<div key={row.label}>
					<div className='mb-1 flex items-center justify-between gap-4 text-sm'>
						<span className='font-semibold text-[#29445b]'>{row.label}</span>
						<span className='font-black text-[#132c43]'>{row.value}</span>
					</div>
					<div className='h-2 overflow-hidden rounded-full bg-[#edf3f7]'>
						<div className='h-full rounded-full bg-[#1769aa]' style={{ width: `${Math.max((row.value / maximum) * 100, 4)}%` }} />
					</div>
				</div>
			))}
		</div>
	)
}

export default async function PerformancePage() {
	const now = new Date()
	const since = new Date(now)
	since.setDate(since.getDate() - 30)

	const events = await db.mobileCallEvent.findMany({
		where: { receivedAt: { gte: since } },
		orderBy: { resolvedAt: 'desc' },
		include: {
			customer: {
				select: {
					id: true,
					name: true,
					phone: true,
					source: true,
					_count: { select: { workOrders: true } },
				},
			},
		},
	})

	const calls = [...latestBy(events, event => event.callRef).values()]
	const callers = latestBy(calls, callerKey)
	const callCountByCaller = new Map()
	for (const call of calls) {
		const key = callerKey(call)
		callCountByCaller.set(key, (callCountByCaller.get(key) || 0) + 1)
	}

	const interested = calls.filter(call => call.outcomeCode === 'interested').length
	const followUps = [...callers.values()].filter(call => call.outcomeCode === 'follow_up_required')
	const recognized = calls.filter(call => call.customerId).length
	const repeatCallers = [...callCountByCaller.values()].filter(count => count > 1).length
	const customersWithOrders = [...callers.values()].filter(call => call.customer?._count.workOrders > 0).length

	const outcomes = Object.entries(outcomeLabels).map(([code, label]) => ({
		label,
		value: calls.filter(call => call.outcomeCode === code).length,
	}))

	const sourceCounts = new Map()
	for (const call of calls) {
		const source = call.customer?.source?.trim() || 'Nieznane źródło'
		sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1)
	}
	const sources = [...sourceCounts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, 8)

	const dailyCounts = new Map()
	for (let offset = 13; offset >= 0; offset -= 1) {
		const day = new Date(now)
		day.setHours(0, 0, 0, 0)
		day.setDate(day.getDate() - offset)
		dailyCounts.set(day.toISOString().slice(0, 10), 0)
	}
	for (const call of calls) {
		const key = new Date(call.resolvedAt).toISOString().slice(0, 10)
		if (dailyCounts.has(key)) dailyCounts.set(key, dailyCounts.get(key) + 1)
	}
	const days = [...dailyCounts.entries()].map(([date, value]) => ({ label: dayFormatter.format(new Date(`${date}T12:00:00`)), value }))

	return (
		<section className='space-y-6'>
			<div>
				<p className='text-sm font-bold uppercase tracking-wide text-[#89a7bf]'>Oponexis Platform</p>
				<h1 className='text-3xl font-black text-[#132c43]'>Performance</h1>
				<p className='mt-2 max-w-3xl text-sm text-[#5f7487]'>Rzeczywiste wyniki połączeń zsynchronizowanych z Companion. Zakres: ostatnie 30 dni.</p>
			</div>

			<div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-6'>
				<Metric label='Połączenia' value={calls.length} hint='unikalne rozmowy' />
				<Metric label='Rozmówcy' value={callers.size} hint='unikalne osoby lub numery' />
				<Metric label='Rozpoznane w CRM' value={recognized} hint={`${calls.length ? Math.round((recognized / calls.length) * 100) : 0}% połączeń`} />
				<Metric label='Zainteresowani' value={interested} />
				<Metric label='Do kontaktu' value={followUps.length} hint='najnowszy status rozmówcy' />
				<Metric label='Powracający rozmówcy' value={repeatCallers} hint={`Z zamówieniem: ${customersWithOrders}`} />
			</div>

			<div className='grid gap-6 xl:grid-cols-3'>
				<div className='rounded-2xl border border-[#dbe6ee] bg-white p-6 shadow-sm xl:col-span-2'>
					<h2 className='mb-5 text-lg font-black text-[#132c43]'>Połączenia — ostatnie 14 dni</h2>
					<Bars rows={days} emptyLabel='Brak połączeń w tym okresie.' />
				</div>
				<div className='rounded-2xl border border-[#dbe6ee] bg-white p-6 shadow-sm'>
					<h2 className='mb-5 text-lg font-black text-[#132c43]'>Wyniki rozmów</h2>
					<Bars rows={outcomes} emptyLabel='Brak wybranych wyników.' />
				</div>
			</div>

			<div className='grid gap-6 xl:grid-cols-2'>
				<div className='rounded-2xl border border-[#dbe6ee] bg-white p-6 shadow-sm'>
					<h2 className='mb-5 text-lg font-black text-[#132c43]'>Źródła rozpoznanych klientów</h2>
					<Bars rows={sources} emptyLabel='Brak danych o źródłach.' />
				</div>
				<div className='rounded-2xl border border-[#dbe6ee] bg-white p-6 shadow-sm'>
					<h2 className='text-lg font-black text-[#132c43]'>Wymagany ponowny kontakt</h2>
					<p className='mb-4 mt-1 text-xs text-[#7890a4]'>Lista uwzględnia najnowszy status każdego rozmówcy.</p>
					<div className='divide-y divide-[#e5edf3]'>
						{followUps.slice(0, 10).map(call => (
							<div key={callerKey(call)} className='flex items-center justify-between gap-4 py-3'>
								<div className='min-w-0'>
									{call.customerId ? (
										<Link href={`/admin/customers/${call.customerId}`} className='font-bold text-[#1769aa] hover:underline'>
											{call.customer?.name || call.phone || 'Klient CRM'}
										</Link>
									) : <p className='font-bold'>{call.phone || 'Nieznany numer'}</p>}
									<p className='truncate text-xs text-[#7890a4]'>{call.customer?.source || 'Źródło nieznane'} · {dateTimeFormatter.format(call.resolvedAt)}</p>
								</div>
								<span className='shrink-0 rounded-full bg-[#fff3cc] px-3 py-1 text-xs font-bold text-[#8a6500]'>{callCountByCaller.get(callerKey(call))} poł.</span>
							</div>
						))}
						{!followUps.length ? <p className='py-8 text-center text-sm text-[#7890a4]'>Brak zaległych kontaktów.</p> : null}
					</div>
				</div>
			</div>

			<div className='overflow-hidden rounded-2xl border border-[#dbe6ee] bg-white shadow-sm'>
				<div className='border-b border-[#e5edf3] px-6 py-5'><h2 className='text-lg font-black text-[#132c43]'>Ostatnie połączenia</h2></div>
				<div className='overflow-x-auto'>
					<table className='w-full min-w-[760px] text-left text-sm'>
						<thead className='bg-[#f6f9fb] text-xs uppercase tracking-wide text-[#7890a4]'><tr><th className='px-6 py-3'>Data</th><th className='px-6 py-3'>Klient</th><th className='px-6 py-3'>Wynik</th><th className='px-6 py-3'>Źródło</th><th className='px-6 py-3'>Połączenia</th></tr></thead>
						<tbody className='divide-y divide-[#e5edf3]'>
							{calls.slice(0, 30).map(call => (
								<tr key={call.callRef}>
									<td className='px-6 py-4 text-[#5f7487]'>{dateTimeFormatter.format(call.resolvedAt)}</td>
									<td className='px-6 py-4 font-semibold'>{call.customer?.name || call.phone || 'Nieznany numer'}</td>
									<td className='px-6 py-4'>{outcomeLabels[call.outcomeCode] || call.outcomeCode}</td>
									<td className='px-6 py-4 text-[#5f7487]'>{call.customer?.source || 'Nieznane'}</td>
									<td className='px-6 py-4 font-bold'>{callCountByCaller.get(callerKey(call))}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	)
}
