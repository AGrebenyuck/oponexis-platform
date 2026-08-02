'use client'

import { useState } from 'react'
import Button from '../_components/ui/Button'

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

export default function SmsGateTechnicalPanel() {
	const [checking, setChecking] = useState(false)
	const [checkingWebhooks, setCheckingWebhooks] = useState(false)
	const [registeringWebhooks, setRegisteringWebhooks] = useState(false)
	const [exportingInbox, setExportingInbox] = useState(false)
	const [gateStatus, setGateStatus] = useState(null)
	const [webhookStatus, setWebhookStatus] = useState(null)
	const [error, setError] = useState('')

	async function checkGate() {
		setChecking(true)
		setError('')
		setGateStatus(null)
		try {
			const res = await fetch('/api/admin/sms-gate/test', { cache: 'no-store' })
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Błąd SMSGate')
			setGateStatus(json.data)
		} catch (checkError) {
			setError(checkError.message)
		} finally {
			setChecking(false)
		}
	}

	async function checkWebhooks() {
		setCheckingWebhooks(true)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-gate/webhooks', { cache: 'no-store' })
			const json = await res.json()
			if (!res.ok || !json.success) throw new Error(json.error || 'Nie pobrano webhooków')
			setWebhookStatus({
				type: 'info',
				message: `Webhooki: ${json.data.webhooks?.length || 0}. URL: ${json.data.targetUrl}`,
			})
		} catch (webhookError) {
			setError(webhookError.message)
		} finally {
			setCheckingWebhooks(false)
		}
	}

	async function registerWebhooks() {
		setRegisteringWebhooks(true)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-gate/webhooks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie zarejestrowano webhooków')
			}
			setWebhookStatus({
				type: 'success',
				message: `Webhooki gotowe. Dodano: ${json.data.registered.length}, pominięto istniejące: ${json.data.skipped.length}. URL: ${json.data.targetUrl}`,
			})
		} catch (webhookError) {
			setError(webhookError.message)
		} finally {
			setRegisteringWebhooks(false)
		}
	}

	async function exportInbox() {
		setExportingInbox(true)
		setError('')
		try {
			const res = await fetch('/api/admin/sms-gate/inbox-export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			})
			const json = await res.json()
			if (!res.ok || !json.success) {
				throw new Error(json.error || 'Nie uruchomiono eksportu inbox')
			}
			setWebhookStatus({
				type: 'success',
				message: `Eksport inbox uruchomiony (${formatDate(json.data.since)} - ${formatDate(json.data.until)}).`,
			})
		} catch (exportError) {
			setError(exportError.message)
		} finally {
			setExportingInbox(false)
		}
	}

	return (
		<div className='opx-panel rounded-md p-4'>
			<div className='flex flex-wrap items-start justify-between gap-3'>
				<div>
					<p className='text-xs font-bold uppercase text-[#5f7487]'>Techniczne</p>
					<h2 className='mt-1 text-lg font-bold text-[#132c43]'>SMSGate i webhooki</h2>
					<p className='mt-1 text-sm text-[#5f7487]'>
						Globalna diagnostyka wysyłki SMS. To miejsce dla konfiguracji, testów i
						odświeżania webhooków.
					</p>
				</div>
				<div className='flex flex-wrap gap-2'>
					<Button type='button' variant='secondary' onClick={checkGate} loading={checking}>
						Test SMSGate
					</Button>
					<Button
						type='button'
						variant='secondary'
						onClick={checkWebhooks}
						loading={checkingWebhooks}
					>
						Webhooki
					</Button>
					<Button
						type='button'
						variant='secondary'
						onClick={registerWebhooks}
						loading={registeringWebhooks}
					>
						Zarejestruj webhooki
					</Button>
					<Button
						type='button'
						variant='secondary'
						onClick={exportInbox}
						loading={exportingInbox}
					>
						Eksport inbox 24h
					</Button>
				</div>
			</div>
			{error ? <p className='mt-3 text-sm font-bold text-red-600'>{error}</p> : null}
			<div className='mt-4 grid gap-3 lg:grid-cols-2'>
				<div className='rounded-md border border-[#d9e4ee] bg-[#f8fbfd] p-3 text-sm text-[#314a60]'>
					<p className='font-bold text-[#132c43]'>Kiedy tego używać</p>
					<p className='mt-1'>
						Po zmianie telefonu, danych SMSGate albo adresu CRM uruchom test, potem
						zarejestruj webhooki i ewentualnie pobierz inbox z ostatnich 24 godzin.
					</p>
				</div>
				{gateStatus ? (
					<div className='rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>
						<p className='font-bold'>SMSGate połączony.</p>
						<p>Profil: {gateStatus.profile}</p>
						<p>Serwer: {gateStatus.baseUrl}</p>
						<p>
							Login/hasło: {gateStatus.usernameLength} / {gateStatus.passwordLength}
						</p>
						<p>
							Device ID: {gateStatus.deviceIdConfigured ? 'wpisany' : 'brak'} /{' '}
							{gateStatus.deviceIdUsed ? 'używany' : 'nieużywany'}
						</p>
						<p>SIM: {gateStatus.simNumber}</p>
					</div>
				) : null}
				{webhookStatus ? (
					<div
						className={`rounded-md border p-3 text-sm ${
							webhookStatus.type === 'success'
								? 'border-emerald-200 bg-emerald-50 text-emerald-800'
								: 'border-sky-200 bg-sky-50 text-sky-800'
						}`}
					>
						<p className='font-bold'>SMSGate webhook</p>
						<p>{webhookStatus.message}</p>
					</div>
				) : null}
			</div>
		</div>
	)
}
