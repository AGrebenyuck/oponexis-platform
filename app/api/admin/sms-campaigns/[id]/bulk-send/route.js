import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { renderSmsTemplate } from '@/lib/sms/messageTemplate'
import { sendSmsGateMessage, smsGateConfigSummary } from '@/lib/sms/smsGateClient'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'
import { markRecipientSmsSent } from '@/lib/sms/smsCampaignContacts'
import { findMarketingSmsIneligibleRecipients } from '@/lib/sms/marketingConsent'
import {
	campaignAllowsMissingMarketingConsent,
	smsCampaignTestModeEnabled,
} from '@/lib/sms/smsCampaignTestMode'

function shortMessageId() {
	return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export async function POST(req, { params }) {
	try {
		const { id } = await params
		const body = await req.json()
		const recipientIds = Array.isArray(body?.recipientIds) ? body.recipientIds : []
		const message = String(body?.message || '').trim()

		if (!recipientIds.length || !message) {
			return NextResponse.json(
				{ success: false, error: 'Wybierz odbiorców i wpisz treść SMS.' },
				{ status: 400 }
			)
		}

		const recipients = await db.smsCampaignRecipient.findMany({
			where: { campaignId: id, id: { in: recipientIds } },
		})
		const campaign = await db.smsCampaign.findUnique({ where: { id }, select: { filters: true } })
		const allowWithoutConsent = campaignAllowsMissingMarketingConsent(campaign)
		if (campaign?.filters?.smsCampaignTestMode === true && !smsCampaignTestModeEnabled()) {
			return NextResponse.json(
				{ success: false, error: 'Tryb testowy SMS został wyłączony na tym serwerze.' },
				{ status: 403 }
			)
		}
		const profile = process.env.SMSGATE_CAMPAIGN_PROFILE || undefined
		const config = smsGateConfigSummary(profile)
		const results = []
		const ineligibleIds = new Set(
			(
				await findMarketingSmsIneligibleRecipients(recipients, {
					allowWithoutConsent,
					allowManuallyConfirmed: campaign?.filters?.smsCampaignManualConsentConfirmed === true,
				})
			).map(item => item.id)
		)

		for (const recipient of recipients) {
			if (ineligibleIds.has(recipient.id)) {
				const reason = 'Brak aktywnej zgody marketingowej SMS lub numer nie zgadza się z kartą klienta.'
				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: { status: 'FAILED', failedAt: new Date(), error: reason },
				})
				results.push({ id: recipient.id, ok: false, error: reason })
				continue
			}
			try {
				const text = renderSmsTemplate(message, recipient)
				const provider = await sendSmsGateMessage({
					phone: recipient.phone,
					text,
					customId: shortMessageId(),
					profile,
				})
				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: {
						status: 'QUEUED',
						providerMessageId: provider?.id || recipient.providerMessageId,
						error: null,
					},
				})
				await createSmsContactEvent({
					campaignId: id,
					recipientId: recipient.id,
					customerId: recipient.customerId,
					direction: 'OUT',
					type: 'sms_sent_manual',
					phone: recipient.phone,
					message: text,
					providerMessageId: provider?.id || null,
					occurredAt: new Date(),
					raw: { profile: config.profile, ...(provider?.raw || {}) },
				})
				await markRecipientSmsSent({ campaignId: id, recipient })
				results.push({ id: recipient.id, ok: true, providerMessageId: provider?.id || null })
			} catch (error) {
				await db.smsCampaignRecipient.update({
					where: { id: recipient.id },
					data: { status: 'FAILED', error: error.message || 'SMSGate error' },
				})
				results.push({ id: recipient.id, ok: false, error: error.message })
			}
		}

		return NextResponse.json({ success: true, data: { results } })
	} catch (error) {
		console.error('POST /api/admin/sms-campaigns/[id]/bulk-send failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie wysłano SMS.' },
			{ status: 500 }
		)
	}
}
