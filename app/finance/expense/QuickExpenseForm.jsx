'use client'

import { useEffect, useState } from 'react'

function today() {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function SelectChevron() {
	return <svg aria-hidden='true' viewBox='0 0 20 20' fill='none' className='pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7892a8]'><path d='m6 8 4 4 4-4' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' /></svg>
}

export default function QuickExpenseForm({ expenseCategories, incomeCategories }) {
	const [status, setStatus] = useState({ type: 'idle', message: '' })
	const [saving, setSaving] = useState(false)
	const [customCategory, setCustomCategory] = useState(false)
	const [type, setType] = useState('EXPENSE')
	const categories = type === 'EXPENSE' ? expenseCategories : incomeCategories

	useEffect(() => {
		if (!status.message) return undefined
		const timeout = window.setTimeout(() => setStatus({ type: 'idle', message: '' }), 5000)
		return () => window.clearTimeout(timeout)
	}, [status.message])

	async function submit(event) {
		event.preventDefault()
		const formElement = event.currentTarget
		setSaving(true)
		setStatus({ type: 'idle', message: '' })
		const form = new FormData(formElement)
		const category = customCategory ? form.get('customCategory') : form.get('category')
		const response = await fetch('/api/public/finance/expenses', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type,
				category,
				amount: form.get('amount'),
				occurredAt: form.get('occurredAt'),
				description: form.get('description'),
			}),
		})
		const json = await response.json().catch(() => null)
		setSaving(false)
		if (!response.ok || !json?.ok) {
			setStatus({ type: 'error', message: json?.error || 'Nie udało się zapisać transakcji.' })
			return
		}
		formElement.reset()
		setCustomCategory(false)
		setStatus({ type: 'success', message: 'Transakcja została zapisana.' })
	}

	return (
		<>
		<form onSubmit={submit} className='mt-6 grid gap-5'>
			<label className='grid gap-2 text-sm font-bold text-[#42576a]'>
				Typ
				<span className='relative'>
					<select value={type} onChange={event => { setType(event.target.value); setCustomCategory(false) }} className='w-full appearance-none rounded-xl border border-[#cbd9e3] bg-white px-4 py-3 pr-11 text-base text-[#132c43] outline-none transition focus:border-[#2c70b7] focus:ring-2 focus:ring-[#2c70b7]/20'>
						<option value='EXPENSE'>Wydatek</option>
						<option value='INCOME'>Przychód dodatkowy</option>
					</select>
					<SelectChevron />
				</span>
			</label>
			<label className='grid gap-2 text-sm font-bold text-[#42576a]'>
				Kategoria
				<span className='relative'>
					<select name='category' key={type} required onChange={event => setCustomCategory(event.target.value === '__custom__')} className='w-full appearance-none rounded-xl border border-[#cbd9e3] bg-white px-4 py-3 pr-11 text-base text-[#132c43] outline-none transition focus:border-[#2c70b7] focus:ring-2 focus:ring-[#2c70b7]/20'>
						{categories.map(category => <option key={category}>{category}</option>)}
						<option value='__custom__'>Dodaj własną kategorię…</option>
					</select>
					<SelectChevron />
				</span>
			</label>
			{customCategory ? (
				<label className='grid gap-2 text-sm font-bold text-[#42576a]'>
					Nazwa nowej kategorii
					<input name='customCategory' required minLength='2' maxLength='80' className='rounded-xl border border-[#cbd9e3] px-4 py-3 text-base text-[#132c43]' placeholder='Np. Magazyn' />
				</label>
			) : null}
			<label className='grid gap-2 text-sm font-bold text-[#42576a]'>
				Kwota (zł)
				<input name='amount' type='number' min='0.01' step='0.01' inputMode='decimal' required placeholder='0,00' className='rounded-xl border border-[#cbd9e3] px-4 py-3 text-base text-[#132c43]' />
			</label>
			<label className='grid gap-2 text-sm font-bold text-[#42576a]'>
				Data
				<input name='occurredAt' type='date' required defaultValue={today()} className='rounded-xl border border-[#cbd9e3] px-4 py-3 text-base text-[#132c43]' />
			</label>
			<label className='grid gap-2 text-sm font-bold text-[#42576a]'>
				Opis <span className='font-normal text-[#89a7bf]'>(opcjonalnie)</span>
				<textarea name='description' maxLength='500' rows='4' className='resize-y rounded-xl border border-[#cbd9e3] px-4 py-3 text-base text-[#132c43]' placeholder='Np. paliwo do busa' />
			</label>
			<button disabled={saving} className='rounded-xl bg-[#fd6d02] px-5 py-3.5 text-base font-black text-white shadow-lg shadow-[#fd6d02]/20 transition hover:bg-[#e96100] disabled:opacity-60'>
				{saving ? 'Zapisywanie…' : 'Zapisz transakcję'}
			</button>
		</form>
		{status.message ? (
			<div role={status.type === 'error' ? 'alert' : 'status'} aria-live='polite' className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl sm:right-6 sm:top-6 ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
				<span aria-hidden='true' className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs text-white ${status.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{status.type === 'success' ? '✓' : '!'}</span>
				<span>{status.message}</span>
				<button type='button' onClick={() => setStatus({ type: 'idle', message: '' })} aria-label='Zamknij powiadomienie' className='ml-auto text-lg leading-none opacity-60 transition hover:opacity-100'>×</button>
			</div>
		) : null}
		</>
	)
}
