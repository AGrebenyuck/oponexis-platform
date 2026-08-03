'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FINANCE_EXPENSE_CATEGORIES, FINANCE_INCOME_CATEGORIES } from '@/lib/finance'

const categories = {
	EXPENSE: FINANCE_EXPENSE_CATEGORIES,
	INCOME: FINANCE_INCOME_CATEGORIES,
}

function formatMoney(value) {
	return `${Number(value || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
}

function formatDate(value) {
	return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export default function FinanceClient({ transactions, savedExpenseCategories, savedIncomeCategories }) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [type, setType] = useState('EXPENSE')
	const [status, setStatus] = useState('PAID')
	const [message, setMessage] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [customCategory, setCustomCategory] = useState(false)
	const [editTransaction, setEditTransaction] = useState(null)
	const [editSaving, setEditSaving] = useState(false)
	const [editError, setEditError] = useState('')
	const availableCategories = {
		EXPENSE: Array.from(new Set([...categories.EXPENSE, ...savedExpenseCategories])).sort((a, b) => a.localeCompare(b, 'pl')),
		INCOME: Array.from(new Set([...categories.INCOME, ...savedIncomeCategories])).sort((a, b) => a.localeCompare(b, 'pl')),
	}

	async function submit(event) {
		event.preventDefault()
		if (submitting) return
		const formElement = event.currentTarget
		const form = new FormData(formElement)
		const category = customCategory ? form.get('customCategory') : form.get('category')
		setMessage('')
		setSubmitting(true)
		try {
		const response = await fetch('/api/admin/finance/transactions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type,
				status,
				category,
				amount: form.get('amount'),
				occurredAt: form.get('occurredAt'),
				description: form.get('description'),
			}),
		})
		const json = await response.json().catch(() => null)
		if (!response.ok || !json?.ok) {
			setMessage(json?.error || 'Nie udało się zapisać transakcji.')
			return
		}
		formElement.reset()
		setCustomCategory(false)
		setMessage('Zapisano.')
		startTransition(() => router.refresh())
		} finally {
			setSubmitting(false)
		}
	}

	function openEdit(transaction) {
		setEditError('')
		setEditTransaction({
			...transaction,
			amount: String(transaction.amount),
			occurredAt: new Date(transaction.occurredAt).toISOString().slice(0, 10),
			description: transaction.description || '',
		})
	}

	async function saveEdit(event) {
		event.preventDefault()
		if (!editTransaction || editSaving) return
		setEditSaving(true)
		setEditError('')
		try {
			const response = await fetch('/api/admin/finance/transactions', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editTransaction),
			})
			const json = await response.json().catch(() => null)
			if (!response.ok || !json?.ok) throw new Error(json?.error || 'Nie udało się zaktualizować transakcji.')
			setEditTransaction(null)
			setMessage('Zaktualizowano zapis.')
			startTransition(() => router.refresh())
		} catch (error) {
			setEditError(error.message)
		} finally {
			setEditSaving(false)
		}
	}

	function updateEdit(field, value) {
		setEditTransaction(current => ({ ...current, [field]: value }))
	}

	async function deleteTransaction(transaction) {
		if (!window.confirm(`Usunąć zapis „${transaction.category}” z ${formatDate(transaction.occurredAt)}?`)) return
		setEditSaving(true)
		setEditError('')
		try {
			const response = await fetch('/api/admin/finance/transactions', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: transaction.id }),
			})
			const json = await response.json().catch(() => null)
			if (!response.ok || !json?.ok) throw new Error(json?.error || 'Nie udało się usunąć transakcji.')
			setEditTransaction(null)
			setMessage('Usunięto zapis.')
			startTransition(() => router.refresh())
		} catch (error) {
			setEditError(error.message)
		} finally {
			setEditSaving(false)
		}
	}

	return (
		<div className='grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]'>
			<form onSubmit={submit} className='rounded-2xl border border-[#dbe6ee] bg-white p-5 shadow-sm'>
				<h2 className='text-lg font-black text-[#132c43]'>Dodaj zapis</h2>
				<p className='mt-1 text-sm text-[#5f7487]'>Wprowadzaj rzeczywiście poniesione koszty oraz zaplanowane zobowiązania.</p>
				<div className='mt-5 grid gap-4'>
					<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
						Typ
						<select value={type} onChange={event => { setType(event.target.value); setCustomCategory(false) }} className='rounded-xl border border-[#cbd9e3] bg-white px-3 py-2.5 text-[#132c43]'>
							<option value='EXPENSE'>Wydatek</option>
							<option value='INCOME'>Przychód dodatkowy</option>
						</select>
					</label>
					<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
						Status
						<select value={status} onChange={event => setStatus(event.target.value)} className='rounded-xl border border-[#cbd9e3] bg-white px-3 py-2.5 text-[#132c43]'>
							<option value='PAID'>Opłacone</option>
							<option value='PLANNED'>Planowane</option>
						</select>
					</label>
					<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
						Kategoria
						<select name='category' key={type} defaultValue={availableCategories[type][0]} onChange={event => setCustomCategory(event.target.value === '__custom__')} className='rounded-xl border border-[#cbd9e3] bg-white px-3 py-2.5 text-[#132c43]'>
							{availableCategories[type].map(category => <option key={category}>{category}</option>)}
							<option value='__custom__'>Dodaj własną kategorię…</option>
						</select>
					</label>
					{customCategory ? (
						<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
							Nazwa nowej kategorii
							<input name='customCategory' required minLength='2' maxLength='80' className='rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' />
						</label>
					) : null}
					<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
						Kwota (zł)
						<input name='amount' type='number' min='0.01' step='0.01' required inputMode='decimal' className='rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' placeholder='0,00' />
					</label>
					<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
						Data
						<input name='occurredAt' type='date' required defaultValue={new Date().toISOString().slice(0, 10)} className='rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' />
					</label>
					<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>
						Opis <span className='font-normal text-[#89a7bf]'>(opcjonalnie)</span>
						<textarea name='description' maxLength='500' rows='3' className='resize-y rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' />
					</label>
					<button disabled={isPending || submitting} className='rounded-xl bg-[#132c43] px-4 py-3 text-sm font-black text-white disabled:opacity-60'>
						{submitting ? 'Zapisywanie…' : isPending ? 'Odświeżanie…' : 'Zapisz transakcję'}
					</button>
					{message ? <p className='text-sm font-bold text-[#2f7a4d]'>{message}</p> : null}
				</div>
			</form>

			<section className='overflow-hidden rounded-2xl border border-[#dbe6ee] bg-white shadow-sm'>
				<div className='border-b border-[#e6eef4] px-5 py-4'>
					<h2 className='font-black text-[#132c43]'>Ostatnie zapisy</h2>
				</div>
				{transactions.length ? (
					<div className='divide-y divide-[#edf2f6]'>
						{transactions.map(transaction => (
							<div key={transaction.id} className='grid gap-2 px-5 py-4 sm:grid-cols-[110px_1fr_auto_auto] sm:items-center'>
								<div className='text-sm font-bold text-[#5f7487]'>{formatDate(transaction.occurredAt)}</div>
								<div>
									<div className='flex flex-wrap items-center gap-2'><span className='font-black text-[#132c43]'>{transaction.category}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${transaction.status === 'PLANNED' ? 'bg-amber-100 text-amber-800' : 'bg-[#e8f4ec] text-[#2f7a4d]'}`}>{transaction.status === 'PLANNED' ? 'PLAN' : 'OPŁACONE'}</span></div>
									{transaction.counterparty || transaction.description ? <p className='mt-1 text-sm text-[#5f7487]'>{[transaction.counterparty, transaction.description].filter(Boolean).join(' · ')}</p> : null}
								</div>
								<div className={`text-right text-base font-black ${transaction.type === 'EXPENSE' ? 'text-[#b9472b]' : 'text-[#2f7a4d]'}`}>{transaction.type === 'EXPENSE' ? '−' : '+'}{formatMoney(transaction.amount)}</div>
								<div className='flex justify-self-start gap-2 sm:justify-self-end'><button type='button' onClick={() => openEdit(transaction)} className='rounded-lg border border-[#cbd9e3] px-3 py-2 text-xs font-black text-[#2c70b7] transition hover:border-[#2c70b7] hover:bg-[#edf5fb]'>Edytuj</button><button type='button' onClick={() => deleteTransaction(transaction)} disabled={editSaving} className='rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50'>Usuń</button></div>
							</div>
						))}
					</div>
				) : <p className='px-5 py-10 text-sm text-[#5f7487]'>Brak ręcznych zapisów. Przychód z wykonanych zleceń liczymy automatycznie.</p>}
			</section>
			{editTransaction ? (
				<div className='fixed inset-0 z-50 grid place-items-center bg-[#07131f]/75 p-4' onMouseDown={event => { if (event.target === event.currentTarget && !editSaving) setEditTransaction(null) }}>
					<form onSubmit={saveEdit} className='max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#dbe6ee] bg-white p-5 shadow-2xl sm:p-6'>
						<div className='flex items-start justify-between gap-4'>
							<div><p className='text-xs font-black uppercase tracking-wide text-[#2c70b7]'>Finanse</p><h2 className='mt-1 text-xl font-black text-[#132c43]'>Edytuj zapis</h2></div>
							<button type='button' onClick={() => setEditTransaction(null)} disabled={editSaving} aria-label='Zamknij edycję' className='grid h-9 w-9 place-items-center rounded-full bg-[#edf3f7] text-xl text-[#42576a] disabled:opacity-50'>×</button>
						</div>
						<div className='mt-5 grid gap-4 sm:grid-cols-2'>
							<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>Typ<select value={editTransaction.type} onChange={event => updateEdit('type', event.target.value)} className='rounded-xl border border-[#cbd9e3] bg-white px-3 py-2.5 text-[#132c43]'><option value='EXPENSE'>Wydatek</option><option value='INCOME'>Przychód dodatkowy</option></select></label>
							<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>Status<select value={editTransaction.status} onChange={event => updateEdit('status', event.target.value)} className='rounded-xl border border-[#cbd9e3] bg-white px-3 py-2.5 text-[#132c43]'><option value='PAID'>Opłacone</option><option value='PLANNED'>Planowane</option></select></label>
							<label className='grid gap-1.5 text-sm font-bold text-[#42576a] sm:col-span-2'>Kategoria<input list={`finance-edit-categories-${editTransaction.type}`} required minLength='2' maxLength='80' value={editTransaction.category} onChange={event => updateEdit('category', event.target.value)} className='rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' /><datalist id={`finance-edit-categories-${editTransaction.type}`}>{availableCategories[editTransaction.type].map(category => <option key={category} value={category} />)}</datalist></label>
							<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>Kwota (zł)<input type='number' min='0.01' step='0.01' required inputMode='decimal' value={editTransaction.amount} onChange={event => updateEdit('amount', event.target.value)} className='rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' /></label>
							<label className='grid gap-1.5 text-sm font-bold text-[#42576a]'>Data<input type='date' required value={editTransaction.occurredAt} onChange={event => updateEdit('occurredAt', event.target.value)} className='rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' /></label>
							<label className='grid gap-1.5 text-sm font-bold text-[#42576a] sm:col-span-2'>Opis <span className='font-normal text-[#89a7bf]'>(opcjonalnie)</span><textarea maxLength='500' rows='3' value={editTransaction.description} onChange={event => updateEdit('description', event.target.value)} className='resize-y rounded-xl border border-[#cbd9e3] px-3 py-2.5 text-[#132c43]' /></label>
						</div>
						{editError ? <p role='alert' className='mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700'>{editError}</p> : null}
						<div className='mt-5 flex flex-wrap justify-between gap-2'><button type='button' onClick={() => deleteTransaction(editTransaction)} disabled={editSaving} className='rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50'>Usuń zapis</button><div className='flex gap-2'><button type='button' onClick={() => setEditTransaction(null)} disabled={editSaving} className='rounded-xl border border-[#cbd9e3] px-4 py-2.5 text-sm font-bold text-[#42576a] disabled:opacity-50'>Anuluj</button><button type='submit' disabled={editSaving} className='rounded-xl bg-[#132c43] px-4 py-2.5 text-sm font-black text-white disabled:opacity-60'>{editSaving ? 'Zapisywanie…' : 'Zapisz zmiany'}</button></div></div>
					</form>
				</div>
			) : null}
		</div>
	)
}
