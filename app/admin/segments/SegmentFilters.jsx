'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

function filtersHref(filters) {
	const params = new URLSearchParams()
	Object.entries(filters).forEach(([key, value]) => {
		if (key === 'services') {
			value.forEach(service => params.append('service', service))
			return
		}
		if (value) params.set(key, value)
	})
	return `/admin/segments${params.size ? `?${params}` : ''}`
}

export default function SegmentFilters({ initialFilters, sources, services, years, seasonKeys }) {
	const router = useRouter()
	const timerRef = useRef(null)
	const [isPending, startTransition] = useTransition()
	const [filters, setFilters] = useState(initialFilters)

	function navigate(next, delay = 0) {
		window.clearTimeout(timerRef.current)
		timerRef.current = window.setTimeout(() => {
			startTransition(() => router.replace(filtersHref(next), { scroll: false }))
		}, delay)
	}

	function update(field, value, delay = 0) {
		setFilters(current => {
			const next = { ...current, [field]: value }
			navigate(next, delay)
			return next
		})
	}

	function toggleService(service) {
		setFilters(current => {
			const selected = new Set(current.services)
			if (selected.has(service)) selected.delete(service)
			else selected.add(service)
			const next = { ...current, services: Array.from(selected) }
			navigate(next)
			return next
		})
	}

	return (
		<div className='opx-panel relative grid gap-3 rounded-md p-4 md:grid-cols-2 xl:grid-cols-4'>
			{isPending ? <div className='absolute inset-0 z-10 grid place-items-center rounded-md bg-white/65 backdrop-blur-[1px]' role='status'><span className='rounded-full bg-[#132c43] px-3 py-1.5 text-xs font-bold text-white shadow-lg'>Aktualizowanie segmentu…</span></div> : null}
			<label className='space-y-1 text-sm font-bold text-[#132c43]'>
				<span>Szukaj</span>
				<input
					value={filters.q}
					onChange={event => update('q', event.target.value, 350)}
					className='opx-input'
				/>
			</label>
			<FilterSelect
				label='Źródło'
				value={filters.source}
				onChange={value => update('source', value)}
				options={sources.map(source => ({ value: source, label: source }))}
				emptyLabel='Wszystkie'
			/>
			<div className='space-y-1 text-sm font-bold text-[#132c43]'>
				<span>Usługi</span>
				<details className='group relative'>
					<summary className='opx-input flex cursor-pointer list-none items-center justify-between gap-3'>
						<span className='truncate font-normal'>
							{filters.services.length
								? `${filters.services.length} wybrane`
								: 'Wszystkie'}
						</span>
						<span aria-hidden='true' className='text-[#5f7487] transition group-open:rotate-180'>
							⌄
						</span>
					</summary>
					<div className='absolute z-20 mt-2 max-h-64 w-full min-w-64 overflow-y-auto rounded-md border border-[#d9e4ee] bg-white p-2 shadow-xl'>
						{services.map(service => (
							<label
								key={service}
								className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 font-normal hover:bg-[#f4f8fb]'
							>
								<input
									type='checkbox'
									checked={filters.services.includes(service)}
									onChange={() => toggleService(service)}
									className='h-4 w-4 accent-[#fd6d02]'
								/>
								<span>{service}</span>
							</label>
						))}
						{!services.length ? (
							<p className='px-2 py-2 font-normal text-[#5f7487]'>Brak usług w danych.</p>
						) : null}
					</div>
				</details>
			</div>
			<FilterSelect
				label='Powrót'
				value={filters.repeat}
				onChange={value => update('repeat', value)}
				emptyLabel='Wszyscy'
				options={[
					{ value: 'yes', label: 'Powracający' },
					{ value: 'no', label: 'Tylko pierwszy raz' },
				]}
			/>
			<FilterSelect
				label='Przechowanie'
				value={filters.storage}
				onChange={value => update('storage', value)}
				emptyLabel='Wszyscy'
				options={[
					{ value: 'yes', label: 'Ma przechowanie' },
					{ value: 'no', label: 'Bez przechowania' },
				]}
			/>
			<FilterInput
				label='Min. zleceń'
				type='number'
				min='0'
				value={filters.minOrders}
				onChange={value => update('minOrders', value, 350)}
			/>
			<FilterInput
				label='Min. LTV'
				type='number'
				min='0'
				value={filters.minSpent}
				onChange={value => update('minSpent', value, 350)}
			/>
			<FilterInput
				label='Od daty'
				type='date'
				value={filters.from}
				onChange={value => update('from', value)}
			/>
			<FilterInput
				label='Do daty'
				type='date'
				value={filters.to}
				onChange={value => update('to', value)}
			/>
			<FilterSelect
				label='Sezon wykonania'
				value={filters.seasonKey}
				onChange={value => update('seasonKey', value)}
				emptyLabel='Dowolny'
				options={seasonKeys.map(item => ({ value: item.value, label: item.label }))}
			/>
			<FilterSelect
				label='Rok sezonu'
				value={filters.year}
				onChange={value => update('year', value)}
				emptyLabel='Dowolny'
				options={years.map(year => ({ value: year, label: year }))}
			/>
			<div className='flex items-end gap-3'>
				<Link href='/admin/segments' className='opx-btn-secondary px-4 py-2 text-sm font-bold'>
					Wyczyść
				</Link>
			</div>
		</div>
	)
}

function FilterSelect({ label, value, onChange, options, emptyLabel }) {
	return (
		<label className='space-y-1 text-sm font-bold text-[#132c43]'>
			<span>{label}</span>
			<select value={value} onChange={event => onChange(event.target.value)} className='opx-input'>
				<option value=''>{emptyLabel}</option>
				{options.map(option => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	)
}

function FilterInput({ label, value, onChange, ...props }) {
	return (
		<label className='space-y-1 text-sm font-bold text-[#132c43]'>
			<span>{label}</span>
			<input
				{...props}
				value={value}
				onChange={event => onChange(event.target.value)}
				className='opx-input'
			/>
		</label>
	)
}
