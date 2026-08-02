import QuickExpenseForm from './QuickExpenseForm'
import Image from 'next/image'
import { db } from '@/lib/prisma'
import { FINANCE_EXPENSE_CATEGORIES, FINANCE_INCOME_CATEGORIES } from '@/lib/finance'

export const metadata = { title: 'Szybki zapis finansowy · Oponexis' }
export const dynamic = 'force-dynamic'

export default async function QuickExpensePage() {
	const savedCategories = await db.financeTransaction.findMany({ distinct: ['category', 'type'], select: { category: true, type: true } })
	const expenseCategories = Array.from(new Set([
		...FINANCE_EXPENSE_CATEGORIES,
		...savedCategories.filter(item => item.type === 'EXPENSE').map(item => item.category),
	])).sort((a, b) => a.localeCompare(b, 'pl'))
	const incomeCategories = Array.from(new Set([
		...FINANCE_INCOME_CATEGORIES,
		...savedCategories.filter(item => item.type === 'INCOME').map(item => item.category),
	])).sort((a, b) => a.localeCompare(b, 'pl'))

	return (
		<main className='min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(44,112,183,0.45),transparent_32rem),linear-gradient(145deg,#132c43_0%,#0a1c2b_100%)] px-4 py-6 text-[#132c43] sm:py-10'>
			<div className='mx-auto mb-5 flex w-full max-w-xl items-center justify-between gap-4'>
				<Image src='/oponexis-logo.svg' alt='Oponexis' width={154} height={27} priority className='h-auto w-32 sm:w-36' />
				<a href='/admin/finance' className='rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15'>Przejdź do finansów</a>
			</div>
			<section className='mx-auto w-full max-w-xl rounded-3xl border border-white/20 bg-white p-6 shadow-2xl shadow-black/20 sm:p-8'>
				<p className='text-sm font-black uppercase tracking-wide text-[#2c70b7]'>Oponexis · Finanse</p>
				<h1 className='mt-2 text-3xl font-black'>Szybki zapis finansowy</h1>
				<p className='mt-2 text-sm text-[#5f7487]'>Dodaj wydatek lub dodatkowy przychód. Wszystkie pola poza opisem są wymagane.</p>
				<QuickExpenseForm expenseCategories={expenseCategories} incomeCategories={incomeCategories} />
			</section>
		</main>
	)
}
