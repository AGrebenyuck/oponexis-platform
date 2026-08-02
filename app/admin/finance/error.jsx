'use client'

export default function FinanceError({ reset }) {
	return (
		<section className='max-w-xl rounded-2xl border border-[#f1c7bd] bg-white p-6 shadow-sm'>
			<p className='text-sm font-black uppercase tracking-wide text-[#b9472b]'>Finanse</p>
			<h1 className='mt-1 text-2xl font-black text-[#132c43]'>Nie udało się otworzyć modułu</h1>
			<p className='mt-3 text-sm text-[#5f7487]'>W środowisku dev po zmianie modelu Prisma uruchom ponownie serwer CRM, a następnie spróbuj ponownie.</p>
			<button type='button' onClick={reset} className='mt-5 rounded-xl bg-[#132c43] px-4 py-2.5 text-sm font-black text-white'>Spróbuj ponownie</button>
		</section>
	)
}
