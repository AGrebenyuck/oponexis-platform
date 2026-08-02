import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { getSmsGateMessageStatus } from '@/lib/sms/smsGateClient'
import { markRecipientSmsSent } from '@/lib/sms/smsCampaignContacts'

function mapState(state) {
	if (state === 'DELIVERED') return 'DELIVERED'
	if (state === 'SENT') return 'SENT'
	if (state === 'FAILED') return 'FAILED'
	if (state === 'PROCESSED') return 'PROCESSED'
	if (state === 'PENDING') return 'QUEUED'
	return state || 'QUEUED'
}

function isTerminal(status) {
	return ['SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'BOOKED', 'DECLINED', 'CALL_BACK'].includes(
		status
	)
}

export async function POST(_req, { params }) {
	try {
		const { id } = await params
		const recipients = await db.smsCampaignRecipient.findMany({
			where: {
				campaignId: id,
				providerMessageId: { not: null },
				status: { in: ['QUEUED', 'PROCESSED', 'SENT'] },
			},
		})

		for (const recipient of recipients) {
			try {
				const result = await getSmsGateMessageStatus(recipient.providerMessageId)
				const status = mapState(result.state)
				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: {
						status,
						sentAt:
							['SENT', 'DELIVERED'].includes(status) && !recipient.sentAt
								? new Date()
								: undefined,
						failedAt: status === 'FAILED' ? new Date() : undefined,
						error: status === 'FAILED' ? result.reason || 'SMSGate failed' : null,
					},
				})
				if (['QUEUED', 'PROCESSED', 'SENT', 'DELIVERED'].includes(status)) {
					await markRecipientSmsSent({
						campaignId: id,
						recipient,
					})
				}
			} catch (error) {
				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: { error: error.message || 'Nie pobrano statusu SMS.' },
				})
			}
		}

		const allRecipients = await db.smsCampaignRecipient.findMany({
			where: { campaignId: id },
			select: { status: true },
		})
		const hasActive = allRecipients.some(item => !isTerminal(item.status))
		const hasFailed = allRecipients.some(item => item.status === 'FAILED')
		await db.smsCampaign.update({
			where: { id },
			data: {
				status: hasActive ? 'RUNNING' : hasFailed ? 'FAILED' : 'COMPLETED',
				finishedAt: hasActive ? null : new Date(),
			},
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('POST /api/admin/sms-campaigns/[id]/sync failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie odświeżono statusów SMS.' },
			{ status: 500 }
		)
	}
}
