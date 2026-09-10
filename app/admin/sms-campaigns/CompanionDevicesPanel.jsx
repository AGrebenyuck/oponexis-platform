'use client'

import { useState } from 'react'
import Button from '../_components/ui/Button'

function ageLabel(value) {
	const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
	if (seconds < 60) return `${seconds} s temu`
	if (seconds < 3600) return `${Math.round(seconds / 60)} min temu`
	return `${Math.round(seconds / 3600)} godz. temu`
}

export default function CompanionDevicesPanel({ initialDevices = [] }) {
	const [devices, setDevices] = useState(initialDevices)
	const [loading, setLoading] = useState(false)
	const [savingId, setSavingId] = useState('')
	const [error, setError] = useState('')

	async function load() {
		setError('')
		try {
			const response = await fetch('/api/admin/companion-devices', { cache: 'no-store' })
			const json = await response.json()
			if (!response.ok || !json.success) throw new Error(json.error || 'Nie pobrano urządzeń.')
			setDevices(json.data)
		} catch (loadError) {
			setError(loadError.message)
		} finally {
			setLoading(false)
		}
	}

	function change(id, field, value) {
		setDevices(current => current.map(device => device.id === id ? { ...device, [field]: value } : device))
	}

	async function save(device) {
		setSavingId(device.id)
		setError('')
		try {
			const response = await fetch('/api/admin/companion-devices', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(device),
			})
			const json = await response.json()
			if (!response.ok || !json.success) throw new Error(json.error || 'Nie zapisano urządzenia.')
			await load()
		} catch (saveError) {
			setError(saveError.message)
		} finally {
			setSavingId('')
		}
	}

	return (
		<div className='opx-panel rounded-md p-4'>
			<div className='flex flex-wrap items-start justify-between gap-3'>
				<div>
					<p className='text-xs font-bold uppercase text-[#2c70b7]'>Oponexis Companion</p>
					<h2 className='mt-1 text-lg font-bold text-[#132c43]'>Urządzenia SMS</h2>
					<p className='mt-1 text-sm text-[#5f7487]'>Tylko urządzenie główne odbiera nowe SMS z platformy i kampanii.</p>
				</div>
				<Button type='button' variant='secondary' onClick={load} loading={loading}>Odśwież</Button>
			</div>
			{error ? <p className='mt-3 text-sm font-bold text-red-600'>{error}</p> : null}
			<div className='mt-4 grid gap-3'>
				{devices.map(device => (
					<div key={device.id} className={`rounded-xl border p-4 ${device.smsPrimary ? 'border-emerald-300 bg-emerald-50' : 'border-[#d9e4ee] bg-[#f8fbfd]'}`}>
						<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-5'>
							<label className='text-xs font-bold text-[#42576a]'>Nazwa<input className='mt-1 w-full rounded-lg border border-[#cbd8e2] bg-white px-3 py-2 text-sm font-normal' value={device.label || ''} placeholder={`${device.manufacturer || ''} ${device.model || ''}`.trim()} onChange={event => change(device.id, 'label', event.target.value)} /></label>
							<label className='text-xs font-bold text-[#42576a]'>Numer telefonu SIM<input className='mt-1 w-full rounded-lg border border-[#cbd8e2] bg-white px-3 py-2 text-sm font-normal' value={device.phoneNumber || ''} placeholder='+48…' onChange={event => change(device.id, 'phoneNumber', event.target.value)} /></label>
							<label className='text-xs font-bold text-[#42576a]'>Przeznaczenie<select className='mt-1 w-full rounded-lg border border-[#cbd8e2] bg-white px-3 py-2 text-sm font-normal' value={device.deviceType} onChange={event => change(device.id, 'deviceType', event.target.value)}><option value='TEST'>Testowe</option><option value='WORK'>Robocze</option></select></label>
							<label className='text-xs font-bold text-[#42576a]'>SIM<select className='mt-1 w-full rounded-lg border border-[#cbd8e2] bg-white px-3 py-2 text-sm font-normal' value={device.simSlot} onChange={event => change(device.id, 'simSlot', Number(event.target.value))}><option value={1}>SIM 1</option><option value={2}>SIM 2</option></select></label>
							<div className='flex flex-wrap items-end gap-3'><label className='flex items-center gap-2 text-sm font-bold text-[#132c43]'><input type='checkbox' checked={device.enabled} onChange={event => change(device.id, 'enabled', event.target.checked)} />Aktywne</label><label className='flex items-center gap-2 text-sm font-bold text-[#132c43]'><input type='checkbox' checked={device.smsPrimary} onChange={event => change(device.id, 'smsPrimary', event.target.checked)} />Główne</label><Button type='button' onClick={() => save(device)} loading={savingId === device.id}>Zapisz</Button></div>
						</div>
						<p className='mt-3 text-xs text-[#6b7f90]'>{device.manufacturer} {device.model} · aplikacja {device.appVersion || '-'} · ostatnio {ageLabel(device.lastSeenAt)} · ID {device.installationId}</p>
					</div>
				))}
				{!loading && !devices.length ? <p className='text-sm text-[#5f7487]'>Brak zarejestrowanych urządzeń.</p> : null}
			</div>
		</div>
	)
}
