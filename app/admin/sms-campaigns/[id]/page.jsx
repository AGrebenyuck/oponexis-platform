'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Button from '../../_components/ui/Button'
import Spin from '../../_components/ui/Spin'

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

function toDateTimeLocal(value) {
	if (!value) return ''
	const date = new Date(value)
	const offsetMs = date.getTimezoneOffset() * 60_000
	return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const STATUS_LABELS = {
	PENDING: 'Oczekuje',
	QUEUED: 'W kolejce',
	PROCESSED: 'Przetwarzane',
	SENT: 'Wysłano',
	DELIVERED: 'Dostarczono',
	FAILED: 'Błąd',
	CANCELLED: 'Anulowane',
	BOOKED: 'Umówiony',
	DECLINED: 'Odmowa',
	CALL_BACK: 'Oddzwonić',
	NO_ANSWER: 'Nie odebrał',
	INTERESTED: 'Zainteresowany',
}

const ACTION_STATUSES = [
	{ value: 'BOOKED', label: 'Umówiony' },
	{ value: 'INTERESTED', label: 'Zainteresowany' },
	{ value: 'CALL_BACK', label: 'Oddzwonić' },
	{ value: 'NO_ANSWER', label: 'Nie odebrał' },
	{ value: 'DECLINED', label: 'Odmowa' },
]

const TABS = [
	{ id: 'pipeline', label: 'Pipeline' },
	{ id: 'recipients', label: 'Odbiorcy' },
	{ id: 'responses', label: 'Odpowiedzi' },
	{ id: 'work', label: 'Do obsługi' },
	{ id: 'settings', label: 'Ustawienia' },
]

const PIPELINE_COLUMNS = [
	{
		id: 'pending',
		title: 'Do wysyłki',
		description: 'jeszcze nie ruszyliśmy',
		statuses: ['PENDING', 'FAILED'],
		targetStatus: 'PENDING',
		accent: 'border-slate-300',
	},
	{
		id: 'sent',
		title: 'Wysłano',
		description: 'czekamy na reakcję',
		statuses: ['QUEUED', 'PROCESSED', 'SENT', 'DELIVERED'],
		targetStatus: 'SENT',
		accent: 'border-sky-300',
	},
	{
		id: 'interested',
		title: 'Odpowiedzieli',
		description: 'trzeba domknąć termin',
		statuses: ['INTERESTED'],
		targetStatus: 'INTERESTED',
		accent: 'border-emerald-300',
	},
	{
		id: 'followup',
		title: 'Follow-up',
		description: 'oddzwonić albo spróbować później',
		statuses: ['CALL_BACK', 'NO_ANSWER'],
		targetStatus: 'CALL_BACK',
		accent: 'border-amber-300',
	},
	{
		id: 'booked',
		title: 'Umówieni',
		description: 'cel kampanii',
		statuses: ['BOOKED'],
		targetStatus: 'BOOKED',
		accent: 'border-[#fd6d02]',
	},
	{
		id: 'closed',
		title: 'Zamknięte',
		description: 'odmowa albo anulowane',
		statuses: ['DECLINED', 'CANCELLED'],
		targetStatus: 'DECLINED',
		accent: 'border-red-300',
	},
]

function isLiveStatus(status) {
	return ['RUNNING', 'SCHEDULED'].includes(status)
}

function latestEvent(recipient) {
	const events = recipient.contactEvents || []
	if (!events.length) return null
	return [...events].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))[0]
}

function PipelineCard({
	recipient,
	selected,
	saving,
	dragging,
	onDragStart,
	onDragEnd,
	onToggle,
	onOpenHistory,
	onOpenActions,
}) {
	const event = latestEvent(recipient)
	const historyCount = recipient.contactEvents?.length || 0

	return (
		<article
			draggable
			onDragStart={event => onDragStart(event, recipient.id)}
			onDragEnd={onDragEnd}
			className={`rounded-md border bg-white p-3 shadow-sm transition ${
				dragging ? 'scale-[0.99] border-[#fd6d02] opacity-60' : 'border-[#d9e4ee]'
			}`}
		>
			<div className='flex items-start justify-between gap-3'>
				<label className='flex min-w-0 items-start gap-2'>
					<input
						type='checkbox'
						checked={selected}
						onChange={() => onToggle(recipient.id)}
						className='mt-1 h-4 w-4 shrink-0'
					/>
					<span className='min-w-0'>
						<span className='block break-words font-bold leading-tight text-[#132c43]'>
							{recipient.name || 'Klient'}
						</span>
						<span className='block text-sm text-[#5f7487]'>{recipient.phone}</span>
					</span>
				</label>
				<span className='shrink-0 rounded-full bg-[#eef3f7] px-2 py-1 text-[11px] font-bold text-[#314a60]'>
					{STATUS_LABELS[recipient.status] || recipient.status}
				</span>
			</div>

			{recipient.note ? (
				<p className='mt-2 rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-800'>
					{recipient.note}
				</p>
			) : null}

			{event ? (
				<div className='mt-2 rounded-md bg-[#f8fbfd] p-2'>
					<div className='flex items-center justify-between gap-2'>
						<p className='text-[11px] font-bold uppercase text-[#5f7487]'>
							{event.direction === 'IN'
								? 'Odpowiedź'
								: event.direction === 'OUT'
								? 'Wysyłka'
								: 'Kontakt'}
						</p>
						<p className='text-[11px] text-[#7b8fa1]'>{formatDate(event.occurredAt)}</p>
					</div>
					<p className='mt-1 line-clamp-2 text-xs text-[#314a60]'>
						{event.message || event.type}
					</p>
				</div>
			) : (
				<p className='mt-2 text-xs text-[#7b8fa1]'>Brak historii kontaktu.</p>
			)}

			<div className='mt-3 grid grid-cols-2 gap-2'>
				<button
					type='button'
					onClick={() => onOpenHistory(recipient)}
					className='rounded-md border border-[#d9e4ee] px-2 py-2 text-xs font-bold text-[#132c43] transition hover:border-[#fd6d02] hover:text-[#fd6d02]'
				>
					Historia {historyCount ? `(${historyCount})` : ''}
				</button>
				<button
					type='button'
					disabled={saving}
					onClick={event => onOpenActions(recipient, event.currentTarget)}
					className='rounded-md border border-[#d9e4ee] bg-white px-2 py-2 text-xs font-bold text-[#132c43] transition hover:border-[#fd6d02] hover:text-[#fd6d02] disabled:opacity-50'
				>
					Akcje
				</button>
			</div>
			{recipient.error ? (
				<p className='mt-2 rounded-md bg-red-50 p-2 text-xs font-bold text-red-700'>
					{recipient.error}
				</p>
			) : null}
		</article>
	)
}

export default function SmsCampaignPage() {
	const routeParams = useParams()
	const router = useRouter()
	const id = routeParams.id
	const [campaign, setCampaign] = useState(null)
	const [loading, setLoading] = useState(true)
	const [starting, setStarting] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [savingSchedule, setSavingSchedule] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [error, setError] = useState('')
	const [scheduleValue, setScheduleValue] = useState('')
	const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
	const [savingRecipientId, setSavingRecipientId] = useState('')
	const [selectedRecipientIds, setSelectedRecipientIds] = useState([])
	const [bulkMessage, setBulkMessage] = useState('')
	const [bulkSending, setBulkSending] = useState(false)
	const [historyRecipient, setHistoryRecipient] = useState(null)
	const [activeTab, setActiveTab] = useState('pipeline')
	const [draggedRecipientId, setDraggedRecipientId] = useState('')
	const [actionMenu, setActionMenu] = useState(null)
	const [smsRecipient, setSmsRecipient] = useState(null)
	const [smsMessage, setSmsMessage] = useState('')
	const [sendingSingleSms, setSendingSingleSms] = useState(false)

	useEffect(() => {
		if (!id) return
		load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id])

	useEffect(() => {
		if (!id || !campaign || !isLiveStatus(campaign.status)) return
		const interval = window.setInterval(() => {
			syncStatuses({ silent: true })
		}, 7000)
		return () => window.clearInterval(interval)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, campaign?.status])

	useEffect(() => {
		if (!historyRecipient) return
		function onKeyDown(event) {
			if (event.key === 'Escape') setHistoryRecipient(null)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [historyRecipient])

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

	const stats = useMemo(() => {
		const recipients = campaign?.recipients || []
		const count = status => recipients.filter(item => item.status === status).length
		const sent = recipients.filter(item =>
			['QUEUED', 'PROCESSED', 'SENT', 'DELIVERED', 'BOOKED', 'INTERESTED', 'CALL_BACK'].includes(
				item.status
			)
		).length

		return {
			total: recipients.length,
			sent,
			delivered: count('DELIVERED'),
			failed: count('FAILED'),
			booked: count('BOOKED'),
			callback: count('CALL_BACK'),
			declined: count('DECLINED'),
			interested: count('INTERESTED'),
			noAnswer: count('NO_ANSWER'),
		}
	}, [campaign?.recipients])

	const pipelineColumns = useMemo(() => {
		const recipients = campaign?.recipients || []
		return PIPELINE_COLUMNS.map(column => ({
			...column,
			recipients: recipients.filter(recipient => column.statuses.includes(recipient.status)),
		}))
	}, [campaign?.recipients])

	const recentContactEvents = useMemo(() => {
		return (campaign?.recipients || [])
			.flatMap(recipient =>
				(recipient.contactEvents || []).map(event => ({
					...event,
					recipientName: recipient.name,
					recipientPhone: recipient.phone,
				}))
			)
			.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
			.slice(0, 6)
	}, [campaign?.recipients])

	const workItems = useMemo(() => {
		return (campaign?.recipients || []).filter(item =>
			['INTERESTED', 'CALL_BACK', 'NO_ANSWER'].includes(item.status)
		)
	}, [campaign?.recipients])

	async function load({ silent = false } = {}) {
		if (!silent) setLoading(true)
		const res = await fetch(`/api/admin/sms-campaigns/${id}`, { cache: 'no-store' })
		const json = await res.json()
		setCampaign(json.data || null)
		setScheduleValue(toDateTimeLocal(json.data?.scheduledAt))
		setLastUpdatedAt(new Date())
		if (!silent) setLoading(false)
	}

	async function start() {
		setStarting(true)
		setError('')
		try {
			const res = await fetch(`/api/admin/sms-campaigns/${id}/start`, {
				method: 'POST',
			})
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Błąd wysyłki')
			await syncStatuses({ silent: true })
		} catch (startError) {
			setError(startError.message)
		} finally {
			setStarting(false)
		}
	}

	async function syncStatuses({ silent = false } = {}) {
		if (!silent) setSyncing(true)
		setError('')
		try {
			const res = await fetch(`/api/admin/sms-campaigns/${id}/sync`, {
				method: 'POST',
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie odświeżono statusów')
			}
			await load({ silent: true })
		} catch (syncError) {
			if (!silent) setError(syncError.message)
		} finally {
			if (!silent) setSyncing(false)
		}
	}

	async function updateRecipientStatus(recipientId, status) {
		const previousCampaign = campaign
		setSavingRecipientId(recipientId)
		setError('')
		setCampaign(current =>
			current
				? {
						...current,
						recipients: current.recipients.map(recipient =>
							recipient.id === recipientId ? { ...recipient, status } : recipient
						),
					}
				: current
		)
		try {
			const res = await fetch(
				`/api/admin/sms-campaigns/${id}/recipients/${recipientId}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status }),
				}
			)
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie zapisano statusu')
			}
			await load({ silent: true })
		} catch (recipientError) {
			setCampaign(previousCampaign)
			setError(recipientError.message)
		} finally {
			setSavingRecipientId('')
		}
	}

	async function moveRecipientToColumn(recipientId, column) {
		if (!recipientId || !column?.targetStatus) return
		const recipient = campaign?.recipients?.find(item => item.id === recipientId)
		if (!recipient || recipient.status === column.targetStatus) return
		await updateRecipientStatus(recipientId, column.targetStatus)
	}

	function toggleRecipient(recipientId) {
		setSelectedRecipientIds(current =>
			current.includes(recipientId)
				? current.filter(id => id !== recipientId)
				: [...current, recipientId]
		)
	}

	function toggleAllRecipients() {
		const ids = (campaign?.recipients || []).map(item => item.id)
		setSelectedRecipientIds(current => (current.length === ids.length ? [] : ids))
	}

	async function sendBulkSms() {
		setBulkSending(true)
		setError('')
		try {
			const res = await fetch(`/api/admin/sms-campaigns/${id}/bulk-send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipientIds: selectedRecipientIds,
					message: bulkMessage,
				}),
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie wysłano SMS')
			}
			setBulkMessage('')
			setSelectedRecipientIds([])
			await load({ silent: true })
		} catch (bulkError) {
			setError(bulkError.message)
		} finally {
			setBulkSending(false)
		}
	}

	async function sendSingleSms() {
		if (!smsRecipient || !smsMessage.trim()) return
		setSendingSingleSms(true)
		setError('')
		try {
			const res = await fetch(`/api/admin/sms-campaigns/${id}/bulk-send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipientIds: [smsRecipient.id],
					message: smsMessage,
				}),
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie wysłano SMS')
			}
			setSmsRecipient(null)
			setSmsMessage('')
			await load({ silent: true })
		} catch (smsError) {
			setError(smsError.message)
		} finally {
			setSendingSingleSms(false)
		}
	}

	function openActionMenu(recipient, anchor) {
		const rect = anchor.getBoundingClientRect()
		const menuHeight = 300
		const top =
			rect.bottom + menuHeight > window.innerHeight - 12
				? Math.max(12, rect.top - menuHeight - 8)
				: rect.bottom + 8
		const left = Math.min(window.innerWidth - 236, Math.max(12, rect.right - 220))
		setActionMenu({ recipient, top, left })
	}

	async function saveSchedule(value = scheduleValue) {
		setSavingSchedule(true)
		setError('')
		try {
			const res = await fetch(`/api/admin/sms-campaigns/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scheduledAt: value || null }),
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie zapisano terminu')
			}
			await load()
		} catch (scheduleError) {
			setError(scheduleError.message)
		} finally {
			setSavingSchedule(false)
		}
	}

	async function deleteCampaign() {
		if (!window.confirm('Usunąć kampanię SMS?')) return
		setDeleting(true)
		setError('')
		try {
			const res = await fetch(`/api/admin/sms-campaigns/${id}`, {
				method: 'DELETE',
			})
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Nie usunięto kampanii')
			router.push('/admin/sms-campaigns')
		} catch (deleteError) {
			setError(deleteError.message)
		} finally {
			setDeleting(false)
		}
	}

	if (loading) {
		return (
			<div className='py-10 text-center'>
				<Spin tip='Ładowanie kampanii...' />
			</div>
		)
	}

	if (!campaign) {
		return <div className='opx-panel rounded-md p-4'>Nie znaleziono kampanii.</div>
	}

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>{campaign.name}</h1>
					<p className='text-sm text-[#d7e4ef]'>
						{campaign.status} · {campaign.recipients.length} odbiorców
					</p>
					{lastUpdatedAt ? (
						<p className='text-xs text-[#9fb3c4]'>
							Ostatnie odświeżenie: {formatDate(lastUpdatedAt)}
							{isLiveStatus(campaign.status) ? ' · auto-odświeżanie włączone' : ''}
						</p>
					) : null}
					{campaign.scheduledAt ? (
						<p className='text-sm font-bold text-[#fd6d02]'>
							Zaplanowano: {formatDate(campaign.scheduledAt)}
						</p>
					) : null}
				</div>
				<div className='flex flex-wrap gap-2'>
					<Button type='button' variant='ghost' onClick={syncStatuses} loading={syncing}>
						Odśwież statusy
					</Button>
					<Button type='button' variant='danger' onClick={deleteCampaign} loading={deleting}>
						Usuń
					</Button>
					<Button
						type='button'
						onClick={start}
						loading={starting}
						disabled={
							!campaign.recipients.some(item =>
								['PENDING', 'FAILED'].includes(item.status)
							)
						}
					>
						Start wysyłki
					</Button>
				</div>
			</div>

			<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-6'>
				{[
					['Odbiorcy', stats.total],
					['Wysłane/kolejka', stats.sent],
					['Dostarczone', stats.delivered],
					['Błędy', stats.failed],
					['Umówieni', stats.booked],
					['Oddzwonić', stats.callback],
				].map(([label, value]) => (
					<div key={label} className='opx-panel rounded-md p-4'>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>{label}</p>
						<p className='mt-1 text-2xl font-semibold text-[#132c43]'>{value}</p>
					</div>
				))}
			</div>

			<div className='opx-panel rounded-md p-2'>
				<div className='flex gap-2 overflow-x-auto'>
					{TABS.map(tab => (
						<button
							key={tab.id}
							type='button'
							onClick={() => setActiveTab(tab.id)}
							className={`shrink-0 rounded-md px-4 py-2 text-sm font-bold transition ${
								activeTab === tab.id
									? 'bg-[#fd6d02] text-white'
									: 'bg-[#eef3f7] text-[#314a60] hover:bg-[#d9e4ee]'
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
			</div>

			{error ? (
				<p className='rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700'>
					{error}
				</p>
			) : null}

			{activeTab === 'pipeline' ? (
				<div className='space-y-4'>
					<div className='opx-panel rounded-md p-4'>
						<div className='flex flex-wrap items-center justify-between gap-3'>
							<div>
								<p className='text-xs font-bold uppercase text-[#5f7487]'>
									Pipeline kampanii
								</p>
								<h2 className='mt-1 text-xl font-black text-[#132c43]'>
									Obsługa kontaktów po wysyłce
								</h2>
								<p className='mt-1 text-sm text-[#5f7487]'>
									Przeciągaj klientów między etapami albo zmieniaj status z menu na
									karcie. Każda zmiana zapisuje się w historii kontaktu.
								</p>
							</div>
							<div className='flex flex-wrap gap-2 text-xs font-bold'>
								<span className='rounded-full bg-emerald-100 px-3 py-2 text-emerald-800'>
									Odpowiedzi: {stats.interested}
								</span>
								<span className='rounded-full bg-amber-100 px-3 py-2 text-amber-800'>
									Follow-up: {stats.callback + stats.noAnswer}
								</span>
								<span className='rounded-full bg-[#fee7d8] px-3 py-2 text-[#9a3b00]'>
									Umówieni: {stats.booked}
								</span>
							</div>
						</div>
					</div>

					<div className='overflow-x-auto pb-2'>
						<div className='grid min-w-[1680px] grid-cols-[repeat(6,minmax(260px,1fr))] gap-3'>
							{pipelineColumns.map(column => (
								<section
									key={column.id}
									onDragOver={event => event.preventDefault()}
									onDrop={event => {
										event.preventDefault()
										const recipientId =
											event.dataTransfer.getData('text/plain') || draggedRecipientId
										setDraggedRecipientId('')
										moveRecipientToColumn(recipientId, column)
									}}
									className={`min-h-[460px] rounded-md border-t-4 ${column.accent} bg-[#eef3f7] p-3`}
								>
									<div className='mb-3 flex items-start justify-between gap-2'>
										<div>
											<h3 className='font-black text-[#132c43]'>{column.title}</h3>
											<p className='text-xs text-[#5f7487]'>{column.description}</p>
										</div>
										<span className='rounded-full bg-white px-2 py-1 text-xs font-black text-[#132c43]'>
											{column.recipients.length}
										</span>
									</div>
									<div className='space-y-3'>
										{column.recipients.map(recipient => (
											<PipelineCard
												key={recipient.id}
												recipient={recipient}
												selected={selectedRecipientIds.includes(recipient.id)}
												saving={savingRecipientId === recipient.id}
												dragging={draggedRecipientId === recipient.id}
												onDragStart={(event, recipientId) => {
													setDraggedRecipientId(recipientId)
													event.dataTransfer.effectAllowed = 'move'
													event.dataTransfer.setData('text/plain', recipientId)
												}}
												onDragEnd={() => setDraggedRecipientId('')}
												onToggle={toggleRecipient}
												onOpenHistory={setHistoryRecipient}
												onOpenActions={openActionMenu}
											/>
										))}
										{!column.recipients.length ? (
											<div className='rounded-md border border-dashed border-[#c9d8e4] bg-white/60 p-4 text-center text-xs font-bold text-[#7b8fa1]'>
												Przeciągnij tutaj kontakt.
											</div>
										) : null}
									</div>
								</section>
							))}
						</div>
					</div>
				</div>
			) : null}

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
								setSmsRecipient(actionMenu.recipient)
								setSmsMessage('')
								setActionMenu(null)
							}}
							className='block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-[#132c43] hover:bg-[#f4f8fb]'
						>
							Napisz SMS
						</button>
						<a
							href={`tel:${actionMenu.recipient.phone}`}
							className='block rounded-md px-3 py-2 text-sm font-bold text-[#132c43] no-underline hover:bg-[#f4f8fb]'
							onClick={() => setActionMenu(null)}
						>
							Zadzwoń
						</a>
						<button
							type='button'
							onClick={() => {
								setHistoryRecipient(actionMenu.recipient)
								setActionMenu(null)
							}}
							className='block w-full rounded-md px-3 py-2 text-left text-sm font-bold text-[#132c43] hover:bg-[#f4f8fb]'
						>
							Historia
						</button>
						<div className='my-1 h-px bg-[#eef3f7]' />
						{ACTION_STATUSES.map(item => (
							<button
								key={item.value}
								type='button'
								disabled={savingRecipientId === actionMenu.recipient.id}
								onClick={() => {
									updateRecipientStatus(actionMenu.recipient.id, item.value)
									setActionMenu(null)
								}}
								className='block w-full rounded-md px-3 py-2 text-left text-sm text-[#314a60] hover:bg-[#f4f8fb] disabled:opacity-50'
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
			) : null}

			{activeTab === 'settings' ? (
			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap items-start justify-between gap-4'>
					<div className='min-w-72 flex-1'>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>Treść SMS</p>
						<p className='mt-2 whitespace-pre-wrap text-[#132c43]'>{campaign.message}</p>
						<p className='mt-2 text-xs text-[#5f7487]'>
							Zmienne: {'{name}'}, {'{firstName}'}, {'{phone}'}
						</p>
					</div>
				</div>
			</div>
			) : null}

			{activeTab === 'settings' ? (
			<div className='opx-panel rounded-md p-4'>
				<p className='text-xs font-bold uppercase text-[#5f7487]'>Planowanie</p>
				<div className='mt-3 flex flex-wrap items-end gap-2'>
					<label className='min-w-64 flex-1 space-y-1 text-sm font-bold text-[#132c43]'>
						<span>Data i godzina startu</span>
						<input
							type='datetime-local'
							value={scheduleValue}
							onChange={event => setScheduleValue(event.target.value)}
							className='opx-input'
						/>
					</label>
					<Button type='button' onClick={() => saveSchedule()} loading={savingSchedule}>
						Zapisz termin
					</Button>
					<Button
						type='button'
						variant='secondary'
						onClick={() => {
							setScheduleValue('')
							saveSchedule('')
						}}
						loading={savingSchedule}
					>
						Start ręczny
					</Button>
				</div>
				<p className='mt-2 text-xs text-[#5f7487]'>
					Zaplanowane kampanie uruchamia endpoint /api/cron/sms-campaigns.
				</p>
			</div>
			) : null}

			{activeTab === 'recipients' ? (
			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>
							Wiadomość do zaznaczonych
						</p>
						<p className='mt-1 text-sm text-[#5f7487]'>
							Zaznacz klientów niżej i wyślij kolejną wiadomość w ramach tej kampanii.
						</p>
					</div>
					<p className='text-sm font-bold text-[#132c43]'>
						Zaznaczono: {selectedRecipientIds.length}
					</p>
				</div>
				<textarea
					value={bulkMessage}
					onChange={event => setBulkMessage(event.target.value)}
					rows={3}
					className='opx-input mt-3'
					placeholder='Np. Super, możemy zaproponować termin jutro o 10:00. Pasuje?'
				/>
				<div className='mt-3 flex flex-wrap gap-2'>
					<Button
						type='button'
						onClick={sendBulkSms}
						loading={bulkSending}
						disabled={!selectedRecipientIds.length || !bulkMessage.trim()}
					>
						Wyślij do zaznaczonych
					</Button>
					<Button type='button' variant='ghost' onClick={() => setBulkMessage('')}>
						Wyczyść
					</Button>
				</div>
			</div>
			) : null}

			{activeTab === 'responses' ? (
			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>
							Ostatnie zdarzenia
						</p>
						<p className='mt-1 text-sm text-[#5f7487]'>
							Tutaj powinny pojawić się odpowiedzi SMS, ręczne statusy i wysyłki.
						</p>
					</div>
					<Button type='button' variant='ghost' onClick={() => load({ silent: true })}>
						Odśwież historię
					</Button>
				</div>
				{recentContactEvents.length ? (
					<div className='mt-3 grid gap-2 md:grid-cols-2'>
						{recentContactEvents.map(event => (
							<button
								key={event.id}
								type='button'
								onClick={() => {
									const recipient = campaign.recipients.find(
										item => item.id === event.recipientId
									)
									if (recipient) setHistoryRecipient(recipient)
								}}
								className='rounded-md border border-[#d9e4ee] bg-[#f8fbfd] p-3 text-left transition hover:border-[#fd6d02]'
							>
								<div className='flex items-center justify-between gap-2'>
									<p className='font-bold text-[#132c43]'>
										{event.direction === 'IN'
											? 'Odpowiedź klienta'
											: event.direction === 'OUT'
											? 'Wiadomość wysłana'
											: 'Kontakt'}
									</p>
									<span className='text-xs text-[#5f7487]'>
										{formatDate(event.occurredAt)}
									</span>
								</div>
								<p className='mt-1 text-sm text-[#5f7487]'>
									{event.recipientName || '-'} · {event.recipientPhone}
								</p>
								<p className='mt-1 line-clamp-2 text-sm text-[#314a60]'>
									{event.message || event.type}
								</p>
							</button>
						))}
					</div>
				) : (
					<p className='mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'>
						Brak zapisanej historii w tej kampanii. Jeśli SMS przyszedł na telefon,
						naciśnij najpierw Zarejestruj webhooki, potem Eksport inbox 24h i sprawdź
						logi serwera pod kątem wpisu [smsgate webhook] received.
					</p>
				)}
			</div>
			) : null}

			{activeTab === 'work' ? (
			<div className='opx-panel rounded-md p-4'>
				<div className='flex flex-wrap items-start justify-between gap-3'>
					<div>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>Do obsługi</p>
						<h2 className='mt-1 text-lg font-bold text-[#132c43]'>
							Klienci wymagający reakcji
						</h2>
						<p className='mt-1 text-sm text-[#5f7487]'>
							Pełna kolejka odpowiedzi i follow-up jest w Inbox SMS.
						</p>
					</div>
					<a
						href='/admin/sms-inbox'
						className='rounded-md bg-[#fd6d02] px-4 py-2 text-sm font-bold text-white'
					>
						Otwórz Inbox SMS
					</a>
				</div>
				<div className='mt-4 grid gap-2'>
					{workItems.map(item => (
						<div
							key={item.id}
							className='flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d9e4ee] bg-[#f8fbfd] p-3 text-sm'
						>
							<div>
								<p className='font-bold text-[#132c43]'>{item.name || 'Klient'}</p>
								<p className='text-[#5f7487]'>{item.phone}</p>
								{item.note ? <p className='text-xs text-[#314a60]'>{item.note}</p> : null}
							</div>
							<div className='flex flex-wrap gap-2'>
								<a
									href={`tel:${item.phone}`}
									className='rounded-md border border-[#d9e4ee] bg-white px-3 py-2 text-xs font-bold text-[#132c43]'
								>
									Zadzwoń
								</a>
								<button
									type='button'
									onClick={() => setHistoryRecipient(item)}
									className='rounded-md border border-[#d9e4ee] bg-white px-3 py-2 text-xs font-bold text-[#132c43]'
								>
									Historia
								</button>
							</div>
						</div>
					))}
					{!workItems.length ? (
						<p className='rounded-md bg-[#f8fbfd] p-3 text-sm text-[#5f7487]'>
							Brak odbiorców wymagających reakcji w tej kampanii.
						</p>
					) : null}
				</div>
			</div>
			) : null}

			{activeTab === 'recipients' ? (
			<div className='opx-panel overflow-hidden rounded-md'>
				<div className='border-b border-[#d9e4ee] px-4 py-3'>
					<div className='flex items-center gap-3'>
						<input
							type='checkbox'
							checked={
								campaign.recipients.length > 0 &&
								selectedRecipientIds.length === campaign.recipients.length
							}
							onChange={toggleAllRecipients}
							className='h-4 w-4'
						/>
						<h2 className='font-bold text-[#132c43]'>Odbiorcy</h2>
					</div>
				</div>
				<div className='hidden border-b border-[#d9e4ee] bg-[#f8fbfd] px-4 py-2 text-xs font-bold uppercase text-[#5f7487] md:grid md:grid-cols-[28px_1fr_140px_140px_160px_220px] md:gap-3'>
					<span />
					<span>Klient</span>
					<span>Status</span>
					<span>Wysłano</span>
					<span>Historia</span>
					<span>Akcja</span>
				</div>
				<div className='divide-y divide-[#eef3f7]'>
					{campaign.recipients.map(recipient => (
						<div
							key={recipient.id}
							className='grid gap-3 px-4 py-3 text-sm md:grid-cols-[28px_1fr_140px_140px_160px_220px]'
						>
							<input
								type='checkbox'
								checked={selectedRecipientIds.includes(recipient.id)}
								onChange={() => toggleRecipient(recipient.id)}
								className='mt-1 h-4 w-4'
							/>
							<div>
								<p className='font-bold text-[#132c43]'>{recipient.name || '-'}</p>
								<p className='text-[#5f7487]'>{recipient.phone}</p>
								{recipient.note ? (
									<p className='mt-1 text-xs text-[#5f7487]'>{recipient.note}</p>
								) : null}
							</div>
							<p className='font-bold text-[#132c43]'>
								{STATUS_LABELS[recipient.status] || recipient.status}
							</p>
							<p className='text-[#5f7487]'>
								{recipient.status === 'QUEUED'
									? 'w kolejce'
									: formatDate(recipient.sentAt)}
							</p>
							<button
								type='button'
								onClick={() => setHistoryRecipient(recipient)}
								className='rounded-md border border-[#d9e4ee] bg-white px-3 py-2 text-sm font-bold text-[#132c43] transition hover:border-[#fd6d02] hover:text-[#fd6d02]'
							>
								Otwórz historię ({recipient.contactEvents?.length || 0})
							</button>
							<div>
								<button
									type='button'
									disabled={savingRecipientId === recipient.id}
									onClick={event => openActionMenu(recipient, event.currentTarget)}
									className='w-full rounded-md border border-[#d9e4ee] bg-white px-3 py-2 text-left text-xs font-bold text-[#132c43] transition hover:border-[#fd6d02] disabled:opacity-50'
								>
									Akcje ···
								</button>
								{recipient.error ? (
									<p className='mt-2 rounded-md bg-red-50 p-2 text-xs font-bold text-red-700'>
										{recipient.error}
									</p>
								) : null}
							</div>
						</div>
					))}
				</div>
			</div>
			) : null}

			{historyRecipient ? (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
					onMouseDown={() => setHistoryRecipient(null)}
				>
					<div
						className='max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-2xl'
						onMouseDown={event => event.stopPropagation()}
					>
						<div className='flex items-start justify-between gap-3 border-b border-[#d9e4ee] p-4'>
							<div>
								<p className='text-xs font-bold uppercase text-[#5f7487]'>
									Historia kontaktu
								</p>
								<h3 className='text-xl font-semibold text-[#132c43]'>
									{historyRecipient.name || 'Klient'}
								</h3>
								<p className='text-sm text-[#5f7487]'>{historyRecipient.phone}</p>
							</div>
							<Button
								type='button'
								variant='ghost'
								onClick={() => setHistoryRecipient(null)}
							>
								Zamknij ×
							</Button>
						</div>
						<div className='max-h-[65vh] space-y-3 overflow-y-auto p-4'>
							{historyRecipient.contactEvents?.length ? (
								[...historyRecipient.contactEvents]
									.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
									.map(event => (
										<div
											key={event.id}
											className='rounded-md border border-[#d9e4ee] bg-[#f8fbfd] p-3'
										>
											<div className='flex flex-wrap items-center justify-between gap-2'>
												<span
													className={`rounded-full px-2 py-1 text-xs font-bold ${
														event.direction === 'IN'
															? 'bg-emerald-100 text-emerald-800'
															: event.direction === 'OUT'
															? 'bg-sky-100 text-sky-800'
															: 'bg-amber-100 text-amber-800'
													}`}
												>
													{event.direction === 'IN'
														? 'Klient'
														: event.direction === 'OUT'
														? 'My'
														: 'Kontakt'}
												</span>
												<span className='text-xs text-[#5f7487]'>
													{formatDate(event.occurredAt)}
												</span>
											</div>
											<p className='mt-2 text-sm font-bold text-[#132c43]'>
												{event.type}
											</p>
											{event.message ? (
												<p className='mt-1 whitespace-pre-wrap text-sm text-[#314a60]'>
													{event.message}
												</p>
											) : null}
											{event.providerMessageId ? (
												<p className='mt-2 text-xs text-[#7b8fa1]'>
													SMSGate ID: {event.providerMessageId}
												</p>
											) : null}
										</div>
									))
							) : (
								<p className='rounded-md bg-[#eef3f7] p-3 text-sm text-[#5f7487]'>
									Brak zapisanej historii kontaktu dla tego odbiorcy.
								</p>
							)}
						</div>
					</div>
				</div>
			) : null}

			{smsRecipient ? (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
					onMouseDown={() => setSmsRecipient(null)}
				>
					<div
						className='w-full max-w-xl rounded-md bg-white p-4 shadow-2xl'
						onMouseDown={event => event.stopPropagation()}
					>
						<div className='flex items-start justify-between gap-3'>
							<div>
								<p className='text-xs font-bold uppercase text-[#5f7487]'>SMS</p>
								<h3 className='text-xl font-semibold text-[#132c43]'>
									{smsRecipient.name || 'Klient'}
								</h3>
								<p className='text-sm text-[#5f7487]'>{smsRecipient.phone}</p>
							</div>
							<Button type='button' variant='ghost' onClick={() => setSmsRecipient(null)}>
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
							<Button type='button' variant='secondary' onClick={() => setSmsRecipient(null)}>
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
