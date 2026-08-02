import { db } from '@/lib/prisma'

const PRESERVED_CONTACT_STATUSES = new Set([
	'INTERESTED',
	'BOOKED',
	'DECLINED',
	'CALL_BACK',
])

export async function markRecipientSmsSent({ campaignId, recipient }) {
	if (!recipient?.customerId || !campaignId) return null

	const campaign = await db.smsCampaign.findUnique({
		where: { id: campaignId },
		select: { sourceSeason: true, sourceYear: true },
	})

	if (!campaign?.sourceSeason || !campaign?.sourceYear) return null

	const existing = await db.customerSeasonStatus.findUnique({
		where: {
			customerId_season_year: {
				customerId: recipient.customerId,
				season: campaign.sourceSeason,
				year: campaign.sourceYear,
			},
		},
	})

	if (existing && PRESERVED_CONTACT_STATUSES.has(existing.status)) {
		return existing
	}

	return db.customerSeasonStatus.upsert({
		where: {
			customerId_season_year: {
				customerId: recipient.customerId,
				season: campaign.sourceSeason,
				year: campaign.sourceYear,
			},
		},
		create: {
			customerId: recipient.customerId,
			season: campaign.sourceSeason,
			year: campaign.sourceYear,
			status: 'SMS_SENT',
			note: 'SMS kampania: wiadomość wysłana.',
			lastContactAt: new Date(),
		},
		update: {
			status: 'SMS_SENT',
			note: existing?.note || 'SMS kampania: wiadomość wysłana.',
			lastContactAt: new Date(),
		},
	})
}
