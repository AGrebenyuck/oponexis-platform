'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '../_components/ui/Button'

function formatDate(value) {
	if (!value) return '-'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(new Date(value))
}

function formatMoney(value) {
	return `${Math.round(Number(value) || 0).toLocaleString('pl-PL')} zł`
}

export default function SegmentsAudience({ rows, filters }) {
	const router = useRouter()
	const [selected, setSelected] = useState(() => new Set(rows.map(item => item.id)))
	const [campaignOpen, setCampaignOpen] = useState(false)
	const [creating, setCreating] = useState(false)
	const [error, setError] = useState('')
	const [form, setForm] = useState({
		name: 'Kampania z segmentu',
		message:
			'Cześć {firstName}, tu Oponexis. Zbliża się sezon wymiany opon. Chcesz umówić termin? Odpisz TAK albo zadzwoń.',
		delaySeconds: 7,
		scheduledAt: '',
	})

	const selectedRows = useMemo(
		() => rows.filter(item => selected.has(item.id) && item.phone),
		[rows, selected]
	)

	function toggle(id) {
		setSelected(current => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	function toggleAll() {
		setSelected(current => (current.size === rows.length ? new Set() : new Set(rows.map(item => item.id))))
	}

	async function createCampaign() {
		setCreating(true)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-campaigns', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...form,
					filters: { ...filters, source: 'segments' },
					recipients: selectedRows.map(row => ({
						customerId: row.id,
						name: row.name,
						phone: row.phone,
					})),
				}),
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie utworzono kampanii.')
			}
			router.push(`/admin/sms-campaigns/${json.data.id}`)
		} catch (createError) {
			setError(createError.message)
		} finally {
			setCreating(false)
		}
	}

	return (
		<>
			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>Audytoria</p>
						<h2 className='mt-1 text-lg font-bold text-[#132c43]'>
							Wybrani klienci do kampanii
						</h2>
						<p className='mt-1 text-sm text-[#5f7487]'>
							Zaznacz klientów w tabeli i utwórz kampanię SMS bez wychodzenia z
							segmentów.
						</p>
					</div>
					<div className='flex flex-wrap items-center gap-2'>
						<span className='text-sm font-bold text-[#132c43]'>
							Zaznaczono: {selectedRows.length}
						</span>
						<Button
							type='button'
							onClick={() => setCampaignOpen(true)}
							disabled={!selectedRows.length}
						>
							Utwórz kampanię SMS
						</Button>
					</div>
				</div>
			</div>

			<div className='opx-panel overflow-hidden rounded-md'>
				<div className='border-b border-[#d9e4ee] px-4 py-3'>
					<label className='flex items-center gap-3 text-sm font-bold text-[#132c43]'>
						<input
							type='checkbox'
							checked={rows.length > 0 && selected.size === rows.length}
							onChange={toggleAll}
							className='h-4 w-4 accent-[#fd6d02]'
						/>
						Klienci w segmencie
					</label>
				</div>
				<div className='hidden border-b border-[#d9e4ee] bg-[#f8fbfd] px-4 py-2 text-xs font-bold uppercase text-[#5f7487] md:grid md:grid-cols-[32px_1.2fr_150px_100px_120px_130px_1fr] md:gap-3'>
					<span />
					<span>Klient</span>
					<span>Źródło</span>
					<span>Zlecenia</span>
					<span>LTV</span>
					<span>Ostatnio</span>
					<span>Usługi</span>
				</div>
				<div className='divide-y divide-[#eef3f7]'>
					{rows.slice(0, 120).map(row => (
						<div
							key={row.id}
							className='grid gap-3 px-4 py-3 text-sm md:grid-cols-[32px_1.2fr_150px_100px_120px_130px_1fr]'
						>
							<input
								type='checkbox'
								checked={selected.has(row.id)}
								onChange={() => toggle(row.id)}
								className='mt-1 h-4 w-4 accent-[#fd6d02]'
							/>
							<a href={`/admin/customers/${row.id}`} className='no-underline'>
								<p className='font-bold text-[#132c43]'>{row.name}</p>
								<p className='text-[#5f7487]'>{row.phone}</p>
							</a>
							<p className='text-[#314a60]'>{row.source}</p>
							<p className='font-bold text-[#132c43]'>{row.totalOrders}</p>
							<p className='font-bold text-[#132c43]'>{formatMoney(row.totalSpent)}</p>
							<p className='text-[#314a60]'>{formatDate(row.latestActivity)}</p>
							<p className='line-clamp-2 text-[#5f7487]'>
								{row.services.length ? row.services.join(', ') : '-'}
							</p>
						</div>
					))}
					{!rows.length ? (
						<p className='px-4 py-6 text-sm text-[#5f7487]'>Brak klientów w segmencie.</p>
					) : null}
				</div>
			</div>

			{campaignOpen ? (
				<div className='fixed inset-0 z-50 flex items-end bg-black/55 p-0 sm:items-center sm:p-4'>
					<div className='mx-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-md bg-white p-4 shadow-2xl sm:rounded-md'>
						<div className='mb-4 flex items-start justify-between gap-3 border-b border-[#d9e4ee] pb-3'>
							<div>
								<h2 className='text-xl font-black text-[#132c43]'>Nowa kampania SMS</h2>
								<p className='text-sm text-[#5f7487]'>{selectedRows.length} odbiorców</p>
							</div>
							<Button type='button' variant='secondary' onClick={() => setCampaignOpen(false)}>
								Zamknij
							</Button>
						</div>
						<div className='space-y-4'>
							<label className='block space-y-2 text-sm font-bold text-[#132c43]'>
								<span>Nazwa kampanii</span>
								<input
									value={form.name}
									onChange={event =>
										setForm(current => ({ ...current, name: event.target.value }))
									}
									className='opx-input'
								/>
							</label>
							<label className='block space-y-2 text-sm font-bold text-[#132c43]'>
								<span>Treść SMS</span>
								<textarea
									value={form.message}
									onChange={event =>
										setForm(current => ({ ...current, message: event.target.value }))
									}
									rows={4}
									className='opx-input resize-none'
								/>
								<span className='block text-xs font-normal text-[#5f7487]'>
									Zmienne: {'{name}'}, {'{firstName}'}, {'{phone}'}
								</span>
							</label>
							<div className='grid gap-3 sm:grid-cols-2'>
								<label className='block space-y-2 text-sm font-bold text-[#132c43]'>
									<span>Opóźnienie między SMS</span>
									<input
										type='number'
										min='0'
										max='30'
										value={form.delaySeconds}
										onChange={event =>
											setForm(current => ({
												...current,
												delaySeconds: Number(event.target.value),
											}))
										}
										className='opx-input'
									/>
								</label>
								<label className='block space-y-2 text-sm font-bold text-[#132c43]'>
									<span>Start kampanii</span>
									<input
										type='datetime-local'
										value={form.scheduledAt}
										onChange={event =>
											setForm(current => ({ ...current, scheduledAt: event.target.value }))
										}
										className='opx-input'
									/>
								</label>
							</div>
							{error ? <p className='text-sm font-bold text-red-600'>{error}</p> : null}
							<div className='flex flex-wrap gap-2'>
								<Button type='button' onClick={createCampaign} loading={creating}>
									Utwórz kampanię
								</Button>
								<Button type='button' variant='secondary' onClick={() => setCampaignOpen(false)}>
									Anuluj
								</Button>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</>
	)
}
