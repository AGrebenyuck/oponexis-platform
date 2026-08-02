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
	const [customCategory, setCustomCategory] = useState(false)
	const availableCategories = {
		EXPENSE: Array.from(new Set([...categories.EXPENSE, ...savedExpenseCategories])).sort((a, b) => a.localeCompare(b, 'pl')),
		INCOME: Array.from(new Set([...categories.INCOME, ...savedIncomeCategories])).sort((a, b) => a.localeCompare(b, 'pl')),
	}

	async function submit(event) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const category = customCategory ? form.get('customCategory') : form.get('category')
		setMessage('')
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
		event.currentTarget.reset()
		setCustomCategory(false)
		setMessage('Zapisano.')
		startTransition(() => router.refresh())
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
					<button disabled={isPending} className='rounded-xl bg-[#132c43] px-4 py-3 text-sm font-black text-white disabled:opacity-60'>
						{isPending ? 'Odświeżanie…' : 'Zapisz transakcję'}
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
							<div key={transaction.id} className='grid gap-2 px-5 py-4 sm:grid-cols-[110px_1fr_auto] sm:items-center'>
								<div className='text-sm font-bold text-[#5f7487]'>{formatDate(transaction.occurredAt)}</div>
								<div>
									<div className='flex flex-wrap items-center gap-2'><span className='font-black text-[#132c43]'>{transaction.category}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${transaction.status === 'PLANNED' ? 'bg-amber-100 text-amber-800' : 'bg-[#e8f4ec] text-[#2f7a4d]'}`}>{transaction.status === 'PLANNED' ? 'PLAN' : 'OPŁACONE'}</span></div>
									{transaction.counterparty || transaction.description ? <p className='mt-1 text-sm text-[#5f7487]'>{[transaction.counterparty, transaction.description].filter(Boolean).join(' · ')}</p> : null}
								</div>
								<div className={`text-right text-base font-black ${transaction.type === 'EXPENSE' ? 'text-[#b9472b]' : 'text-[#2f7a4d]'}`}>{transaction.type === 'EXPENSE' ? '−' : '+'}{formatMoney(transaction.amount)}</div>
							</div>
						))}
					</div>
				) : <p className='px-5 py-10 text-sm text-[#5f7487]'>Brak ręcznych zapisów. Przychód z wykonanych zleceń liczymy automatycznie.</p>}
			</section>
		</div>
	)
}
