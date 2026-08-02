import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
	buildCustomerTimeline,
	formatDate,
	formatDateTime,
	formatMoney,
	totalSpent,
} from '@/lib/customer-profile'
import { db } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function CustomerProfilePage({ params }) {
	const { id } = await params
	const customer = await db.customer.findUnique({
		where: { id },
		include: {
			leads: { orderBy: { createdAt: 'desc' }, take: 20 },
			workOrders: { orderBy: { createdAt: 'desc' }, take: 30 },
			completions: {
				where: { isTest: false, serviceUsed: { not: false } },
				orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
			},
			seasonStatuses: {
				orderBy: [{ year: 'desc' }, { updatedAt: 'desc' }],
				take: 12,
			},
			smsContactEvents: {
				orderBy: { occurredAt: 'desc' },
				take: 50,
				include: {
					campaign: { select: { id: true, name: true } },
				},
			},
		},
	})

	if (!customer) notFound()

	const spent = totalSpent(customer.completions)
	const visits = customer.completions.length
	const avg = visits ? spent / visits : 0
	const timeline = buildCustomerTimeline(customer)

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>
						{customer.name || 'Klient'}
					</h1>
					<p className='text-sm text-[#d7e4ef]'>{customer.phone}</p>
				</div>
				<Link
					href='/admin/season'
					className='rounded-md border border-white/30 bg-white px-3 py-2 text-sm font-bold text-[#132c43]'
				>
					Wróć do sezonu
				</Link>
			</div>

			<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
				<Stat label='Wykonane' value={visits} />
				<Stat label='LTV' value={formatMoney(spent)} />
				<Stat label='Średnio' value={formatMoney(avg)} />
				<Stat label='Źródło' value={customer.source || '-'} />
			</div>

			<div className='grid gap-4 xl:grid-cols-[1fr_340px]'>
				<div className='opx-panel rounded-md p-4'>
					<h2 className='font-bold text-[#132c43]'>Pełna historia klienta</h2>
					<p className='mt-1 text-sm text-[#5f7487]'>
						Zgłoszenia, rezerwacje, zlecenia i wykonane usługi w jednej osi czasu.
					</p>
					<div className='mt-3 space-y-2'>
						{timeline.map(item => (
							<TimelineCard key={item.id} item={item} />
						))}
						{!timeline.length ? (
							<p className='rounded-md bg-[#f4f8fb] p-3 text-sm text-[#5f7487]'>
								Brak historii klienta.
							</p>
						) : null}
					</div>
				</div>

				<div className='space-y-4'>
					<div className='opx-panel rounded-md p-4'>
						<h2 className='font-bold text-[#132c43]'>Dane klienta</h2>
						<div className='mt-3 space-y-2 text-sm text-[#314a60]'>
							<p>Telefon: {customer.phone}</p>
							<p>Płeć: {customer.gender || '-'}</p>
							<p>Źródło: {customer.source || '-'}</p>
							<p>Utworzony: {formatDate(customer.createdAt)}</p>
						</div>
					</div>

					<div className='opx-panel rounded-md p-4'>
						<h2 className='font-bold text-[#132c43]'>Zgłoszenia i zlecenia</h2>
						<div className='mt-3 grid grid-cols-2 gap-2'>
							<SmallStat label='Leady' value={customer.leads.length} />
							<SmallStat label='Zlecenia' value={customer.workOrders.length} />
						</div>
						<div className='mt-3 space-y-2 text-xs text-[#5f7487]'>
							{customer.workOrders.slice(0, 5).map(order => (
								<Link
									key={order.id}
									href={`/admin/work-order?id=${order.id}`}
									className='block rounded-md bg-[#f4f8fb] p-2 font-semibold text-[#314a60] hover:text-[#fd6d02]'
								>
									#{order.id} · {formatDateTime(order.visitDate, order.visitTime)} ·{' '}
									{order.service || 'Brak usługi'}
								</Link>
							))}
							{!customer.workOrders.length ? <p>Brak zleceń.</p> : null}
						</div>
					</div>

					<div className='opx-panel rounded-md p-4'>
						<h2 className='font-bold text-[#132c43]'>Kontakt sezonowy</h2>
						<div className='mt-3 space-y-2 text-sm'>
							{customer.seasonStatuses.map(item => (
								<div
									key={item.id}
									className='rounded-md bg-[#f4f8fb] p-2 text-[#314a60]'
								>
									<p className='font-bold text-[#132c43]'>
										{item.season} {item.year}
									</p>
									<p>{item.status}</p>
									{item.note ? <p className='text-xs'>{item.note}</p> : null}
								</div>
							))}
							{!customer.seasonStatuses.length ? (
								<p className='text-sm text-[#5f7487]'>Brak statusów kontaktu.</p>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}

function Stat({ label, value }) {
	return (
		<div className='opx-panel rounded-md p-4'>
			<p className='text-xs font-bold uppercase text-[#5f7487]'>{label}</p>
			<p className='mt-2 text-2xl font-black text-[#132c43]'>{value}</p>
		</div>
	)
}

function SmallStat({ label, value }) {
	return (
		<div className='rounded-md bg-[#f4f8fb] p-3'>
			<p className='text-xs font-bold uppercase text-[#5f7487]'>{label}</p>
			<p className='mt-1 text-xl font-black text-[#132c43]'>{value}</p>
		</div>
	)
}

function TimelineCard({ item }) {
	return (
		<div className='rounded-md border border-[#d9e4ee] p-3 text-sm'>
			<div className='flex flex-wrap items-start justify-between gap-2'>
				<div>
					<p className='font-bold text-[#132c43]'>
						{item.title}
					</p>
					<p className='text-xs text-[#5f7487]'>{formatDate(item.at)}</p>
				</div>
				<div className='flex flex-wrap items-center justify-end gap-2'>
					{item.amount != null ? (
						<p className='font-black text-[#132c43]'>{formatMoney(item.amount)}</p>
					) : null}
					<span className='rounded-full bg-[#fff4ec] px-2 py-1 text-xs font-black text-[#b94700]'>
						{item.status}
					</span>
				</div>
			</div>
			<p className='mt-2 font-semibold text-[#314a60]'>{item.primary}</p>
			<div className='mt-2 grid gap-1 text-xs text-[#5f7487]'>
				{item.meta?.map(line => (
					<span key={line}>{line}</span>
				))}
				{item.details?.map(line => (
					<span key={line}>{line}</span>
				))}
			</div>
			{item.workOrderId ? (
				<Link
					href={`/admin/work-order?id=${item.workOrderId}`}
					className='mt-3 inline-block text-xs font-bold text-[#2c70b7]'
				>
					Otwórz zlecenie #{item.workOrderId}
				</Link>
			) : null}
		</div>
	)
}
