'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Spin from './ui/Spin'

const PAGE_SIZE = 12

function dateText(value) {
	if (!value) return 'Bez daty'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'Europe/Warsaw',
	}).format(new Date(value))
}

function timeText(value) {
	if (!value) return ''
	return String(value).slice(0, 5)
}

function mapsHref(order) {
	if (typeof order.lat === 'number' && typeof order.lng === 'number') {
		return `https://www.google.com/maps?q=${order.lat},${order.lng}`
	}
	if (order.address) {
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
			order.address
		)}`
	}
	return null
}

export default function ReservationsPage() {
	const [view, setView] = useState('future')
	const [data, setData] = useState({ workOrders: [], reservations: [] })
	const [loading, setLoading] = useState(true)
	const [query, setQuery] = useState('')
	const [archiveSort, setArchiveSort] = useState('newest')
	const [selectedOrder, setSelectedOrder] = useState(null)
	const [page, setPage] = useState(1)
	const [deletingId, setDeletingId] = useState(null)

	useEffect(() => {
		async function load() {
			setLoading(true)
			setPage(1)
			const res = await fetch(`/api/admin/reservations?view=${view}`, {
				cache: 'no-store',
			})
			const json = await res.json()
			setData(json.data || { workOrders: [], reservations: [] })
			setLoading(false)
		}

		load()
	}, [view])

	const workOrders = useMemo(() => {
		const needle = query.trim().toLowerCase()
		const filtered = needle ? data.workOrders.filter(order =>
			[
				order.name,
				order.phone,
				order.service,
				order.address,
				order.carModel,
				order.regNumber,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(needle)
		) : data.workOrders

		if (view !== 'past') return filtered
		return filtered.slice().sort((a, b) => {
			if (archiveSort === 'oldest') {
				return new Date(a.visitDate || a.createdAt || 0) - new Date(b.visitDate || b.createdAt || 0)
			}
			if (archiveSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'pl')
			if (archiveSort === 'service') return String(a.service || '').localeCompare(String(b.service || ''), 'pl')
			return new Date(b.visitDate || b.createdAt || 0) - new Date(a.visitDate || a.createdAt || 0)
		})
	}, [archiveSort, data.workOrders, query, view])

	const totalPages = Math.max(1, Math.ceil(workOrders.length / PAGE_SIZE))
	const currentPage = Math.min(page, totalPages)
	const pagedWorkOrders = workOrders.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE
	)

	async function cancelOrder(order) {
		if (!order?.id) return
		setDeletingId(order.id)
		try {
			const res = await fetch(`/api/admin/reservations?id=${order.id}`, {
				method: 'DELETE',
			})
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Błąd anulowania')
			setData(current => ({
				...current,
				workOrders: current.workOrders.filter(item => item.id !== order.id),
			}))
			setSelectedOrder(null)
		} catch (error) {
			console.error(error)
			alert(error.message || 'Nie udało się anulować zlecenia.')
		} finally {
			setDeletingId(null)
		}
	}

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>Zlecenia</h1>
					<p className='text-sm text-[#d7e4ef]'>
						CRM-zlecenia, formularze wykonania i szybki podgląd danych klienta.
					</p>
				</div>
				<div className='flex flex-wrap rounded-md border border-white/15 bg-white/10 p-1'>
					<button
						type='button'
						onClick={() => setView('future')}
						className={`rounded-md px-3 py-2 text-sm font-bold ${
							view === 'future'
								? 'bg-[#fd6d02] text-white'
								: 'text-white hover:bg-white/10'
						}`}
					>
						Przyszłe
					</button>
					<button
						type='button'
						onClick={() => setView('incomplete')}
						className={`rounded-md px-3 py-2 text-sm font-bold ${
							view === 'incomplete'
								? 'bg-[#fd6d02] text-white'
								: 'text-white hover:bg-white/10'
						}`}
					>
						Do uzupełnienia
					</button>
					<button
						type='button'
						onClick={() => setView('past')}
						className={`rounded-md px-3 py-2 text-sm font-bold ${
							view === 'past'
								? 'bg-[#fd6d02] text-white'
								: 'text-white hover:bg-white/10'
						}`}
					>
						Archiwum
					</button>
				</div>
			</div>

			<div className={`grid gap-3 ${view === 'past' ? 'md:grid-cols-[1fr_240px]' : ''}`}>
				<input
					value={query}
					onChange={event => {
						setQuery(event.target.value)
						setPage(1)
					}}
					placeholder='Szukaj po imieniu, telefonie, usłudze, aucie albo adresie'
					className='opx-input'
				/>
				{view === 'past' ? (
					<label className='space-y-1 text-sm font-bold text-white'>
						<span>Sortowanie archiwum</span>
						<select
							value={archiveSort}
							onChange={event => {
								setArchiveSort(event.target.value)
								setPage(1)
							}}
							className='opx-input'
						>
							<option value='newest'>Najnowsze terminy</option>
							<option value='oldest'>Najstarsze terminy</option>
							<option value='name'>Klient A–Z</option>
							<option value='service'>Usługa A–Z</option>
						</select>
					</label>
				) : null}
			</div>

			{loading ? (
				<div className='py-10 text-center'>
					<Spin tip='Ładowanie zleceń...' />
				</div>
			) : (
				<div className='space-y-5'>
					<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
						{workOrders.length ? (
							pagedWorkOrders.map(order => (
								<button
									key={order.id}
									type='button'
									onClick={() => setSelectedOrder(order)}
									className='opx-panel rounded-md p-4 text-left transition hover:-translate-y-0.5 hover:border-[#fd6d02]'
								>
									<div className='flex items-start justify-between gap-3'>
										<div className='min-w-0'>
											<p className='truncate text-base font-bold'>{order.name}</p>
											<p className='text-sm text-[#5f7487]'>{order.phone}</p>
										</div>
										<span className='rounded-full bg-[#132c43] px-2.5 py-1 text-xs font-bold text-white'>
											#{order.id}
										</span>
									</div>
									<div className='mt-4 space-y-2 text-sm text-[#314a60]'>
										<p className='font-semibold text-[#132c43]'>
											{order.service || 'Brak usługi'}
										</p>
										<p>
											{dateText(order.visitDate)} {timeText(order.visitTime)}
										</p>
										{view === 'incomplete' ? (
											<p className='inline-flex rounded-full bg-[#fff4ec] px-2.5 py-1 text-xs font-bold text-[#b94700]'>
												Formularz nieuzupełniony
											</p>
										) : null}
										<p className='line-clamp-2'>{order.address || 'Brak adresu'}</p>
										{order.carModel || order.regNumber ? (
											<p className='text-[#5f7487]'>
												{[order.carModel, order.regNumber].filter(Boolean).join(' · ')}
											</p>
										) : null}
									</div>
								</button>
							))
						) : (
							<p className='opx-panel rounded-md p-4 text-sm text-[#5f7487] md:col-span-2 xl:col-span-3'>
								{view === 'incomplete'
									? 'Brak zleceń do uzupełnienia.'
									: 'Brak zleceń.'}
							</p>
						)}
					</div>

					{workOrders.length > PAGE_SIZE ? (
						<Pagination
							page={currentPage}
							totalPages={totalPages}
							onChange={setPage}
						/>
					) : null}
				</div>
			)}

			{selectedOrder ? (
				<div className='fixed inset-0 z-50 flex items-end bg-black/55 p-0 sm:items-center sm:p-4'>
					<div className='max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white p-4 text-[#132c43] shadow-2xl sm:mx-auto sm:max-w-2xl sm:rounded-lg sm:p-5'>
						<div className='flex items-start justify-between gap-4'>
							<div>
								<p className='text-sm font-bold text-[#fd6d02]'>
									Zlecenie #{selectedOrder.id}
								</p>
								<h2 className='mt-1 text-xl font-bold'>{selectedOrder.name}</h2>
								<p className='text-[#5f7487]'>{selectedOrder.phone}</p>
								{selectedOrder.customerId ? (
									<Link
										href={`/admin/customers/${selectedOrder.customerId}`}
										className='mt-1 inline-block text-sm font-bold text-[#2c70b7]'
									>
										Otwórz kartę klienta
									</Link>
								) : null}
							</div>
							<button
								type='button'
								onClick={() => setSelectedOrder(null)}
								className='rounded-md border border-[#d9e4ee] px-3 py-1.5 text-sm font-bold'
							>
								Zamknij
							</button>
						</div>

						<div className='mt-5 grid gap-3 text-sm sm:grid-cols-2'>
							<Detail label='Usługa' value={selectedOrder.service} />
							<Detail
								label='Termin'
								value={`${dateText(selectedOrder.visitDate)} ${timeText(
									selectedOrder.visitTime
								)}`}
							/>
							<Detail label='Auto' value={selectedOrder.carModel} />
							<Detail label='Rejestracja' value={selectedOrder.regNumber} />
							<Detail label='Kolor' value={selectedOrder.color} />
							<Detail label='Rozmiar felgi' value={selectedOrder.wheelRimSize} />
							<Detail label='Rozmiar opony' value={selectedOrder.tireSize} />
							<Detail label='Adres' value={selectedOrder.address} wide />
							<Detail label='Notatka' value={selectedOrder.notes} wide />
						</div>

						<div className='mt-5 flex flex-wrap gap-2'>
							<Link
								href={`/admin/work-order?id=${selectedOrder.id}`}
								className='opx-btn-primary px-4 py-2 text-sm'
							>
								Edytuj zlecenie
							</Link>
							<Link
								href={`/admin/work-order/complete?id=${selectedOrder.id}`}
								className='opx-btn-secondary px-4 py-2 text-sm'
							>
								Formularz wykonania
							</Link>
							<a
								href={`tel:${selectedOrder.phone}`}
								className='opx-btn-secondary px-4 py-2 text-sm'
							>
								Zadzwoń
							</a>
							{mapsHref(selectedOrder) ? (
								<a
									href={mapsHref(selectedOrder)}
									target='_blank'
									rel='noreferrer'
									className='opx-btn-secondary px-4 py-2 text-sm'
								>
									Mapa
								</a>
							) : null}
							<Button
								type='button'
								variant='secondary'
								loading={deletingId === selectedOrder.id}
								onClick={() => cancelOrder(selectedOrder)}
							>
								Anuluj / ukryj
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</section>
	)
}

function Pagination({ page, totalPages, onChange }) {
	return (
		<div className='flex flex-wrap items-center justify-center gap-2'>
			<Button
				type='button'
				onClick={() => onChange(Math.max(1, page - 1))}
				disabled={page === 1}
				variant='secondary'
			>
				Poprzednia
			</Button>
			<span className='rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white'>
				{page} / {totalPages}
			</span>
			<Button
				type='button'
				onClick={() => onChange(Math.min(totalPages, page + 1))}
				disabled={page === totalPages}
				variant='secondary'
			>
				Następna
			</Button>
		</div>
	)
}

function Detail({ label, value, wide = false }) {
	return (
		<div className={wide ? 'sm:col-span-2' : ''}>
			<p className='text-xs font-bold uppercase text-[#5f7487]'>{label}</p>
			<p className='mt-1 rounded-md bg-[#f4f8fb] px-3 py-2'>
				{value || 'Brak'}
			</p>
		</div>
	)
}
