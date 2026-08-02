'use client'

import { useState } from 'react'

const roleLabels = {
	ADMIN: 'Administrator',
	SUPERADMIN: 'Superadministrator',
}

export default function PlatformSettingsClient({ initialSessionDays, credentials }) {
	const [sessionDays, setSessionDays] = useState(String(initialSessionDays))
	const [savingDays, setSavingDays] = useState(false)
	const [passwordState, setPasswordState] = useState({})
	const [message, setMessage] = useState(null)

	async function requestUpdate(payload) {
		const response = await fetch('/api/admin/platform-settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		})
		const data = await response.json()
		if (!response.ok || !data.ok) throw new Error(data.error || 'Nie udało się zapisać zmian.')
		return data
	}

	async function saveSessionDays(event) {
		event.preventDefault()
		setSavingDays(true)
		setMessage(null)
		try {
			await requestUpdate({ action: 'session-days', sessionDays: Number(sessionDays) })
			setMessage({ type: 'success', text: 'Zapisano czas zapamiętania urządzenia.' })
		} catch (error) {
			setMessage({ type: 'error', text: error.message })
		} finally {
			setSavingDays(false)
		}
	}

	async function savePassword(event, role) {
		event.preventDefault()
		const values = passwordState[role] || {}
		if (values.password !== values.confirmPassword) {
			setMessage({ type: 'error', text: 'Hasła nie są takie same.' })
			return
		}
		setPasswordState(current => ({ ...current, [role]: { ...values, saving: true } }))
		setMessage(null)
		try {
			await requestUpdate({ action: 'password', role, password: values.password })
			setPasswordState(current => ({ ...current, [role]: {} }))
			setMessage({ type: 'success', text: `Zmieniono hasło: ${roleLabels[role]}.` })
		} catch (error) {
			setMessage({ type: 'error', text: error.message })
			setPasswordState(current => ({
				...current,
				[role]: { ...current[role], saving: false },
			}))
		}
	}

	function updatePassword(role, field, value) {
		setPasswordState(current => ({
			...current,
			[role]: { ...current[role], [field]: value },
		}))
	}

	return (
		<div className='space-y-4'>
			{message ? (
				<p role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm font-semibold ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
					{message.text}
				</p>
			) : null}

			<form onSubmit={saveSessionDays} className='opx-panel rounded-md p-4 sm:p-5'>
				<div className='flex flex-wrap items-start justify-between gap-4'>
					<div>
						<p className='text-xs font-bold uppercase tracking-wide text-[#fd6d02]'>Sesja</p>
						<h2 className='mt-1 text-lg font-bold text-[#132c43]'>Zapamiętanie urządzenia</h2>
						<p className='mt-1 max-w-2xl text-sm text-[#5f7487]'>
							Ustawienie dotyczy nowych logowań. Zakres: od 1 do 90 dni.
						</p>
					</div>
					<div className='flex w-full items-end gap-2 sm:w-auto'>
						<label className='min-w-0 flex-1 space-y-1 text-sm font-bold text-[#132c43] sm:w-40'>
							<span>Liczba dni</span>
							<input type='number' min='1' max='90' required value={sessionDays} onChange={event => setSessionDays(event.target.value)} className='opx-input' />
						</label>
						<button type='submit' disabled={savingDays} className='opx-btn-primary px-4 py-2.5 text-sm disabled:opacity-60'>
							{savingDays ? 'Zapisywanie…' : 'Zapisz'}
						</button>
					</div>
				</div>
			</form>

			<div className='grid gap-4 xl:grid-cols-2'>
				{credentials.map(credential => {
					const values = passwordState[credential.role] || {}
					return (
						<form key={credential.role} onSubmit={event => savePassword(event, credential.role)} className='opx-panel rounded-md p-4 sm:p-5'>
							<p className='text-xs font-bold uppercase tracking-wide text-[#fd6d02]'>Dostęp</p>
							<h2 className='mt-1 text-lg font-bold text-[#132c43]'>{roleLabels[credential.role]}</h2>
							<p className='mt-1 text-xs text-[#5f7487]'>Ostatnia zmiana: {credential.updatedAtLabel}</p>
							<div className='mt-4 space-y-3'>
								<label className='block space-y-1 text-sm font-bold text-[#132c43]'>
									<span>Nowe hasło</span>
									<input type='password' minLength='10' maxLength='200' required autoComplete='new-password' value={values.password || ''} onChange={event => updatePassword(credential.role, 'password', event.target.value)} className='opx-input' />
								</label>
								<label className='block space-y-1 text-sm font-bold text-[#132c43]'>
									<span>Powtórz nowe hasło</span>
									<input type='password' minLength='10' maxLength='200' required autoComplete='new-password' value={values.confirmPassword || ''} onChange={event => updatePassword(credential.role, 'confirmPassword', event.target.value)} className='opx-input' />
								</label>
								<button type='submit' disabled={values.saving} className='opx-btn-primary w-full px-4 py-2.5 text-sm disabled:opacity-60'>
									{values.saving ? 'Zapisywanie…' : 'Zmień hasło'}
								</button>
							</div>
						</form>
					)
				})}
			</div>
		</div>
	)
}
