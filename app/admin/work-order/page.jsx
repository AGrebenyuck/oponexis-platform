import { Suspense } from 'react'
import WorkOrderEditInner from './work-order-inner'

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className='opx-panel mx-auto max-w-xl rounded-md p-5 text-center'>
					<p className='text-sm font-semibold text-[#132c43]'>Ładowanie zlecenia…</p>
				</div>
			}
		>
			<WorkOrderEditInner />
		</Suspense>
	)
}
