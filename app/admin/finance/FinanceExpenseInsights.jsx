'use client'

import { useEffect, useRef, useState } from 'react'

const COLORS = ['#2c70b7', '#fd6d02', '#2f7a4d', '#7c5bbf', '#d44865', '#22a3a3', '#d69b24', '#64748b', '#8b5e3c']

function formatMoney(value) {
	return `${Number(value || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
}

function periodLabel(value) {
	if (value === 'all') return 'cały okres'
	const [year, month] = value.split('-').map(Number)
	return new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function chartBackground(categories, total) {
	let progress = 0
	const stops = categories.map((category, index) => {
		const start = progress
		progress += total ? (category.amount / total) * 100 : 0
		return `${COLORS[index % COLORS.length]} ${start}% ${progress}%`
	}).join(', ')
	return stops ? `conic-gradient(${stops})` : '#e6eef4'
}

export default function FinanceExpenseInsights({ categories, total, count, selectedMonth }) {
	const [open, setOpen] = useState(false)
	const closeButtonRef = useRef(null)
	const background = chartBackground(categories, total)
	useEffect(() => {
		if (open) closeButtonRef.current?.focus()
	}, [open])

	return (
		<>
			<button type='button' onClick={() => setOpen(true)} className='rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-bold text-white shadow-sm backdrop-blur transition hover:bg-white/15'>
				Podsumowanie wydatków
			</button>
			{open ? <div className='fixed inset-0 z-50 grid place-items-center bg-[#07131f]/75 p-4' onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
			<section role='dialog' aria-modal='true' aria-labelledby='expense-insights-title' onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }} className='w-full max-w-3xl overflow-hidden rounded-3xl border border-[#dbe6ee] bg-white text-[#132c43] shadow-2xl'>
				<div className='flex items-start justify-between gap-4 border-b border-[#e6eef4] px-5 py-5 sm:px-7'>
					<div>
						<p className='text-xs font-black uppercase tracking-wide text-[#2c70b7]'>Analiza kosztów · {periodLabel(selectedMonth)}</p>
						<h2 id='expense-insights-title' className='mt-1 text-2xl font-black'>Na co wydajemy pieniądze</h2>
					</div>
					<button ref={closeButtonRef} type='button' onClick={() => setOpen(false)} aria-label='Zamknij podsumowanie' className='grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf3f7] text-xl text-[#42576a] transition hover:bg-[#dfe9f0]'>×</button>
				</div>

				{count ? (
					<div className='max-h-[75vh] overflow-y-auto px-5 py-6 sm:px-7'>
						<div className='grid gap-3 sm:grid-cols-3'>
							<div className='rounded-2xl bg-[#f4f8fb] p-4'><p className='text-xs font-bold uppercase tracking-wide text-[#7892a8]'>Wydatki</p><p className='mt-1 text-xl font-black'>{formatMoney(total)}</p></div>
							<div className='rounded-2xl bg-[#f4f8fb] p-4'><p className='text-xs font-bold uppercase tracking-wide text-[#7892a8]'>Liczba zapisów</p><p className='mt-1 text-xl font-black'>{count}</p></div>
							<div className='rounded-2xl bg-[#f4f8fb] p-4'><p className='text-xs font-bold uppercase tracking-wide text-[#7892a8]'>Średni wydatek</p><p className='mt-1 text-xl font-black'>{formatMoney(total / count)}</p></div>
						</div>

						<div className='mt-7 grid items-center gap-7 md:grid-cols-[240px_1fr]'>
							<div className='relative mx-auto aspect-square w-full max-w-60 rounded-full' style={{ background }} role='img' aria-label={`Udział wydatków według kategorii. Łącznie ${formatMoney(total)}.`}>
								<div className='absolute inset-[25%] grid place-items-center rounded-full bg-white text-center shadow-inner'>
									<div><p className='text-xs font-bold text-[#7892a8]'>Razem</p><p className='mt-1 text-lg font-black'>{formatMoney(total)}</p></div>
								</div>
							</div>
							<div className='divide-y divide-[#e6eef4]'>
								{categories.map((category, index) => (
									<div key={category.category} className='grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3'>
										<span className='h-3 w-3 rounded-full' style={{ backgroundColor: COLORS[index % COLORS.length] }} />
										<div><p className='text-sm font-bold'>{category.category}</p><p className='text-xs text-[#7892a8]'>{category.count} {category.count === 1 ? 'zapis' : 'zapisów'} · {((category.amount / total) * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%</p></div>
										<p className='text-sm font-black'>{formatMoney(category.amount)}</p>
									</div>
								))}
							</div>
						</div>
					</div>
				) : <p className='px-7 py-12 text-center text-sm text-[#5f7487]'>Brak opłaconych wydatków w wybranym okresie.</p>}
			</section>
			</div> : null}
		</>
	)
}
