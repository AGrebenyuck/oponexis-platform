'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function WorkOrderEditInner() {
	const searchParams = useSearchParams()
	const router = useRouter()
	const id = searchParams.get('id')

	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [closing, setClosing] = useState(false)
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')
	const [form, setForm] = useState({
		name: '',
		phone: '',
		service: '',
		regNumber: '',
		color: '',
		carModel: '',
		address: '',
		notes: '',
		visitDate: '',
		visitTime: '',
		wheelRimSize: '',
		tireSize: '',
		wantsInvoice: false,
		invoiceNip: '',
		invoiceEmail: '',
	})

	useEffect(() => {
		if (!id) {
			return
		}

		async function loadOrder() {
			const controller = new AbortController()
			const timeout = setTimeout(() => controller.abort(), 8000)

			try {
				setLoading(true)
				const res = await fetch(`/api/work-orders/${id}`, {
					cache: 'no-store',
					signal: controller.signal,
				})
				const contentType = res.headers.get('content-type') || ''
				if (!contentType.includes('application/json')) {
					throw new Error(`API zwrocilo nieprawidlowa odpowiedz (${res.status}).`)
				}

				const json = await res.json()

				if (!res.ok || !json.ok) {
					throw new Error(json.error || 'Nie udalo sie pobrac zlecenia.')
				}

				const order = json.order
				setForm({
					name: order.name || '',
					phone: order.phone || '',
					service: order.service || '',
					regNumber: order.regNumber || '',
					color: order.color || '',
					carModel: order.carModel || '',
					address: order.address || '',
					notes: order.notes || '',
					visitDate: order.visitDate
						? new Date(order.visitDate).toISOString().slice(0, 10)
						: '',
					visitTime: order.visitTime || '',
					wheelRimSize: order.wheelRimSize || '',
					tireSize: order.tireSize || '',
					wantsInvoice: !!order.wantsInvoice,
					invoiceNip: order.invoiceNip || '',
					invoiceEmail: order.invoiceEmail || '',
				})
				setError('')
			} catch (loadError) {
				console.error(loadError)
				setError(
					loadError?.name === 'AbortError'
						? 'Przekroczono czas ladowania zlecenia. Sprawdz API CRM.'
						: loadError.message || 'Blad podczas ladowania zlecenia.'
				)
			} finally {
				clearTimeout(timeout)
				setLoading(false)
			}
		}

		loadOrder()
	}, [id])

	function handleChange(event) {
		const { name, value, type, checked } = event.target
		setForm(prev => ({
			...prev,
			[name]: type === 'checkbox' ? checked : value,
		}))
		setError('')
		setSuccess('')
	}

	async function handleSubmit(event) {
		event.preventDefault()
		if (!id) return

		setSaving(true)
		setError('')
		setSuccess('')

		try {
			const res = await fetch(`/api/work-orders/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			})
			const json = await res.json()

			if (!res.ok || !json.ok) {
				throw new Error(json.error || 'Nie udalo sie zapisac zmian.')
			}

			setSuccess('Zapisano zmiany. Grafik zostal zaktualizowany.')
		} catch (saveError) {
			console.error(saveError)
			setError(saveError.message || 'Blad podczas zapisywania zmian.')
		} finally {
			setSaving(false)
		}
	}

	async function handleCloseOrder() {
		if (!id) return
		setClosing(true)
		setError('')
		setSuccess('')

		try {
			const res = await fetch(`/api/work-orders/${id}`, { method: 'DELETE' })
			const json = await res.json()
			if (!res.ok || !json.ok) {
				throw new Error(json.error || 'Nie udało się zamknąć zlecenia.')
			}
			setSuccess('Zlecenie zostało anulowane i ukryte z grafiku.')
			setTimeout(() => router.push('/admin/events'), 700)
		} catch (closeError) {
			console.error(closeError)
			setError(closeError.message || 'Błąd podczas zamykania zlecenia.')
		} finally {
			setClosing(false)
		}
	}

	if (!id) {
		return (
			<div className='opx-panel mx-auto max-w-xl rounded-md p-5 text-center'>
					<h1 className='text-xl font-bold text-[#132c43]'>Brak ID zlecenia</h1>
					<p className='mt-2 text-sm text-[#5f7487]'>
						Adres powinien zawierać parametr <code>?id=...</code>.
					</p>
			</div>
		)
	}

	if (loading) {
		return (
			<div className='opx-panel mx-auto max-w-xl rounded-md p-5 text-center'>
					<p className='text-sm font-semibold text-[#132c43]'>Ładowanie zlecenia…</p>
					<p className='mt-1 text-xs text-[#5f7487]'>ID: {id}</p>
			</div>
		)
	}

	if (error && !form.name && !form.phone) {
		return (
			<div className='opx-panel mx-auto max-w-xl rounded-md p-5 text-center'>
					<h1 className='text-xl font-bold text-[#132c43]'>
						Nie udało się załadować zlecenia
					</h1>
					<p className='mt-2 text-sm text-red-600'>{error}</p>
					<p className='mt-1 text-xs text-[#5f7487]'>ID: {id}</p>
					<button
						type='button'
						onClick={() => window.location.reload()}
						className='opx-btn-primary mt-4 px-4 py-2 text-sm font-bold'
					>
						Spróbuj ponownie
					</button>
			</div>
		)
	}

	return (
		<section className='mx-auto max-w-3xl space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>Edytuj zlecenie #{id}</h1>
					<p className='text-sm text-[#d7e4ef]'>Dane klienta, pojazdu i terminu wizyty.</p>
				</div>
					<button
						type='button'
						onClick={() => router.push('/admin/events')}
						className='rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15'
					>
						Wróć do zleceń
					</button>
			</div>

				<form onSubmit={handleSubmit} className='opx-panel space-y-4 rounded-md p-4 sm:p-5'>
					<Field label='Imię' name='name' value={form.name} onChange={handleChange} />
					<Field
						label='Telefon'
						name='phone'
						value={form.phone}
						onChange={handleChange}
					/>
					<Field
						label='Usługa'
						name='service'
						value={form.service}
						onChange={handleChange}
					/>

					<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
						<Field
							label='Data wizyty'
							name='visitDate'
							type='date'
							value={form.visitDate}
							onChange={handleChange}
						/>
						<Field
							label='Godzina wizyty'
							name='visitTime'
							type='time'
							value={form.visitTime}
							onChange={handleChange}
						/>
					</div>

					<Field
						label='Adres'
						name='address'
						value={form.address}
						onChange={handleChange}
					/>

					<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
						<Field
							label='Numer rejestracyjny'
							name='regNumber'
							value={form.regNumber}
							onChange={handleChange}
						/>
						<Field
							label='Kolor auta'
							name='color'
							value={form.color}
							onChange={handleChange}
						/>
					</div>

					<Field
						label='Model auta'
						name='carModel'
						value={form.carModel}
						onChange={handleChange}
					/>

					<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
						<Field
							label='Felga'
							name='wheelRimSize'
							value={form.wheelRimSize}
							onChange={handleChange}
						/>
						<Field
							label='Rozmiar opony'
							name='tireSize'
							value={form.tireSize}
							onChange={handleChange}
						/>
					</div>

					<label className='flex items-center gap-2 text-sm font-bold text-[#132c43]'>
						<input
							type='checkbox'
							name='wantsInvoice'
							checked={form.wantsInvoice}
							onChange={handleChange}
							className='h-4 w-4 accent-[#fd6d02]'
						/>
						Faktura
					</label>

					{form.wantsInvoice ? (
						<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
							<Field
								label='NIP'
								name='invoiceNip'
								value={form.invoiceNip}
								onChange={handleChange}
							/>
							<Field
								label='E-mail do faktury'
								name='invoiceEmail'
								value={form.invoiceEmail}
								onChange={handleChange}
							/>
						</div>
					) : null}

					<div className='space-y-1'>
						<label className='text-sm font-bold text-[#132c43]'>Uwagi</label>
						<textarea
							name='notes'
							value={form.notes}
							onChange={handleChange}
							rows={3}
							className='opx-input resize-none'
						/>
					</div>

					{error ? (
						<p className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700'>{error}</p>
					) : null}
					{success ? (
						<p className='rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700'>{success}</p>
					) : null}

					<div className='grid gap-2 sm:grid-cols-2'>
						<button type='submit' disabled={saving} className='opx-btn-primary px-4 py-2.5 text-sm font-bold disabled:opacity-60'>
							{saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
						</button>
						<button type='button' onClick={() => router.push(`/admin/work-order/complete?id=${id}`)} className='opx-btn-secondary px-4 py-2.5 text-sm font-bold'>
							Otwórz formularz wykonania
						</button>
					</div>
					<button type='button' onClick={handleCloseOrder} disabled={closing} className='w-full rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-60'>
						{closing ? 'Zamykanie…' : 'Anuluj / ukryj zlecenie'}
					</button>
				</form>
		</section>
	)
}

function Field({ label, name, value, onChange, type = 'text' }) {
	return (
		<div className='space-y-1'>
			<label className='text-sm font-bold text-[#132c43]'>{label}</label>
			<input
				type={type}
				name={name}
				value={value}
				onChange={onChange}
				className='opx-input'
			/>
		</div>
	)
}
