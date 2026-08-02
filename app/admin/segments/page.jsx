import Link from 'next/link'
import {
	formatMoney,
	getCustomerAnalyticsRows,
	groupCounts,
	isActiveCustomerRow,
} from '@/lib/crmAnalytics'
import { seasonPeriodLabel } from '@/lib/season'
import SegmentsAudience from './SegmentsAudience'
import SegmentFilters from './SegmentFilters'

export const dynamic = 'force-dynamic'

function matches(row, filters) {
	if (filters.q) {
		const haystack = `${row.name} ${row.phone} ${row.source} ${row.services.join(' ')}`.toLowerCase()
		if (!haystack.includes(filters.q.toLowerCase())) return false
	}
	if (filters.source && row.source !== filters.source) return false
	if (
		filters.services.length &&
		!filters.services.some(service => row.services.includes(service))
	) return false
	if (filters.repeat === 'yes' && row.totalOrders < 2) return false
	if (filters.repeat === 'no' && row.totalOrders >= 2) return false
	if (filters.storage === 'yes' && !row.hasStorage) return false
	if (filters.storage === 'no' && row.hasStorage) return false
	if (filters.minOrders && row.totalOrders < Number(filters.minOrders)) return false
	if (filters.minSpent && row.totalSpent < Number(filters.minSpent)) return false
	if (filters.from || filters.to) {
		const dates = row.completionDates.length ? row.completionDates : [row.latestActivity].filter(Boolean)
		const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null
		const to = filters.to ? new Date(`${filters.to}T23:59:59`) : null
		const hasDateInRange = dates.some(date => {
			const parsed = new Date(date)
			if (from && parsed < from) return false
			if (to && parsed > to) return false
			return true
		})
		if (!hasDateInRange) return false
	}
	if (filters.seasonKey) {
		if (!row.seasons.includes(filters.seasonKey)) return false
	} else if (filters.season || filters.year) {
		const hasSeason = row.seasons.some(value => {
			const [season, year] = value.split(':')
			if (filters.season && season !== filters.season) return false
			if (filters.year && year !== filters.year) return false
			return true
		})
		if (!hasSeason) return false
	}
	return true
}

function presetHref(params) {
	const url = new URLSearchParams(params)
	return `/admin/segments?${url}`
}

export default async function SegmentsPage({ searchParams }) {
	const params = await searchParams
	const selectedServices = Array.isArray(params?.service)
		? params.service.map(String)
		: params?.service
		? [String(params.service)]
		: []
	const filters = {
		q: String(params?.q || '').trim(),
		source: String(params?.source || ''),
		services: selectedServices,
		repeat: String(params?.repeat || ''),
		storage: String(params?.storage || ''),
		minOrders: String(params?.minOrders || ''),
		minSpent: String(params?.minSpent || ''),
		from: String(params?.from || ''),
		to: String(params?.to || ''),
		seasonKey: String(params?.seasonKey || ''),
		season: String(params?.season || ''),
		year: String(params?.year || ''),
	}

	const rows = (await getCustomerAnalyticsRows()).filter(isActiveCustomerRow)
	const sources = groupCounts(rows.map(row => row.source), 100).map(item => item.label)
	const services = groupCounts(rows.flatMap(row => row.services), 100).map(item => item.label)
	const years = Array.from(
		new Set(rows.flatMap(row => row.seasons.map(value => value.split(':')[1])).filter(Boolean))
	).sort((a, b) => Number(b) - Number(a))
	const seasonKeys = Array.from(new Set(rows.flatMap(row => row.seasons)))
		.map(value => {
			const [season, year] = value.split(':')
			return { value, season, year: Number(year), label: seasonPeriodLabel(season, year) }
		})
		.sort((a, b) => {
			if (a.year !== b.year) return b.year - a.year
			return a.season.localeCompare(b.season)
		})
	const filtered = rows.filter(row => matches(row, filters))
	const totalSpent = filtered.reduce((sum, row) => sum + row.totalSpent, 0)
	const repeatCount = filtered.filter(row => row.totalOrders >= 2).length
	const storageCount = filtered.filter(row => row.hasStorage).length

	const presets = [
		{
			label: 'Powracający',
			href: presetHref({ repeat: 'yes', minOrders: '2' }),
			hint: 'Klienci z co najmniej dwoma wykonaniami.',
		},
		{
			label: 'Z przechowaniem',
			href: presetHref({ storage: 'yes' }),
			hint: 'Dobra baza pod przypomnienie sezonowe.',
		},
		{
			label: 'Wysoki LTV',
			href: presetHref({ minSpent: '300' }),
			hint: 'Klienci, których warto traktować priorytetowo.',
		},
		{
			label: 'Pierwszy raz',
			href: presetHref({ repeat: 'no' }),
			hint: 'Osoby po jednym zleceniu, dobre pod powrót.',
		},
	]

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>Segmenty</h1>
					<p className='text-sm text-[#d7e4ef]'>
						Podbieraj klientów do kampanii po zachowaniu, źródle, usługach i wartości.
					</p>
				</div>
			</div>

			<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
				{presets.map(item => (
					<Link
						key={item.label}
						href={item.href}
						className='opx-panel rounded-md p-4 no-underline transition hover:border-[#fd6d02]'
					>
						<p className='font-bold text-[#132c43]'>{item.label}</p>
						<p className='mt-1 text-sm text-[#5f7487]'>{item.hint}</p>
					</Link>
				))}
			</div>

			<SegmentFilters
				key={JSON.stringify(filters)}
				initialFilters={filters}
				sources={sources}
				services={services}
				years={years}
				seasonKeys={seasonKeys}
			/>

			<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
				{[
					['Klienci w segmencie', filtered.length],
					['Powracający', repeatCount],
					['Z przechowaniem', storageCount],
					['Wartość segmentu', formatMoney(totalSpent)],
				].map(([label, value]) => (
					<div key={label} className='opx-panel rounded-md p-4'>
						<p className='text-xs font-bold uppercase text-[#5f7487]'>{label}</p>
						<p className='mt-2 text-2xl font-semibold text-[#132c43]'>{value}</p>
					</div>
				))}
			</div>

			<SegmentsAudience rows={filtered} filters={filters} />
		</section>
	)
}
