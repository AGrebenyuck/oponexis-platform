'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

function monthLabel(value) {
	const [year, month] = value.split('-').map(Number)
	return new Intl.DateTimeFormat('pl-PL', {
		month: 'long',
		year: 'numeric',
	}).format(new Date(Date.UTC(year, month - 1, 1)))
}

export default function FinancePeriodFilter({ months, selectedMonth }) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()

	function changeMonth(event) {
		const value = event.target.value
		startTransition(() => {
			router.push(value === 'all' ? '/admin/finance' : `/admin/finance?month=${value}`)
		})
	}

	return (
		<label className='flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-1.5 pl-3 text-xs font-bold text-[#b9cad8] shadow-sm backdrop-blur'>
			Okres
			<span className='relative'>
				<select
					value={selectedMonth}
					onChange={changeMonth}
					disabled={isPending}
					className='min-w-44 appearance-none rounded-lg border border-white/10 bg-[#0f2437] py-2 pl-3 pr-9 text-sm font-bold text-white outline-none transition focus:border-[#2c70b7] focus:ring-2 focus:ring-[#2c70b7]/30 disabled:opacity-60'
				>
					<option value='all'>Cały okres</option>
					{months.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
				</select>
				<svg aria-hidden='true' viewBox='0 0 20 20' fill='none' className='pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#89a7bf]'>
					<path d='m6 8 4 4 4-4' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' />
				</svg>
			</span>
		</label>
	)
}
