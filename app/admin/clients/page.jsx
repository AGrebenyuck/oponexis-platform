import Link from 'next/link'
import { formatMoney, getCustomerAnalyticsRows, isActiveCustomerRow } from '@/lib/crmAnalytics'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

function formatDate(value) {
	if (!value) return '-'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(new Date(value))
}

function pageHref({ q, page, showTest, sort }) {
	const params = new URLSearchParams()
	if (q) params.set('q', q)
	if (sort && sort !== 'latest') params.set('sort', sort)
	if (page > 1) params.set('page', String(page))
	if (showTest) params.set('test', '1')
	return `/admin/clients${params.toString() ? `?${params}` : ''}`
}

export default async function ClientsPage({ searchParams }) {
	const params = await searchParams
	const q = String(params?.q || '').trim()
	const sort = String(params?.sort || 'latest')
	const page = Math.max(1, Number(params?.page || 1))
	const showTest = params?.test === '1'
	const rows = await getCustomerAnalyticsRows({ includeTests: showTest })
	const filtered = rows
		.filter(isActiveCustomerRow)
		.filter(row => {
			if (!q) return true
			const haystack = `${row.name} ${row.phone} ${row.source} ${row.services.join(' ')}`.toLowerCase()
			return haystack.includes(q.toLowerCase())
		})
		.sort((a, b) => {
			if (sort === 'oldest') {
				return new Date(a.latestActivity || 0) - new Date(b.latestActivity || 0)
			}
			if (sort === 'name-asc') return a.name.localeCompare(b.name, 'pl')
			if (sort === 'name-desc') return b.name.localeCompare(a.name, 'pl')
			if (sort === 'orders') return b.totalOrders - a.totalOrders
			if (sort === 'ltv') return b.totalSpent - a.totalSpent
			return new Date(b.latestActivity || 0) - new Date(a.latestActivity || 0)
		})

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
	const safePage = Math.min(page, totalPages)
	const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

	return (
		<section className='space-y-5'>
			<div className='flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-2xl font-semibold text-white'>Klienci</h1>
					<p className='text-sm text-[#d7e4ef]'>
						Baza klientów z historią zleceń, LTV, źródłem i ostatnią aktywnością.
					</p>
				</div>
				<Link
					href='/admin/segments'
					className='rounded-md bg-[#fd6d02] px-4 py-2 text-sm font-bold text-white'
				>
					Segmenty
				</Link>
			</div>

			<form className='opx-panel grid gap-3 rounded-md p-4 md:grid-cols-[1fr_220px_auto_auto]'>
				<label className='space-y-1 text-sm font-bold text-[#132c43]'>
					<span>Szukaj</span>
					<input
						name='q'
						defaultValue={q}
						className='opx-input'
						placeholder='Imię, telefon, usługa, źródło...'
					/>
				</label>
				<label className='space-y-1 text-sm font-bold text-[#132c43]'>
					<span>Sortowanie</span>
					<select name='sort' defaultValue={sort} className='opx-input'>
						<option value='latest'>Ostatnia aktywność</option>
						<option value='oldest'>Najstarsza aktywność</option>
						<option value='name-asc'>Imię A–Z</option>
						<option value='name-desc'>Imię Z–A</option>
						<option value='orders'>Najwięcej zleceń</option>
						<option value='ltv'>Najwyższe LTV</option>
					</select>
				</label>
				<label className='flex items-end gap-2 pb-2 text-sm font-bold text-[#132c43]'>
					<input type='checkbox' name='test' value='1' defaultChecked={showTest} />
					<span>Pokaż testowe</span>
				</label>
				<div className='flex items-end'>
					<button className='opx-btn-primary px-4 py-2 text-sm font-bold' type='submit'>
						Filtruj
					</button>
				</div>
			</form>

			<div className='opx-panel overflow-hidden rounded-md'>
				<div className='border-b border-[#d9e4ee] px-4 py-3'>
					<div className='flex flex-wrap items-center justify-between gap-3'>
						<h2 className='font-bold text-[#132c43]'>Lista klientów</h2>
						<p className='text-sm text-[#5f7487]'>
							{filtered.length} wyników · strona {safePage}/{totalPages}
						</p>
					</div>
				</div>
				<div className='hidden border-b border-[#d9e4ee] bg-[#f8fbfd] px-4 py-2 text-xs font-bold uppercase text-[#5f7487] md:grid md:grid-cols-[1.2fr_150px_120px_120px_130px_1fr] md:gap-3'>
					<span>Klient</span>
					<span>Źródło</span>
					<span>Zlecenia</span>
					<span>LTV</span>
					<span>Ostatnio</span>
					<span>Usługi</span>
				</div>
				<div className='divide-y divide-[#eef3f7]'>
					{pageRows.map(row => (
						<Link
							key={row.id}
							href={`/admin/customers/${row.id}`}
							className='grid gap-3 px-4 py-3 text-sm no-underline transition hover:bg-[#f8fbfd] md:grid-cols-[1.2fr_150px_120px_120px_130px_1fr]'
						>
							<div>
								<p className='font-bold text-[#132c43]'>
									{row.name}
									{row.isTest ? (
										<span className='ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800'>
											test
										</span>
									) : null}
								</p>
								<p className='text-[#5f7487]'>{row.phone}</p>
							</div>
							<p className='text-[#314a60]'>{row.source}</p>
							<p className='font-bold text-[#132c43]'>{row.totalOrders}</p>
							<p className='font-bold text-[#132c43]'>{formatMoney(row.totalSpent)}</p>
							<p className='text-[#314a60]'>{formatDate(row.latestActivity)}</p>
							<p className='line-clamp-2 text-[#5f7487]'>
								{row.services.length ? row.services.join(', ') : '-'}
							</p>
						</Link>
					))}
					{!pageRows.length ? (
						<p className='px-4 py-6 text-sm text-[#5f7487]'>Brak klientów dla filtrów.</p>
					) : null}
				</div>
			</div>

			<div className='flex flex-wrap justify-between gap-2'>
				<Link
					href={pageHref({ q, page: safePage - 1, showTest, sort })}
					className={`rounded-md px-4 py-2 text-sm font-bold ${
						safePage <= 1
							? 'pointer-events-none bg-white/20 text-white/40'
							: 'bg-white text-[#132c43]'
					}`}
				>
					Poprzednia
				</Link>
				<Link
					href={pageHref({ q, page: safePage + 1, showTest, sort })}
					className={`rounded-md px-4 py-2 text-sm font-bold ${
						safePage >= totalPages
							? 'pointer-events-none bg-white/20 text-white/40'
							: 'bg-white text-[#132c43]'
					}`}
				>
					Następna
				</Link>
			</div>
		</section>
	)
}
