import Image from 'next/image'
import LoginForm from './LoginForm'

export const metadata = { title: 'Logowanie · Oponexis Platform' }

function safeNextPath(value) {
	const path = String(value || '')
	return path.startsWith('/admin') && !path.startsWith('//')
		? path
		: '/admin/dashboard'
}

export default async function LoginPage({ searchParams }) {
	const params = await searchParams
	return (
		<main className='flex min-h-screen items-center justify-center px-4 py-10'>
			<section className='w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl shadow-black/20'>
				<div className='bg-[#132c43] px-6 py-7 text-white'>
					<Image src='/oponexis-logo.svg' alt='Oponexis' width={192} height={34} priority className='h-auto w-44' />
					<p className='mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/55'>Platform</p>
				</div>
				<div className='px-6 py-7'>
					<p className='text-xs font-bold uppercase tracking-wide text-[#fd6d02]'>Bezpieczny dostęp</p>
					<h1 className='mt-1 text-2xl font-black text-[#132c43]'>Zaloguj się</h1>
					<p className='mt-2 text-sm leading-6 text-[#5f7487]'>
						Wpisz hasło administratora lub superadministratora. Rola zostanie rozpoznana automatycznie.
					</p>
					<LoginForm nextPath={safeNextPath(params?.next)} />
				</div>
			</section>
		</main>
	)
}
