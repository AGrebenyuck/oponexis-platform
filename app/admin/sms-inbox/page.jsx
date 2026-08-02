'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../_components/ui/Button'
import Spin from '../_components/ui/Spin'

const STATUS_LABELS = {
	PENDING: 'Oczekuje',
	QUEUED: 'W kolejce',
	SENT: 'Wysłano',
	DELIVERED: 'Dostarczono',
	FAILED: 'Błąd',
	CANCELLED: 'Anulowane',
	BOOKED: 'Umówiony',
	DECLINED: 'Odmowa',
	CALL_BACK: 'Oddzwonić',
	NO_ANSWER: 'Nie odebrał',
	INTERESTED: 'Zainteresowany',
	SMS_SENT: 'SMS wysłany',
}

const WORK_STATUSES = [
	{ value: 'INTERESTED', label: 'Zainteresowany' },
	{ value: 'CALL_BACK', label: 'Oddzwonić' },
	{ value: 'BOOKED', label: 'Umówiony' },
	{ value: 'NO_ANSWER', label: 'Nie odebrał' },
	{ value: 'DECLINED', label: 'Odmowa' },
]

function formatDate(value) {
	if (!value) return '-'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value))
}

function eventLabel(event) {
	if (event.direction === 'IN') return 'Klient'
	if (event.direction === 'OUT') return 'My'
	if (event.direction === 'CALL') return 'Telefon'
	return 'CRM'
}

export default function SmsInboxPage() {
	const [items, setItems] = useState([])
	const [stats, setStats] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [search, setSearch] = useState('')
	const [status, setStatus] = useState('')
	const [selectedIds, setSelectedIds] = useState([])
	const [message, setMessage] = useState('')
	const [sending, setSending] = useState(false)
	const [savingId, setSavingId] = useState('')
	const [activeItem, setActiveItem] = useState(null)
	const [actionMenu, setActionMenu] = useState(null)
	const [smsItem, setSmsItem] = useState(null)
	const [smsMessage, setSmsMessage] = useState('')
	const [sendingSingleSms, setSendingSingleSms] = useState(false)
	const messageRef = useRef(null)

	useEffect(() => {
		load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [status])

	useEffect(() => {
		if (!activeItem) return
		function onKeyDown(event) {
			if (event.key === 'Escape') setActiveItem(null)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [activeItem])

	useEffect(() => {
		if (!actionMenu) return
		function close() {
			setActionMenu(null)
		}
		window.addEventListener('scroll', close, true)
		window.addEventListener('resize', close)
		return () => {
			window.removeEventListener('scroll', close, true)
			window.removeEventListener('resize', close)
		}
	}, [actionMenu])

	const visibleItems = useMemo(() => {
		const needle = search.trim().toLowerCase()
		if (!needle) return items
		return items.filter(item =>
			[item.name, item.phone, item.campaignName, item.lastMessage]
				.filter(Boolean)
				.some(value => String(value).toLowerCase().includes(needle))
		)
	}, [items, search])

	const selectedItems = visibleItems.filter(item => selectedIds.includes(item.id))

	async function load() {
		setLoading(true)
		setError('')
		try {
			const url = new URL('/api/admin/sms-inbox', window.location.origin)
			if (status) url.searchParams.set('status', status)
			const res = await fetch(url, { cache: 'no-store' })
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Nie pobrano inbox.')
			setItems(json.data.items || [])
			setStats(json.data.stats || null)
			setSelectedIds([])
		} catch (loadError) {
			setError(loadError.message)
		} finally {
			setLoading(false)
		}
	}

	function toggleItem(id) {
		setSelectedIds(current =>
			current.includes(id) ? current.filter(item => item !== id) : [...current, id]
		)
	}

	function toggleAll() {
		const ids = visibleItems.map(item => item.id)
		setSelectedIds(current => (current.length === ids.length ? [] : ids))
	}

	async function updateStatus(item, nextStatus) {
		setSavingId(item.id)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-inbox', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipientId: item.id, status: nextStatus }),
			})
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Nie zapisano statusu.')
			await load()
		} catch (statusError) {
			setError(statusError.message)
		} finally {
			setSavingId('')
		}
	}

	async function sendFollowUp() {
		setSending(true)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-inbox', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipientIds: selectedIds, message }),
			})
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Nie wysłano SMS.')
			setMessage('')
			await load()
		} catch (sendError) {
			setError(sendError.message)
		} finally {
			setSending(false)
		}
	}

	function prepareSingleMessage(item) {
		setSelectedIds([item.id])
		setMessage('')
		setActionMenu(null)
		window.setTimeout(() => messageRef.current?.focus(), 50)
	}

	function openActionMenu(item, anchor) {
		const rect = anchor.getBoundingClientRect()
		const menuHeight = 330
		const top =
			rect.bottom + menuHeight > window.innerHeight - 12
				? Math.max(12, rect.top - menuHeight - 8)
				: rect.bottom + 8
		const left = Math.min(window.innerWidth - 236, Math.max(12, rect.right - 220))
		setActionMenu({ item, top, left })
	}

	async function sendSingleSms() {
		if (!smsItem || !smsMessage.trim()) return
		setSendingSingleSms(true)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-inbox', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipientIds: [smsItem.id], message: smsMessage }),
			})
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Nie wysłano SMS.')
			setSmsItem(null)
			setSmsMessage('')
			await load()
		} catch (sendError) {
			setError(sendError.message)
		} finally {
			setSendingSingleSms(false)
		}
	}

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>Inbox / do obsługi</h1>
					<p className='text-sm text-[#d7e4ef]'>
						Odpowiedzi klientów, follow-up SMS i statusy kontaktu.
					</p>
				</div>
				<Button type='button' variant='ghost' onClick={load} loading={loading}>
					Odśwież
				</Button>
			</div>

			<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
				<Stat label='Do obsługi' value={stats?.attention || 0} />
				<Stat label='Z odpowiedzią' value={stats?.inbox || 0} />
				<Stat label='Zainteresowani' value={stats?.interested || 0} />
				<Stat label='Oddzwonić' value={stats?.callback || 0} />
				<Stat label='Umówieni' value={stats?.booked || 0} />
			</div>

			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap gap-2'>
					<input
						value={search}
						onChange={event => setSearch(event.target.value)}
						className='opx-input min-w-64 flex-1'
						placeholder='Szukaj klienta, telefonu, kampanii...'
					/>
					<select
						value={status}
						onChange={event => setStatus(event.target.value)}
						className='opx-input w-56'
					>
						<option value=''>Wszystkie statusy</option>
						{WORK_STATUSES.map(item => (
							<option key={item.value} value={item.value}>
								{item.label}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>
							Follow-up do zaznaczonych
						</p>
						<p className='mt-1 text-sm text-[#5f7487]'>
							Zaznacz klientów i wyślij jedną wiadomość do wybranej grupy.
						</p>
					</div>
					<p className='text-sm font-bold text-[#132c43]'>
						Zaznaczono: {selectedItems.length}
					</p>
				</div>
				<textarea
					ref={messageRef}
					value={message}
					onChange={event => setMessage(event.target.value)}
					rows={3}
					className='opx-input mt-3'
					placeholder='Np. Super, mamy wolny termin jutro o 10:00. Pasuje?'
				/>
				<div className='mt-3 flex flex-wrap gap-2'>
					<Button
						type='button'
						onClick={sendFollowUp}
						loading={sending}
						disabled={!selectedItems.length || !message.trim()}
					>
						Wyślij SMS
					</Button>
					<Button type='button' variant='secondary' onClick={() => setMessage('')}>
						Wyczyść
					</Button>
				</div>
				{error ? <p className='mt-3 text-sm font-bold text-red-600'>{error}</p> : null}
			</div>

			<div className='opx-panel overflow-hidden rounded-md'>
				<div className='border-b border-[#d9e4ee] px-4 py-3'>
					<label className='flex items-center gap-3 text-sm font-bold text-[#132c43]'>
						<input
							type='checkbox'
							checked={visibleItems.length > 0 && selectedIds.length === visibleItems.length}
							onChange={toggleAll}
							className='h-4 w-4'
						/>
						Klienci do kontaktu
					</label>
				</div>
				<div className='hidden border-b border-[#d9e4ee] bg-[#f8fbfd] px-4 py-2 text-xs font-bold uppercase text-[#5f7487] lg:grid lg:grid-cols-[32px_1.2fr_1fr_1.5fr_150px_150px] lg:gap-3'>
					<span />
					<span>Klient</span>
					<span>Kampania</span>
					<span>Ostatnia wiadomość</span>
					<span>Status</span>
					<span>Akcje</span>
				</div>
				{loading ? (
					<div className='p-8 text-center'>
						<Spin tip='Ładowanie inbox...' />
					</div>
				) : (
					<div className='divide-y divide-[#eef3f7]'>
						{visibleItems.map(item => (
							<div
								key={item.id}
							className='grid gap-3 px-4 py-3 text-sm lg:grid-cols-[32px_1.2fr_1fr_1.5fr_150px_150px]'
							>
								<input
									type='checkbox'
									checked={selectedIds.includes(item.id)}
									onChange={() => toggleItem(item.id)}
									className='mt-1 h-4 w-4'
								/>
								<div>
									<p className='font-bold text-[#132c43]'>{item.name}</p>
									<a className='text-[#2c70b7]' href={`tel:${item.phone}`}>
										{item.phone}
									</a>
									{item.customerUrl ? (
										<Link
											href={item.customerUrl}
											className='ml-2 text-xs font-bold text-[#fd6d02]'
										>
											Profil
										</Link>
									) : null}
								</div>
								<Link
									href={`/admin/sms-campaigns/${item.campaignId}`}
									className='font-semibold text-[#314a60] hover:text-[#fd6d02]'
								>
									{item.campaignName}
								</Link>
								<div>
									<p className='line-clamp-2 text-[#314a60]'>
										{item.lastMessage || '-'}
									</p>
									<p className='mt-1 text-xs text-[#5f7487]'>{formatDate(item.lastAt)}</p>
								</div>
								<p className='font-bold text-[#132c43]'>
									{STATUS_LABELS[item.status] || item.status}
								</p>
								<div>
									<button
										type='button'
										onClick={event => openActionMenu(item, event.currentTarget)}
										className='w-full rounded-md border border-[#d9e4ee] bg-white px-3 py-2 text-left text-xs font-bold text-[#132c43] hover:border-[#fd6d02]'
									>
										Akcje ···
									</button>
								</div>
							</div>
						))}
						{!visibleItems.length ? (
							<p className='p-4 text-sm text-[#5f7487]'>Brak klientów do obsługi.</p>
						) : null}
					</div>
				)}
			</div>

			{actionMenu ? (
				<div className='fixed inset-0 z-40' onMouseDown={() => setActionMenu(null)}>
					<div
						className='fixed w-56 rounded-md border border-[#d9e4ee] bg-white p-2 shadow-2xl'
						style={{ top: actionMenu.top, left: actionMenu.left }}
						onMouseDown={event => event.stopPropagation()}
					>
						<button
							type='button'
							onClick={() => {
								setSmsItem(actionMenu.item)
								setSmsMessage('')
								setActionMenu(null)
							}}
							className='block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-[#132c43] hover:bg-[#f4f8fb]'
						>
							Napisz SMS
						</button>
						<a
							href={`tel:${actionMenu.item.phone}`}
							className='block rounded-md px-3 py-2 text-sm font-bold text-[#132c43] no-underline hover:bg-[#f4f8fb]'
							onClick={() => setActionMenu(null)}
						>
							Zadzwoń
						</a>
						<button
							type='button'
							onClick={() => {
								setActiveItem(actionMenu.item)
								setActionMenu(null)
							}}
							className='block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-[#132c43] hover:bg-[#f4f8fb]'
						>
							Historia
						</button>
						<div className='my-1 h-px bg-[#eef3f7]' />
						{WORK_STATUSES.map(statusItem => (
							<button
								key={statusItem.value}
								type='button'
								disabled={savingId === actionMenu.item.id}
								onClick={() => {
									updateStatus(actionMenu.item, statusItem.value)
									setActionMenu(null)
								}}
								className='block w-full rounded-md px-3 py-2 text-left text-sm text-[#314a60] hover:bg-[#f4f8fb] disabled:opacity-50'
							>
								{statusItem.label}
							</button>
						))}
						<div className='my-1 h-px bg-[#eef3f7]' />
						<button
							type='button'
							onClick={() => prepareSingleMessage(actionMenu.item)}
							className='block w-full rounded-md px-3 py-2 text-left text-xs font-bold text-[#5f7487] hover:bg-[#f4f8fb]'
						>
							Do pola follow-up
						</button>
					</div>
				</div>
			) : null}

			{activeItem ? (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
					onMouseDown={() => setActiveItem(null)}
				>
					<div
						className='max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-2xl'
						onMouseDown={event => event.stopPropagation()}
					>
						<div className='flex items-start justify-between gap-3 border-b border-[#d9e4ee] p-4'>
							<div>
								<p className='text-xs font-bold uppercase text-[#5f7487]'>
									Timeline kontaktu
								</p>
								<h3 className='text-xl font-semibold text-[#132c43]'>
									{activeItem.name}
								</h3>
								<p className='text-sm text-[#5f7487]'>{activeItem.phone}</p>
							</div>
							<Button type='button' variant='secondary' onClick={() => setActiveItem(null)}>
								Zamknij ×
							</Button>
						</div>
						<div className='max-h-[62vh] space-y-3 overflow-y-auto p-4'>
							{activeItem.events?.map(event => (
								<div
									key={event.id}
									className='rounded-md border border-[#d9e4ee] bg-[#f8fbfd] p-3'
								>
									<div className='flex flex-wrap items-center justify-between gap-2'>
										<span className='rounded-full bg-[#fff4ec] px-2 py-1 text-xs font-bold text-[#b94700]'>
											{eventLabel(event)}
										</span>
										<span className='text-xs text-[#5f7487]'>
											{formatDate(event.occurredAt)}
										</span>
									</div>
									<p className='mt-2 text-sm font-bold text-[#132c43]'>{event.type}</p>
									{event.message ? (
										<p className='mt-1 whitespace-pre-wrap text-sm text-[#314a60]'>
											{event.message}
										</p>
									) : null}
								</div>
							))}
						</div>
					</div>
				</div>
			) : null}

			{smsItem ? (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
					onMouseDown={() => setSmsItem(null)}
				>
					<div
						className='w-full max-w-xl rounded-md bg-white p-4 shadow-2xl'
						onMouseDown={event => event.stopPropagation()}
					>
						<div className='flex items-start justify-between gap-3'>
							<div>
								<p className='text-xs font-bold uppercase text-[#5f7487]'>SMS</p>
								<h3 className='text-xl font-semibold text-[#132c43]'>{smsItem.name}</h3>
								<p className='text-sm text-[#5f7487]'>{smsItem.phone}</p>
							</div>
							<Button type='button' variant='secondary' onClick={() => setSmsItem(null)}>
								Zamknij ×
							</Button>
						</div>
						<textarea
							value={smsMessage}
							onChange={event => setSmsMessage(event.target.value)}
							rows={5}
							className='opx-input mt-4'
							placeholder='Wpisz treść wiadomości...'
							autoFocus
						/>
						<div className='mt-4 flex flex-wrap justify-end gap-2'>
							<Button type='button' variant='secondary' onClick={() => setSmsItem(null)}>
								Anuluj
							</Button>
							<Button
								type='button'
								onClick={sendSingleSms}
								loading={sendingSingleSms}
								disabled={!smsMessage.trim()}
							>
								Wyślij SMS
							</Button>
						</div>
					</div>
				</div>
			) : null}
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
