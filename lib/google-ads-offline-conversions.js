import { db } from '@/lib/prisma'

function firstNonEmpty(...values) {
	return values.find(value => typeof value === 'string' && value.trim()) || null
}

export async function queueGoogleAdsOfflineConversion({ completion, order }) {
	if (completion.serviceUsed !== true || !completion.completedAt || !Number.isFinite(completion.amount)) {
		return null
	}

	const gclid = firstNonEmpty(order.firstTouchGclid, order.lead?.firstTouchGclid)
	const wbraid = firstNonEmpty(order.firstTouchWbraid, order.lead?.firstTouchWbraid)
	const gbraid = firstNonEmpty(order.firstTouchGbraid, order.lead?.firstTouchGbraid)
	if (!gclid && !wbraid && !gbraid) return null

	return db.googleAdsOfflineConversion.upsert({
		where: { completionId: completion.id },
		create: {
			completionId: completion.id,
			workOrderId: order.id,
			gclid,
			wbraid,
			gbraid,
			conversionAt: completion.completedAt,
			value: completion.amount,
			transactionId: `work-order-completion-${completion.id}`,
		},
		update: {
			gclid,
			wbraid,
			gbraid,
			conversionAt: completion.completedAt,
			value: completion.amount,
		},
	})
}
