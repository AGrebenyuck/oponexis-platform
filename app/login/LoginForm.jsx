'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm({ nextPath = '/admin/dashboard' }) {
	const router = useRouter()
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(false)

	async function submit(event) {
		event.preventDefault()
		setLoading(true)
		setError('')
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password }),
			})
			const data = await response.json()
			if (!response.ok || !data.ok) {
				throw new Error(data.error || 'Nie udało się zalogować.')
			}
			router.replace(nextPath)
			router.refresh()
		} catch (loginError) {
			setError(loginError.message || 'Nie udało się zalogować.')
		} finally {
			setLoading(false)
		}
	}

	return (
		<form onSubmit={submit} className='mt-8 space-y-4'>
			<label className='block space-y-2 text-sm font-bold text-[#132c43]'>
				<span>Hasło</span>
				<input
					type='password'
					autoComplete='current-password'
					autoFocus
					required
					value={password}
					onChange={event => setPassword(event.target.value)}
					className='opx-input'
					placeholder='Wpisz hasło do platformy'
				/>
			</label>
			{error ? (
				<p role='alert' className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700'>
					{error}
				</p>
			) : null}
			<button
				type='submit'
				disabled={loading}
				className='opx-btn-primary w-full px-4 py-3 text-sm disabled:opacity-60'
			>
				{loading ? 'Logowanie…' : 'Zaloguj się'}
			</button>
			<p className='text-center text-xs leading-5 text-[#6b7f90]'>
				Po zalogowaniu to urządzenie pozostanie zapamiętane zgodnie z ustawieniami platformy.
			</p>
		</form>
	)
}
