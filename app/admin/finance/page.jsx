import FinanceClient from './FinanceClient'
import FinanceExpenseInsights from './FinanceExpenseInsights'
import FinancePeriodFilter from './FinancePeriodFilter'
import { db } from '@/lib/prisma'
import { completionDate, formatMoney, isRealCompletion } from '@/lib/crmAnalytics'
import { financeMonthKey, financeMonthRange } from '@/lib/finance'

export const dynamic = 'force-dynamic'

function sum(rows) {
	return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
}

function Metric({ label, value, hint, tone = 'text-[#132c43]' }) {
	return <div className='rounded-2xl border border-[#dbe6ee] bg-white p-5 shadow-sm'><p className='text-xs font-black uppercase tracking-wide text-[#89a7bf]'>{label}</p><p className={`mt-2 text-2xl font-black ${tone}`}>{formatMoney(value)}</p><p className='mt-1 text-xs text-[#5f7487]'>{hint}</p></div>
}

export default async function FinancePage({ searchParams }) {
	const params = await searchParams
	const selectedMonths = (Array.isArray(params?.month) ? params.month : [params?.month]).filter(value => financeMonthRange(value))
	const selectedYear = /^\d{4}$/.test(String(params?.year || '')) ? String(params.year) : ''
	const ranges = selectedMonths.map(financeMonthRange).filter(Boolean)
	const yearRange = selectedYear ? { from: new Date(Date.UTC(Number(selectedYear), 0, 1)), to: new Date(Date.UTC(Number(selectedYear) + 1, 0, 1)) } : null
	const activeRanges = ranges.length ? ranges : yearRange ? [yearRange] : []
	const transactionWhere = activeRanges.length ? { OR: activeRanges.map(range => ({ occurredAt: { gte: range.from, lt: range.to } })) } : undefined
	const completionWhere = activeRanges.length ? { isTest: false, OR: activeRanges.flatMap(range => [{ completedAt: { gte: range.from, lt: range.to } }, { completedAt: null, createdAt: { gte: range.from, lt: range.to } }]) } : { isTest: false }
	const [completions, transactions, transactionPeriods, completionPeriods] = await Promise.all([
		db.workOrderCompletion.findMany({ where: completionWhere }),
		db.financeTransaction.findMany({ where: transactionWhere, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] }),
		db.financeTransaction.findMany({ select: { occurredAt: true, category: true, type: true } }),
		db.workOrderCompletion.findMany({ where: { isTest: false }, select: { completedAt: true, createdAt: true } }),
	])
	const months = Array.from(new Set([
		...transactionPeriods.map(item => financeMonthKey(item.occurredAt)),
		...completionPeriods.map(item => financeMonthKey(completionDate(item))),
	].filter(Boolean))).sort().reverse()
	const savedExpenseCategories = transactionPeriods.filter(item => item.type === 'EXPENSE').map(item => item.category)
	const savedIncomeCategories = transactionPeriods.filter(item => item.type === 'INCOME').map(item => item.category)
	const serviceRevenue = sum(completions.filter(isRealCompletion))
	const paidIncome = sum(transactions.filter(item => item.type === 'INCOME' && item.status === 'PAID'))
	const paidExpenses = sum(transactions.filter(item => item.type === 'EXPENSE' && item.status === 'PAID'))
	const expenseRows = transactions.filter(item => item.type === 'EXPENSE' && item.status === 'PAID')
	const expenseCategories = Array.from(expenseRows.reduce((summary, item) => {
		const current = summary.get(item.category) || { category: item.category, amount: 0, count: 0 }
		current.amount += Number(item.amount) || 0
		current.count += 1
		summary.set(item.category, current)
		return summary
	}, new Map()).values()).sort((a, b) => b.amount - a.amount)
	const plannedExpenses = sum(transactions.filter(item => item.type === 'EXPENSE' && item.status === 'PLANNED'))
	const totalIncome = serviceRevenue + paidIncome

	return (
		<section className='space-y-6'>
			<div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
				<div>
					<p className='text-sm font-bold uppercase tracking-wide text-[#89a7bf]'>Oponexis Platform · Finanse</p>
					<h1 className='text-3xl font-black text-white'>Pieniądze projektu</h1>
					<p className='mt-2 max-w-3xl text-sm text-[#b9cad8]'>Przychód z wykonanych zleceń pobieramy automatycznie z CRM. Poniżej dodawaj operacyjne koszty, wynagrodzenia, paliwo i pozostałe zapisy.</p>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					<FinancePeriodFilter months={months} selectedMonths={selectedMonths} selectedYear={selectedYear} />
					<FinanceExpenseInsights categories={expenseCategories} total={paidExpenses} count={expenseRows.length} selectedMonth={selectedMonths.length === 1 ? selectedMonths[0] : selectedYear || 'all'} />
				</div>
			</div>
			<div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
				<Metric label='Przychód usług' value={serviceRevenue} hint='z formularzy wykonania' tone='text-[#2f7a4d]' />
				<Metric label='Wydatki opłacone' value={paidExpenses} hint='koszty rzeczywiste' tone='text-[#b9472b]' />
				<Metric label='Wynik netto' value={totalIncome - paidExpenses} hint='przychód minus koszty' tone={totalIncome - paidExpenses < 0 ? 'text-[#b9472b]' : 'text-[#2f7a4d]'} />
				<Metric label='Planowane wydatki' value={plannedExpenses} hint='jeszcze nieopłacone' tone='text-[#a16310]' />
			</div>
			<FinanceClient
				transactions={transactions.map(item => ({ ...item, occurredAt: item.occurredAt.toISOString() }))}
				savedExpenseCategories={savedExpenseCategories}
				savedIncomeCategories={savedIncomeCategories}
			/>
		</section>
	)
}
