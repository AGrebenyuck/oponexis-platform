export default function WorkOrderCompletionLoading() {
	return (
		<main className='grid min-h-screen place-items-center bg-[#132c43] px-5 text-white'>
			<div className='text-center' role='status' aria-live='polite'>
				<span className='mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-[#fd6d02]' />
				<p className='mt-4 text-base font-bold'>Ładowanie formularza…</p>
				<p className='mt-1 text-sm text-white/65'>Pobieramy dane zlecenia.</p>
			</div>
		</main>
	)
}
