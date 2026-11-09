import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { companionSmsEnabled, parseCompanionProviderMessageId } from '@/lib/sms/companionSmsClient'

export async function POST(_req, { params }) {
	try {
		const { id } = await params
		if (!companionSmsEnabled()) {
			return NextResponse.json(
				{ success: false, error: 'Bezpieczne ponawianie jest obecnie dostępne tylko dla wysyłki przez Companion.' },
				{ status: 409 }
			)
		}

		const campaign = await db.smsCampaign.findUnique({ where: { id }, select: { id: true } })
		if (!campaign) {
			return NextResponse.json({ success: false, error: 'Nie znaleziono kampanii.' }, { status: 404 })
		}

		const failedRecipients = await db.smsCampaignRecipient.findMany({
			where: { campaignId: id, status: 'FAILED', providerMessageId: { not: null } },
			select: { id: true, providerMessageId: true },
		})
		let retried = 0
		let skipped = 0

		for (const recipient of failedRecipients) {
			const dispatchId = parseCompanionProviderMessageId(recipient.providerMessageId)
			if (!dispatchId) {
				skipped += 1
				continue
			}

			const wasReset = await db.$transaction(async tx => {
				const dispatch = await tx.mobileSmsDispatch.findUnique({
					where: { id: dispatchId },
					select: { status: true },
				})
				if (dispatch?.status !== 'FAILED') return false

				const dispatchUpdate = await tx.mobileSmsDispatch.updateMany({
					where: { id: dispatchId, status: 'FAILED' },
					data: { idempotencyKey: null },
				})
				if (!dispatchUpdate.count) return false

				const recipientUpdate = await tx.smsCampaignRecipient.updateMany({
					where: {
						id: recipient.id,
						campaignId: id,
						status: 'FAILED',
						providerMessageId: recipient.providerMessageId,
					},
					data: {
						status: 'PENDING',
						providerMessageId: null,
						sentAt: null,
						failedAt: null,
						error: null,
					},
				})
				if (!recipientUpdate.count) return false

				return true
			})
			if (wasReset) retried += 1
			else skipped += 1
		}

		if (retried) {
			await db.smsCampaign.update({
				where: { id },
				data: { status: 'RUNNING', startedAt: new Date(), finishedAt: null },
			})
		}

		const updatedCampaign = await db.smsCampaign.findUnique({
			where: { id },
			include: { recipients: true },
		})
		return NextResponse.json({ success: true, retried, skipped, data: updatedCampaign })
	} catch (error) {
		console.error('POST /api/admin/sms-campaigns/[id]/retry-failed failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie ponowiono nieudanych wiadomości.' },
			{ status: 500 }
		)
	}
}
