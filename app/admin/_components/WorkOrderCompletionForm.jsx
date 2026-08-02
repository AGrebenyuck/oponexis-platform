'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import messageToast from './message'
import {
	CUSTOMER_SOURCE_OPTIONS,
	normalizeCustomerSource,
} from '@/lib/customer-sources'
import Button from './ui/Button'
import Spin from './ui/Spin'

const serviceOptions = [
	'Wymiana kół',
	'Wymiana opon',
	'Remont opony',
	'Przechowania kół',
	'Odpalenie auta',
	'Sprzedaż używanych opon',
	'Sprzedaż nowych opon',
	'Sprzedaż opony dojazdowej',
]

const sources = CUSTOMER_SOURCE_OPTIONS

const serviceAliases = {
	'Wymiana kół': ['wymiana kol', 'sezonowa wymiana kol', 'zmiana kol'],
	'Wymiana opon': [
		'wymiana opon',
		'wymien opon',
		'wymiana open',
		'wimen open',
		'przelozenie opon',
		'opony bez felg',
	],
	'Remont opony': ['remont opony', 'naprawa opony', 'pomoc z opona'],
	'Przechowania kół': ['przechowania kol', 'przechowywanie kol', 'magazynowanie kol'],
	'Odpalenie auta': ['odpalenie auta', 'uruchomienie auta'],
	'Sprzedaż używanych opon': ['sprzedaz uzywanych opon', 'uzywane opony'],
	'Sprzedaż nowych opon': ['sprzedaz nowych opon', 'nowe opony'],
	'Sprzedaż opony dojazdowej': ['opona dojazdowa', 'sprzedaz opony dojazdowej'],
}

const emptyForm = {
	name: '',
	gender: '',
	phone: '',
	source: '',
	car: '',
	serviceUsed: 'true',
	completedAt: '',
	serviceNames: [],
	amount: '',
	invoiceIssued: '',
	paymentMethod: '',
	notes: '',
}

function dateInput(value) {
	if (!value) return ''
	return new Date(value).toISOString().slice(0, 10)
}

function normalizeSearchText(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ł/g, 'l')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function inferServiceNames(value) {
	const text = normalizeSearchText(value)
	if (!text) return []

	return serviceOptions.filter(option => {
		const optionText = normalizeSearchText(option)
		const aliases = serviceAliases[option] || []
		return (
			text.includes(optionText) ||
			aliases.some(alias => text.includes(normalizeSearchText(alias)))
		)
	})
}

function normalizeSource(value) {
	return normalizeCustomerSource(value)
}

export default function WorkOrderCompletionForm() {
	const searchParams = useSearchParams()
	const id = searchParams.get('id')
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')
	const [order, setOrder] = useState(null)
	const [customer, setCustomer] = useState(null)
	const [form, setForm] = useState(emptyForm)

	const customerLine = useMemo(() => {
		if (!customer) return 'Nowy lub nierozpoznany klient'
		const visits = customer._count?.completions || 0
		const orders = customer._count?.workOrders || 0
		if (!visits && !orders) return 'Nowy klient'
		return `Historia klienta: ${visits} wykonane, ${orders} zlecenia`
	}, [customer])

	useEffect(() => {
		if (!id) {
			return
		}

		async function load() {
			try {
				setLoading(true)
				const res = await fetch(`/api/work-orders/${id}/completion`, {
					cache: 'no-store',
				})
				const json = await res.json()
				if (!res.ok || !json.ok) {
					throw new Error(json.error || 'Nie udało się pobrać zlecenia.')
				}

				const loadedOrder = json.order
				const completion = json.completion
				const baseServices = inferServiceNames(loadedOrder.service)
				const baseSource =
					normalizeSource(completion?.source) ||
					normalizeSource(loadedOrder.customer?.source) ||
					(loadedOrder.leadId ? 'Site' : '')

				setOrder(loadedOrder)
				setCustomer(loadedOrder.customer || null)
				setForm({
					name: completion?.name || loadedOrder.name || '',
					gender: completion?.gender || '',
					phone: completion?.phone || loadedOrder.phone || '',
					source: baseSource,
					car:
						completion?.car ||
						[loadedOrder.carModel, loadedOrder.regNumber]
							.filter(Boolean)
							.join(' / '),
					serviceUsed:
						completion?.serviceUsed == null
							? 'true'
							: completion.serviceUsed
							? 'true'
							: 'false',
					completedAt:
						dateInput(completion?.completedAt) ||
						dateInput(loadedOrder.visitDate) ||
						new Date().toISOString().slice(0, 10),
					serviceNames: completion?.serviceNames?.length
						? completion.serviceNames
						: baseServices,
					amount: completion?.amount ?? '',
					invoiceIssued:
						completion?.invoiceIssued == null
							? ''
							: completion.invoiceIssued
							? 'true'
							: 'false',
					paymentMethod: completion?.paymentMethod || '',
					notes: completion?.notes || '',
				})
				setError('')
				setSuccess('')
			} catch (loadError) {
				console.error(loadError)
				setError(loadError.message || 'Błąd ładowania formularza.')
			} finally {
				setLoading(false)
			}
		}

		load()
	}, [id])

	function update(field, value) {
		setForm(current => ({ ...current, [field]: value }))
		setError('')
		setSuccess('')
	}

	function toggleService(name) {
		setForm(current => {
			const selected = new Set(current.serviceNames)
			if (selected.has(name)) selected.delete(name)
			else selected.add(name)
			return { ...current, serviceNames: Array.from(selected) }
		})
		setError('')
		setSuccess('')
	}

	async function submit(event) {
		event.preventDefault()
		if (!id) return
		if (!form.source) {
			setError('Wybierz źródło klienta.')
			return
		}

		setSaving(true)
		setError('')
		setSuccess('')

		try {
			const res = await fetch(`/api/work-orders/${id}/completion`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			})
			const json = await res.json()
			if (!res.ok || !json.ok) {
				throw new Error(json.error || 'Nie udało się zapisać formularza.')
			}
			setSuccess('Zapisano wykonanie zlecenia.')
			messageToast.success('Zapisano wykonanie zlecenia')
		} catch (saveError) {
			console.error(saveError)
			const message = saveError.message || 'Błąd zapisu.'
			setError(message)
			messageToast.error(message, 5)
		} finally {
			setSaving(false)
		}
	}

	if (!id) {
		return (
			<div className='opx-panel mx-auto max-w-xl rounded-md p-5 text-center'>
				<h1 className='text-xl font-bold text-[#132c43]'>Brak ID zlecenia</h1>
				<p className='mt-2 text-sm text-[#5f7487]'>
					Link powinien zawierać parametr <code>?id=...</code>.
				</p>
			</div>
		)
	}

	if (loading) {
		return (
			<div className='py-10 text-center'>
				<Spin tip='Ładowanie formularza...' />
			</div>
		)
	}

	if (error && !order) {
		return (
			<div className='opx-panel mx-auto max-w-xl rounded-md p-5 text-center'>
				<h1 className='text-xl font-bold text-[#132c43]'>Nie udało się załadować</h1>
				<p className='mt-2 text-sm text-red-600'>{error}</p>
			</div>
		)
	}

	return (
		<section className='mx-auto max-w-3xl space-y-5'>
			<div>
				<h1 className='text-2xl font-semibold text-white'>
					Zakończenie zlecenia #{id}
				</h1>
				<p className='text-sm text-[#d7e4ef]'>{customerLine}</p>
			</div>

			<Spin spinning={saving} tip='Zapisywanie...'>
				<form onSubmit={submit} className='opx-panel space-y-4 rounded-md p-4'>
					<div className='grid gap-4 md:grid-cols-2'>
						<Field label='Imię'>
							<input
								value={form.name}
								onChange={event => update('name', event.target.value)}
								className='opx-input'
							/>
						</Field>
						<Field label='Telefon' required>
							<input
								required
								value={form.phone}
								onChange={event => update('phone', event.target.value)}
								className='opx-input'
							/>
						</Field>
					</div>

					<div className='grid gap-4 md:grid-cols-2'>
						<Field label='Płeć'>
							<select
								value={form.gender}
								onChange={event => update('gender', event.target.value)}
								className='opx-input'
							>
								<option value=''>Nie wybrano</option>
								<option value='Mężczyzna'>Mężczyzna</option>
								<option value='Kobieta'>Kobieta</option>
							</select>
						</Field>
						<Field label='Źródło' required>
							<select
								required
								value={form.source}
								onChange={event => update('source', event.target.value)}
								className='opx-input'
							>
								<option value=''>Nie wybrano</option>
								{sources.map(source => (
									<option key={source} value={source}>
										{source}
									</option>
								))}
							</select>
						</Field>
					</div>

					<Field label='Samochód'>
						<input
							value={form.car}
							onChange={event => update('car', event.target.value)}
							className='opx-input'
						/>
					</Field>

					<div className='grid gap-4 md:grid-cols-2'>
						<Field label='Skorzystał z usługi' required>
							<select
								required
								value={form.serviceUsed}
								onChange={event => update('serviceUsed', event.target.value)}
								className='opx-input'
							>
								<option value='true'>Tak</option>
								<option value='false'>Nie</option>
							</select>
						</Field>
						<Field label='Data'>
							<input
								type='date'
								value={form.completedAt}
								onChange={event => update('completedAt', event.target.value)}
								className='opx-input'
							/>
						</Field>
					</div>

					<Field label='Usługa' required>
						<div className='grid gap-2 sm:grid-cols-2'>
							{serviceOptions.map(service => (
								<label
									key={service}
									className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
										form.serviceNames.includes(service)
											? 'border-[#fd6d02] bg-[#fff4ec] text-[#132c43]'
											: 'border-[#d9e4ee] bg-white text-[#314a60]'
									}`}
								>
									<input
										type='checkbox'
										checked={form.serviceNames.includes(service)}
										onChange={() => toggleService(service)}
										className='h-4 w-4 accent-[#fd6d02]'
									/>
									<span>{service}</span>
								</label>
							))}
						</div>
					</Field>

					<Field label='Kwota do zapłaty'>
						<input
							type='number'
							min='0'
							step='0.01'
							value={form.amount}
							onChange={event => update('amount', event.target.value)}
							className='opx-input'
						/>
					</Field>

					<div className='grid gap-4 md:grid-cols-2'>
						<Field label='Czek albo faktura'>
							<select
								value={form.invoiceIssued}
								onChange={event => update('invoiceIssued', event.target.value)}
								className='opx-input'
							>
								<option value=''>Nie wybrano</option>
								<option value='true'>Tak</option>
								<option value='false'>Nie</option>
							</select>
						</Field>
						<Field label='Płatność'>
							<select
								value={form.paymentMethod}
								onChange={event => update('paymentMethod', event.target.value)}
								className='opx-input'
							>
								<option value=''>Nie wybrano</option>
								<option value='Karta'>Karta</option>
								<option value='Gotówka'>Gotówka</option>
							</select>
						</Field>
					</div>

					<Field label='Notatka'>
						<textarea
							value={form.notes}
							onChange={event => update('notes', event.target.value)}
							rows={3}
							className='opx-input resize-none'
						/>
					</Field>

					{error ? <p className='text-sm font-semibold text-red-600'>{error}</p> : null}
					{success ? (
						<p className='rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700'>
							{success}
						</p>
					) : null}

					<Button type='submit' loading={saving} disabled={saving}>
						{saving ? 'Zapisywanie...' : 'Zapisz wykonanie'}
					</Button>
				</form>
			</Spin>
		</section>
	)
}

function Field({ label, required = false, children }) {
	return (
		<label className='block space-y-2 text-sm font-bold text-[#132c43]'>
			<span>
				{label} {required ? <span className='text-red-600'>*</span> : null}
			</span>
			{children}
		</label>
	)
}
