import { db } from '@/lib/prisma'
import { getSmsGateMessageStatus } from '@/lib/sms/smsGateClient'
import { markRecipientSmsSent } from '@/lib/sms/smsCampaignContacts'

function mapState(state) {
	if (state === 'DELIVERED') return 'DELIVERED'
	if (state === 'SENT') return 'SENT'
	if (state === 'FAILED') return 'FAILED'
	if (state === 'UNCERTAIN') return 'UNCERTAIN'
	if (state === 'PROCESSED') return 'PROCESSED'
	if (state === 'PENDING') return 'QUEUED'
	return state || 'QUEUED'
}

function isTerminal(status) {
	return ['SENT', 'DELIVERED', 'FAILED', 'UNCERTAIN', 'CANCELLED', 'BOOKED', 'DECLINED', 'CALL_BACK'].includes(status)
}

export async function syncSmsCampaignStatuses(id) {
	const recipients = await db.smsCampaignRecipient.findMany({
		where: {
			campaignId: id,
			providerMessageId: { not: null },
			status: { in: ['QUEUED', 'PROCESSED', 'SENT', 'UNCERTAIN'] },
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
					error: status === 'FAILED'
						? result.reason || 'SMSGate failed'
						: status === 'UNCERTAIN'
							? result.reason || 'Brak potwierdzenia z telefonu. Sprawdź urządzenie przed ponowieniem.'
							: null,
				},
			})
			if (['QUEUED', 'PROCESSED', 'SENT', 'DELIVERED'].includes(status)) {
				await markRecipientSmsSent({ campaignId: id, recipient })
			}
		} catch (error) {
			await db.smsCampaignRecipient.update({
				where: { id: recipient.id },
				data: { error: error.message || 'Nie pobrano statusu SMS.' },
			})
		}
	}

	const [allRecipients, recentOutcomes, currentCampaign] = await Promise.all([
		db.smsCampaignRecipient.findMany({
			where: { campaignId: id },
			select: { status: true },
		}),
		db.smsCampaignRecipient.findMany({
			where: { campaignId: id, status: { in: ['FAILED', 'SENT', 'DELIVERED'] } },
			select: { status: true },
			orderBy: { updatedAt: 'desc' },
			take: 3,
		}),
		db.smsCampaign.findUnique({ where: { id }, select: { status: true, startedAt: true } }),
	])
	const hasActive = allRecipients.some(item => !isTerminal(item.status))
	const hasFailed = allRecipients.some(item => item.status === 'FAILED')
	const hasUncertain = allRecipients.some(item => item.status === 'UNCERTAIN')
	const failedStreak = recentOutcomes.length === 3 && recentOutcomes.every(item => item.status === 'FAILED')
	const staleProcessing = currentCampaign?.status === 'PROCESSING' &&
		currentCampaign.startedAt && Date.now() - currentCampaign.startedAt.getTime() > 2 * 60 * 1000
	if (currentCampaign?.status === 'RUNNING' || staleProcessing) {
		await db.smsCampaign.updateMany({
			where: staleProcessing
				? { id, status: 'PROCESSING', startedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } }
				: { id, status: 'RUNNING' },
			data: {
				status: hasUncertain || (hasActive && failedStreak) ? 'PAUSED' : hasActive ? 'RUNNING' : hasFailed ? 'FAILED' : 'COMPLETED',
				finishedAt: hasActive && !failedStreak && !hasUncertain ? null : new Date(),
			},
		})
	}

	return db.smsCampaign.findUnique({ where: { id }, include: { recipients: true } })
}
