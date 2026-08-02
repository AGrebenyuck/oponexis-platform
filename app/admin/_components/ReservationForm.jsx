'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import Input from '@/components/ui/input'
import TextArea from '@/components/ui/textArea'
import messageToast from './message'
import Button from './ui/Button'
import Field from './ui/Field'
import Spin from './ui/Spin'

const OrderMapClient = dynamic(() => import('./ui/OrderMapClient'), {
	ssr: false,
})

const initialForm = {
	name: '',
	phone: '',
	selectedServiceIds: [],
	address: '',
	lat: null,
	lng: null,
	visitDate: '',
	visitTime: '',
	regNumber: '',
	color: '',
	carModel: '',
	wheelRimSize: '',
	tireSize: '',
	notes: '',
}

const rimSizeOptions = Array.from({ length: 10 }, (_, index) => `R${index + 13}`)
const adminInputClass =
	'!rounded-md !border-[#cbd8e4] !px-3 !py-2 text-[#132c43] focus-within:!border-[#2c70b7] focus-within:!ring-[#2c70b7]/20'
const adminTextAreaClass =
	'[&_textarea]:!rounded-md [&_textarea]:!border-[#cbd8e4] [&_textarea]:!px-3 [&_textarea]:!py-2 [&_textarea]:text-[#132c43] [&_textarea]:focus:!border-[#2c70b7] [&_textarea]:focus:!ring-[#2c70b7]/20'

export default function ReservationForm({ initialServices = [] }) {
	const [services] = useState(initialServices)
	const [saving, setSaving] = useState(false)
	const [message, setMessage] = useState('')
	const [form, setForm] = useState(initialForm)
	const [showMap, setShowMap] = useState(false)

	const serviceOptions = useMemo(() => {
		return services.flatMap(service => [
			{
				id: service.id,
				name: service.name,
				parentId: null,
			},
			...(service.additionalServices || []).map(additional => ({
				id: additional.id,
				name: `${service.name} + ${additional.name}`,
				parentId: service.id,
			})),
		])
	}, [services])

	const selectedServiceNames = useMemo(() => {
		const selected = new Set(form.selectedServiceIds)
		return serviceOptions
			.filter(option => selected.has(option.id))
			.map(option => option.name)
	}, [form.selectedServiceIds, serviceOptions])

	function update(field, value) {
		setForm(current => ({ ...current, [field]: value }))
	}

	function toggleService(option) {
		setForm(current => {
			const next = new Set(current.selectedServiceIds)
			if (next.has(option.id)) {
				next.delete(option.id)
			} else {
				next.add(option.id)
				if (option.parentId) next.add(option.parentId)
			}

			return {
				...current,
				selectedServiceIds: Array.from(next),
			}
		})
	}

	function handleAddressChange(value) {
		setForm(current => ({
			...current,
			address: value,
			lat: null,
			lng: null,
		}))
	}

	function handleMapSelect(location) {
		setForm(current => ({
			...current,
			address: location.address,
			lat: location.lat,
			lng: location.lng,
		}))
	}

	async function submit(event) {
		event.preventDefault()
		setSaving(true)
		setMessage('')

		const res = await fetch('/api/admin/reservations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...form,
				selectedServiceNames,
			}),
		})
		const json = await res.json()
		setSaving(false)

		if (json.success) {
			setMessage('Dodano zlecenie')
			messageToast.success('Dodano zlecenie')
			setForm(initialForm)
			setShowMap(false)
		} else {
			const error = json.error || 'Nie udało się dodać zlecenia'
			setMessage(error)
			messageToast.error(error, 5)
		}
	}

	return (
		<section className='max-w-5xl space-y-5'>
			<div>
				<h1 className='text-2xl font-semibold text-white'>Nowa rezerwacja</h1>
				<p className='text-sm text-[#d7e4ef]'>
					Ręczne dodanie pełnego zlecenia do CRM i harmonogramu.
				</p>
			</div>

			<Spin spinning={saving} tip='Dodawanie zlecenia...'>
			<form onSubmit={submit} className='opx-panel space-y-5 rounded-md p-4'>
				<div className='grid gap-4 md:grid-cols-2'>
					<Field label='Imię'>
						<Input
							required
							value={form.name}
							onChange={event => update('name', event.target.value)}
							className={adminInputClass}
						/>
					</Field>
					<Field label='Telefon'>
						<Input
							required
							value={form.phone}
							onChange={event => update('phone', event.target.value)}
							className={adminInputClass}
						/>
					</Field>
				</div>

				<div>
					<div className='mb-2 flex items-center justify-between gap-3'>
						<p className='text-sm font-bold'>Usługi</p>
						<p className='text-xs text-[#5f7487]'>
							{selectedServiceNames.length
								? `${selectedServiceNames.length} wybrane`
								: 'Wybierz jedną lub kilka'}
						</p>
					</div>
					<div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
						{serviceOptions.length ? (
							serviceOptions.map(option => {
								const active = form.selectedServiceIds.includes(option.id)
								return (
									<button
										key={option.id}
										type='button'
										onClick={() => toggleService(option)}
										className={`rounded-md border px-3 py-2 text-left text-sm transition ${
											active
												? 'border-[#fd6d02] bg-[#fff4ec] text-[#132c43]'
												: 'border-[#d9e4ee] bg-white hover:border-[#2c70b7]'
										}`}
									>
										<span className='block font-semibold'>{option.name}</span>
									</button>
								)
							})
						) : (
							<p className='rounded-md border border-[#d9e4ee] bg-[#f4f8fb] px-3 py-2 text-sm text-[#5f7487] sm:col-span-2 xl:col-span-3'>
								Brak usług w bazie.
							</p>
						)}
					</div>
				</div>

				<div className='grid gap-4 md:grid-cols-2'>
					<Field label='Model auta'>
						<Input
							value={form.carModel}
							onChange={event => update('carModel', event.target.value)}
							className={adminInputClass}
						/>
					</Field>
					<Field label='Numer rejestracyjny'>
						<Input
							value={form.regNumber}
							onChange={event => update('regNumber', event.target.value)}
							className={`${adminInputClass} uppercase`}
						/>
					</Field>
					<Field label='Kolor'>
						<Input
							value={form.color}
							onChange={event => update('color', event.target.value)}
							className={adminInputClass}
						/>
					</Field>
					<Field label='Rozmiar felgi'>
						<select
							value={form.wheelRimSize}
							onChange={event => update('wheelRimSize', event.target.value)}
							className='opx-input'
						>
							<option value=''>Wybierz rozmiar</option>
							{rimSizeOptions.map(size => (
								<option key={size} value={size}>
									{size}
								</option>
							))}
						</select>
					</Field>
					<Field label='Rozmiar opony'>
						<Input
							value={form.tireSize}
							onChange={event => update('tireSize', event.target.value)}
							placeholder='205/55 R16'
							className={adminInputClass}
						/>
					</Field>
				</div>

				<div className='space-y-3'>
					<Field label='Adres'>
						<div className='flex gap-2'>
							<Input
								value={form.address}
								onChange={event => handleAddressChange(event.target.value)}
								placeholder='Np. ul. Wiejska 12, Opole'
								className={adminInputClass}
							/>
							<Button
								type='button'
								onClick={() => setShowMap(current => !current)}
								variant='secondary'
								className='shrink-0'
							>
								Mapa
							</Button>
						</div>
					</Field>
					{showMap ? (
						<div className='overflow-hidden rounded-md border border-[#d9e4ee]'>
							<div className='h-72 w-full'>
							<OrderMapClient
								initialCoords={
									typeof form.lat === 'number' && typeof form.lng === 'number'
										? { lat: form.lat, lng: form.lng }
										: undefined
								}
								onSelect={handleMapSelect}
							/>
							</div>
							<p className='bg-[#f4f8fb] px-3 py-2 text-xs text-[#5f7487]'>
								Kliknij punkt na mapie, aby zapisać adres i współrzędne.
							</p>
						</div>
					) : null}
				</div>

				<div className='grid gap-4 md:grid-cols-2'>
					<Field label='Data'>
						<Input
							type='date'
							value={form.visitDate}
							onChange={event => update('visitDate', event.target.value)}
							className={adminInputClass}
						/>
					</Field>
					<Field label='Godzina'>
						<Input
							type='time'
							value={form.visitTime}
							onChange={event => update('visitTime', event.target.value)}
							className={adminInputClass}
						/>
					</Field>
				</div>

				<Field label='Notatka'>
					<TextArea
						value={form.notes}
						onChange={event => update('notes', event.target.value)}
						className={`${adminTextAreaClass} h-28`}
					/>
				</Field>

				<div className='flex flex-wrap items-center gap-3'>
					<Button
						type='submit'
						loading={saving}
					>
						Dodaj zlecenie
					</Button>
					{message ? <p className='text-sm text-[#314a60]'>{message}</p> : null}
				</div>
			</form>
			</Spin>
		</section>
	)
}
