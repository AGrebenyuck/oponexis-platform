import Link from 'next/link'
import { db } from '@/lib/prisma'
import Button from '../_components/ui/Button'
import DeleteCampaignButton from './DeleteCampaignButton'
import SmsGateTechnicalPanel from './SmsGateTechnicalPanel'

function formatDate(value) {
	if (!value) return '-'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value))
}

function stats(recipients) {
	return {
		total: recipients.length,
		queued: recipients.filter(item => item.status === 'QUEUED').length,
		sent: recipients.filter(item => item.status === 'SENT').length,
		delivered: recipients.filter(item => item.status === 'DELIVERED').length,
		failed: recipients.filter(item => item.status === 'FAILED').length,
	}
}

export default async function SmsCampaignsPage() {
	const campaigns = await db.smsCampaign.findMany({
		orderBy: { createdAt: 'desc' },
		include: { recipients: true },
		take: 100,
	})

	return (
		<section className='space-y-5'>
			<div>
				<h1 className='text-2xl font-semibold text-white'>SMS kampanie</h1>
				<p className='text-sm text-[#d7e4ef]'>
					Kampanie sezonowe, wysyłka SMS i statusy odbiorców.
				</p>
			</div>

			<SmsGateTechnicalPanel />

			<div className='grid gap-3'>
				{campaigns.map(campaign => {
					const campaignStats = stats(campaign.recipients)
					return (
						<div
							key={campaign.id}
							className='opx-panel rounded-md p-4 transition hover:border-[#fd6d02]'
						>
							<div className='flex flex-wrap items-start justify-between gap-3'>
								<div>
									<Link
										href={`/admin/sms-campaigns/${campaign.id}`}
										className='text-lg font-bold text-[#132c43] no-underline'
									>
										{campaign.name}
									</Link>
									<p className='text-sm text-[#5f7487]'>
										Utworzono: {formatDate(campaign.createdAt)}
									</p>
									{campaign.scheduledAt ? (
										<p className='text-sm font-bold text-[#fd6d02]'>
											Start: {formatDate(campaign.scheduledAt)}
										</p>
									) : null}
								</div>
								<div className='flex flex-wrap items-center gap-2'>
									<span className='rounded-full bg-[#132c43] px-3 py-1 text-xs font-bold text-white'>
										{campaign.status}
									</span>
									<DeleteCampaignButton id={campaign.id} />
								</div>
							</div>
							<div className='mt-3 flex flex-wrap gap-2 text-sm text-[#314a60]'>
								<span>Odbiorcy: {campaignStats.total}</span>
								<span>Kolejka: {campaignStats.queued}</span>
								<span>Wysłane: {campaignStats.sent}</span>
								<span>Dostarczone: {campaignStats.delivered}</span>
								<span>Błędy: {campaignStats.failed}</span>
							</div>
						</div>
					)
				})}
				{!campaigns.length ? (
					<div className='opx-panel rounded-md p-4 text-sm text-[#5f7487]'>
						Brak kampanii. Utwórz pierwszą z poziomu zakładki Sezon.
					</div>
				) : null}
			</div>

			<Link href='/admin/season'>
				<Button type='button' variant='secondary'>
					Przejdź do sezonu
				</Button>
			</Link>
		</section>
	)
}
