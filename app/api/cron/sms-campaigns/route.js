import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { runSmsCampaign } from '@/lib/sms/smsCampaignRunner'
import { smsGateConfigured } from '@/lib/sms/smsGateClient'
import { syncSmsCampaignStatuses } from '@/lib/sms/syncSmsCampaignStatuses'

export const maxDuration = 60

function authorized(request) {
	const secret = process.env.CRON_SECRET?.trim()
	if (!secret) return process.env.NODE_ENV !== 'production'
	return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request) {
	try {
		if (!authorized(request)) {
			return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
		}
		const now = new Date()
		const staleProcessingBefore = new Date(now.getTime() - 2 * 60 * 1000)
		if (!smsGateConfigured()) {
			return NextResponse.json(
				{ success: false, error: 'Brak konfiguracji SMSGate w .env.' },
				{ status: 400 }
			)
		}

		const campaigns = await db.smsCampaign.findMany({
			where: {
				OR: [
					{ status: 'SCHEDULED', scheduledAt: { lte: now } },
					{ status: 'RUNNING' },
					{ status: 'PROCESSING', startedAt: { lt: staleProcessingBefore } },
				],
			},
			orderBy: { scheduledAt: 'asc' },
			take: 1,
		})

		const results = []
		for (const campaign of campaigns) {
			try {
				await runSmsCampaign(campaign.id)
				const updated = await syncSmsCampaignStatuses(campaign.id)
				results.push({ id: campaign.id, status: updated.status })
			} catch (error) {
				if (error.code !== 'SMS_CAMPAIGN_NOT_STARTABLE') {
					await db.smsCampaign.updateMany({
						where: {
							id: campaign.id,
							status: { in: ['SCHEDULED', 'RUNNING', 'PROCESSING'] },
						},
						data: { status: 'FAILED', finishedAt: new Date() },
					})
				}
				const current = await db.smsCampaign.findUnique({
					where: { id: campaign.id },
					select: { status: true },
				})
				results.push({
					id: campaign.id,
					status: current?.status || 'FAILED',
					error: error.message || 'Nie uruchomiono kampanii.',
				})
			}
		}

		return NextResponse.json({ success: true, started: results.length, results })
	} catch (error) {
		console.error('POST /api/cron/sms-campaigns failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie uruchomiono zaplanowanych kampanii.' },
			{ status: 500 }
		)
	}
}

export async function GET(request) {
	return POST(request)
}
