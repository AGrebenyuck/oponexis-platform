'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

function monthLabel(value) {
	const [year, month] = value.split('-').map(Number)
	return new Intl.DateTimeFormat('pl-PL', {
		month: 'long',
		year: 'numeric',
	}).format(new Date(Date.UTC(year, month - 1, 1)))
}

export default function FinancePeriodFilter({ months, selectedMonths, selectedYear }) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [open, setOpen] = useState(false)
	const buttonRef = useRef(null)
	const [panelPosition, setPanelPosition] = useState(null)
	const years = useMemo(() => Array.from(new Set(months.map(month => month.slice(0, 4)))).sort().reverse(), [months])
	const [year, setYear] = useState(selectedYear || '')
	const activeMonths = new Set(selectedMonths)

	function apply(nextMonths = selectedMonths, nextYear = year) {
		const params = new URLSearchParams()
		nextMonths.forEach(month => params.append('month', month))
		if (!nextMonths.length && nextYear) params.set('year', nextYear)
		startTransition(() => {
			router.push(`/admin/finance${params.size ? `?${params}` : ''}`)
			setOpen(false)
		})
	}

	function toggleMonth(month) {
		const next = new Set(activeMonths)
		if (next.has(month)) next.delete(month)
		else next.add(month)
		apply(Array.from(next).sort(), '')
	}

	const label = selectedMonths.length
		? selectedMonths.length === 1 ? monthLabel(selectedMonths[0]) : `${selectedMonths.length} mies.`
		: selectedYear ? `Rok ${selectedYear}` : 'Cały okres'

	function toggleMenu() {
		if (open) {
			setOpen(false)
			return
		}
		const rect = buttonRef.current?.getBoundingClientRect()
		if (rect) {
			const width = Math.min(288, window.innerWidth - 24)
			const height = Math.min(352, window.innerHeight - 24)
			const top = rect.bottom + 8 + height > window.innerHeight
				? Math.max(12, rect.top - height - 8)
				: rect.bottom + 8
			setPanelPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), top, width })
		}
		setOpen(true)
	}

	useEffect(() => {
		function closeOnViewportChange() { setOpen(false) }
		window.addEventListener('resize', closeOnViewportChange)
		return () => window.removeEventListener('resize', closeOnViewportChange)
	}, [])

	return (
		<div className='relative'>
			<button ref={buttonRef} type='button' onClick={toggleMenu} disabled={isPending} className='flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-1.5 pl-3 text-xs font-bold text-[#b9cad8] shadow-sm backdrop-blur disabled:opacity-60'>
				Okres <span className='min-w-32 rounded-lg border border-white/10 bg-[#0f2437] px-3 py-2 text-left text-sm font-bold text-white'>{isPending ? 'Ładowanie…' : label}</span><span aria-hidden='true'>⌄</span>
			</button>
			{open ? <div className='fixed z-40 max-h-[min(22rem,calc(100dvh-1.5rem))] overflow-y-auto rounded-xl border border-[#d7e1e8] bg-white p-3 text-[#132c43] shadow-2xl' style={panelPosition}>
				<div className='flex items-center justify-between gap-2'><p className='text-sm font-black'>Okres raportu</p><button type='button' onClick={() => apply([], '')} className='text-xs font-bold text-[#2c70b7]'>Cały okres</button></div>
				<label className='mt-3 grid gap-1 text-xs font-bold text-[#5f7487]'>Rok<select value={year} onChange={event => { setYear(event.target.value); apply([], event.target.value) }} className='rounded-lg border border-[#cbd9e3] bg-white px-2 py-2 text-sm text-[#132c43]'><option value=''>Wszystkie lata</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
				<div className='mt-3 max-h-52 space-y-1 overflow-y-auto border-t border-[#e6eef4] pt-2'>{months.map(month => <label key={month} className='flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[#f3f7fa]'><input type='checkbox' checked={activeMonths.has(month)} onChange={() => toggleMonth(month)} className='h-4 w-4 accent-[#fd6d02]' />{monthLabel(month)}</label>)}</div>
			</div> : null}
		</div>
	)
}
