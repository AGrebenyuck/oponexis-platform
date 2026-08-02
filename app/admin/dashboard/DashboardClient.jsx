'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

const PAGE_SIZE = 12
const palette = [
	'#fd6d02',
	'#2c70b7',
	'#12a37f',
	'#f59e0b',
	'#8b5cf6',
	'#64748b',
	'#e11d48',
	'#0891b2',
	'#65a30d',
	'#c026d3',
	'#0f766e',
	'#ca8a04',
	'#475569',
]

function formatDate(value) {
	if (!value) return '-'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(new Date(value))
}

function BarRow({ label, value, max, onClick }) {
	const width = max ? Math.max(6, Math.round((value / max) * 100)) : 0
	const content = (
		<>
			<div className='flex items-center justify-between gap-3 text-sm'>
				<span className='truncate font-medium text-[#132c43]'>{label}</span>
				<span className='shrink-0 font-bold text-[#132c43]'>{value}</span>
			</div>
			<div className='h-2 rounded-full bg-[#e7eef4]'>
				<div className='h-2 rounded-full bg-[#fd6d02]' style={{ width: `${width}%` }} />
			</div>
		</>
	)
	if (!onClick) return <div className='space-y-1'>{content}</div>
	return (
		<button
			type='button'
			onClick={onClick}
			className='w-full space-y-1 rounded-md p-2 text-left transition hover:bg-[#f4f8fb] focus:outline-none focus:ring-2 focus:ring-[#fd6d02]'
		>
			{content}
		</button>
	)
}

function CustomerModal({ modal, onClose }) {
	const [page, setPage] = useState(1)
	const [sortKey, setSortKey] = useState('latest')
	const rows = useMemo(() => modal?.rows || [], [modal])
	const sortedRows = useMemo(() => {
		return rows.slice().sort((a, b) => {
			if (sortKey === 'orders') return b.totalOrders - a.totalOrders
			if (sortKey === 'revenue') return b.totalSpent - a.totalSpent
			if (sortKey === 'name') return a.name.localeCompare(b.name, 'pl')
			return new Date(b.latestActivity || 0) - new Date(a.latestActivity || 0)
		})
	}, [rows, sortKey])
	const isOrderList = modal?.kind === 'order'
	const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
	const safePage = Math.min(page, pageCount)
	const visible = sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

	if (!modal) return null

	return (
		<div className='fixed inset-0 z-50 flex items-end bg-black/60 p-0 sm:items-center sm:p-4'>
			<div className='mx-auto max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-t-md bg-white shadow-2xl sm:rounded-md'>
				<div className='flex items-start justify-between gap-3 border-b border-[#d9e4ee] p-4'>
					<div>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>Drill-down</p>
						<h2 className='text-xl font-black text-[#132c43]'>{modal.title}</h2>
						<p className='text-sm text-[#5f7487]'>{rows.length} pozycji</p>
					</div>
					<button
						type='button'
						onClick={onClose}
						className='rounded-md border border-[#d9e4ee] px-3 py-1.5 text-sm font-bold text-[#132c43]'
					>
						Zamknij
					</button>
				</div>
				<div className='flex items-center justify-end border-b border-[#eef3f7] px-4 py-2'>
					<label className='flex items-center gap-2 text-sm text-[#5f7487]'>
						Sortuj
						<select
							value={sortKey}
							onChange={event => {
								setSortKey(event.target.value)
								setPage(1)
							}}
							className='rounded-md border border-[#d9e4ee] bg-white px-2 py-1 text-[#132c43]'
						>
							<option value='latest'>Ostatnia aktywność</option>
							{!isOrderList ? <option value='orders'>Liczba zamówień</option> : null}
							<option value='revenue'>Wartość</option>
							<option value='name'>Imię</option>
						</select>
					</label>
				</div>
				<div className='max-h-[60vh] divide-y divide-[#eef3f7] overflow-y-auto'>
					{visible.map(row => {
						const content = (
							<>
							<div>
								<p className='font-bold text-[#132c43]'>{row.name}</p>
								<p className='text-[#5f7487]'>{row.phone}</p>
							</div>
							<p className='text-[#314a60]'>{row.source}</p>
							<p className='font-bold text-[#132c43]'>
								{isOrderList ? row.services.join(', ') || 'Usługa' : row.totalOrders}
							</p>
							<div>
								<p className='font-bold text-[#132c43]'>{row.totalSpentLabel}</p>
								<p className='text-xs text-[#5f7487]'>{formatDate(row.latestActivity)}</p>
							</div>
							</>
						)
						const className =
							'grid gap-2 px-4 py-3 text-sm no-underline hover:bg-[#f8fbfd] sm:grid-cols-[1.1fr_120px_1fr_1fr]'
						return row.customerId || row.kind === 'customer' ? (
							<Link
								key={row.id}
								href={`/admin/customers/${row.customerId || row.id}`}
								className={className}
							>
								{content}
							</Link>
						) : (
							<div key={row.id} className={className}>
								{content}
							</div>
						)
					})}
					{!visible.length ? (
						<p className='p-4 text-sm text-[#5f7487]'>Brak pozycji.</p>
					) : null}
				</div>
				<div className='flex items-center justify-between border-t border-[#d9e4ee] p-4 text-sm'>
					<button
						type='button'
						disabled={safePage <= 1}
						onClick={() => setPage(value => Math.max(1, value - 1))}
						className='rounded-md border border-[#d9e4ee] px-3 py-2 font-bold text-[#132c43] disabled:opacity-40'
					>
						Poprzednia
					</button>
					<span className='font-bold text-[#5f7487]'>
						{safePage} / {pageCount}
					</span>
					<button
						type='button'
						disabled={safePage >= pageCount}
						onClick={() => setPage(value => Math.min(pageCount, value + 1))}
						className='rounded-md border border-[#d9e4ee] px-3 py-2 font-bold text-[#132c43] disabled:opacity-40'
					>
						Następna
					</button>
				</div>
			</div>
		</div>
	)
}

function DonutCard({ title, description, items, onOpen }) {
	const total = items.reduce((sum, item) => sum + item.count, 0)

	return (
		<div className='opx-panel rounded-md p-4'>
			<p className='text-xs font-bold uppercase text-[#5f7487]'>{title}</p>
			{description ? <p className='mt-1 text-xs text-[#5f7487]'>{description}</p> : null}
			<div className='mt-4 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center'>
				<div
					className='relative mx-auto h-40 w-40'
					role='img'
					aria-label={`${title}: ${total} klientów`}
				>
					<ResponsiveContainer width='100%' height='100%'>
						<PieChart>
							<Tooltip
								formatter={(value, name) => [
									`${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`,
									name,
								]}
								contentStyle={{
									border: '1px solid #d9e4ee',
									borderRadius: 8,
									boxShadow: '0 10px 24px rgba(19, 44, 67, 0.14)',
								}}
							/>
							<Pie
								data={items}
								dataKey='count'
								nameKey='label'
								innerRadius={43}
								outerRadius={72}
								paddingAngle={items.length > 1 ? 1 : 0}
								stroke='white'
								strokeWidth={2}
							>
								{items.map((item, index) => (
									<Cell
										key={item.label}
										fill={palette[index % palette.length]}
										className='cursor-pointer outline-none'
										onClick={() => onOpen(`source:${item.label}`)}
									/>
								))}
							</Pie>
						</PieChart>
					</ResponsiveContainer>
					<button
						type='button'
						onClick={() => onOpen('source:all')}
						className='absolute inset-0 m-auto flex h-20 w-20 items-center justify-center rounded-full text-center text-sm font-bold text-[#132c43] focus:outline-none focus:ring-2 focus:ring-[#fd6d02]'
						aria-label={`Otwórz wszystkich klientów: ${total}`}
					>
						{total}
					</button>
				</div>
				<div className='space-y-2'>
					{items.map((item, index) => (
						<button
							key={item.label}
							type='button'
							onClick={() => onOpen(`source:${item.label}`)}
							className='flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-[#f4f8fb]'
						>
							<span className='flex min-w-0 items-center gap-2 text-[#314a60]'>
								<span
									className='h-3 w-3 shrink-0 rounded-full'
									style={{ backgroundColor: palette[index % palette.length] }}
								/>
								<span className='truncate'>{item.label}</span>
							</span>
							<span className='font-bold text-[#132c43]'>{item.count}</span>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}

export default function DashboardClient({
	kpis,
	services,
	sources,
	seasonOrders,
	campaigns,
	sentRecipientsCount,
	bookedRecipientsCount,
	modalGroups,
}) {
	const [modalKey, setModalKey] = useState(null)
	const modal = useMemo(() => {
		if (!modalKey) return null
		if (modalKey === 'source:all') return modalGroups.sourcesAll
		if (modalKey.startsWith('source:')) {
			return modalGroups.sources[modalKey.slice('source:'.length)]
		}
		if (modalKey.startsWith('season:')) {
			return modalGroups.seasons[modalKey.slice('season:'.length)]
		}
		return modalGroups[modalKey]
	}, [modalGroups, modalKey])
	const maxService = Math.max(...services.map(item => item.count), 1)
	const maxSeasonOrders = Math.max(...seasonOrders.map(item => item.orders), 1)

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>Dashboard</h1>
					<p className='text-sm text-[#d7e4ef]'>
						Najważniejsze liczby: baza, wykonania, powroty i kampanie.
					</p>
				</div>
				<div className='flex flex-wrap gap-2'>
					<Link
						href='/admin/clients'
						className='rounded-md bg-white px-4 py-2 text-sm font-bold text-[#132c43]'
					>
						Klienci
					</Link>
					<Link
						href='/admin/segments'
						className='rounded-md bg-[#fd6d02] px-4 py-2 text-sm font-bold text-white'
					>
						Segmenty
					</Link>
				</div>
			</div>

			<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
				{kpis.map(item =>
					item.href ? (
						<Link key={item.label} href={item.href} className='opx-panel rounded-md p-4 no-underline'>
							<p className='text-xs font-bold uppercase text-[#5f7487]'>{item.label}</p>
							<p className='mt-2 text-2xl font-semibold text-[#132c43]'>{item.value}</p>
							<p className='mt-1 text-xs text-[#5f7487]'>{item.hint}</p>
						</Link>
					) : (
						<button
							key={item.label}
							type='button'
							onClick={() => setModalKey(item.modalKey)}
							className='opx-panel rounded-md p-4 text-left transition hover:border-[#fd6d02]'
						>
							<p className='text-xs font-bold uppercase text-[#5f7487]'>{item.label}</p>
							<p className='mt-2 text-2xl font-semibold text-[#132c43]'>{item.value}</p>
							<p className='mt-1 text-xs text-[#5f7487]'>{item.hint}</p>
						</button>
					)
				)}
			</div>

			<div className='grid gap-4 xl:grid-cols-[1.05fr_0.95fr]'>
				<div className='opx-panel rounded-md p-4'>
					<div className='flex items-center justify-between gap-3'>
						<div>
							<p className='text-xs font-bold uppercase text-[#5f7487]'>Usługi</p>
							<h2 className='mt-1 text-lg font-bold text-[#132c43]'>Co realnie sprzedajemy</h2>
						</div>
						<Link href='/admin/forms' className='text-sm font-bold text-[#fd6d02]'>
							Formularz
						</Link>
					</div>
					<div className='mt-4 space-y-3'>
						{services.map(item => (
							<BarRow key={item.label} label={item.label} value={item.count} max={maxService} />
						))}
					</div>
				</div>

				<DonutCard
					title='Źródła klientów'
					description='Unikalni aktywni klienci w CRM — nie liczba formularzy wykonania.'
					items={sources}
					onOpen={setModalKey}
				/>
			</div>

			<div className='grid gap-4 xl:grid-cols-2'>
				<div className='opx-panel rounded-md p-4'>
					<div className='flex items-center justify-between gap-3'>
						<div>
							<p className='text-xs font-bold uppercase text-[#5f7487]'>Sezony</p>
							<h2 className='mt-1 text-lg font-bold text-[#132c43]'>Zamówienia po sezonach</h2>
						</div>
						<Link href='/admin/segments' className='text-sm font-bold text-[#fd6d02]'>
							Segmenty
						</Link>
					</div>
					<div className='mt-4 space-y-3'>
						{seasonOrders.map(item => (
							<BarRow
								key={item.key}
								label={`${item.label} · ${item.revenueLabel}`}
								value={item.orders}
								max={maxSeasonOrders}
								onClick={() => setModalKey(`season:${item.key}`)}
							/>
						))}
					</div>
				</div>

				<div className='opx-panel rounded-md p-4'>
					<div className='flex items-center justify-between gap-3'>
						<div>
							<p className='text-xs font-bold uppercase text-[#5f7487]'>SMS</p>
							<h2 className='mt-1 text-lg font-bold text-[#132c43]'>Ostatnie kampanie</h2>
						</div>
						<Link href='/admin/sms-campaigns' className='text-sm font-bold text-[#fd6d02]'>
							Wszystkie
						</Link>
					</div>
					<div className='mt-4 divide-y divide-[#eef3f7]'>
						{campaigns.map(campaign => (
							<Link
								key={campaign.id}
								href={`/admin/sms-campaigns/${campaign.id}`}
								className='block py-3 no-underline'
							>
								<div className='flex items-center justify-between gap-3'>
									<div>
										<p className='font-bold text-[#132c43]'>{campaign.name}</p>
										<p className='text-sm text-[#5f7487]'>{formatDate(campaign.createdAt)}</p>
									</div>
									<span className='rounded-full bg-[#eef3f7] px-3 py-1 text-xs font-bold text-[#132c43]'>
										{campaign.status}
									</span>
								</div>
							</Link>
						))}
						{!campaigns.length ? <p className='py-3 text-sm text-[#5f7487]'>Brak kampanii.</p> : null}
					</div>
					<p className='mt-3 text-sm text-[#5f7487]'>
						Wysłane w ostatnich kampaniach: {sentRecipientsCount}. Umówieni:{' '}
						{bookedRecipientsCount}.
					</p>
				</div>
			</div>

			<CustomerModal
				key={modalKey || 'closed'}
				modal={modal}
				onClose={() => setModalKey(null)}
			/>
		</section>
	)
}
