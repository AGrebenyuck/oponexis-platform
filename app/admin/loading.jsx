export default function AdminLoading() {
	return (
		<div className='grid min-h-[45vh] place-items-center' role='status' aria-live='polite'>
			<div className='rounded-2xl border border-white/10 bg-[#132c43]/85 px-6 py-5 text-center text-white shadow-xl backdrop-blur'>
				<span className='mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-white/20 border-t-[#fd6d02]' />
				<p className='mt-3 text-sm font-bold'>Ładowanie widoku…</p>
			</div>
		</div>
	)
}
