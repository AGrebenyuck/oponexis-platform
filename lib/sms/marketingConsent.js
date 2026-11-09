import { db } from '@/lib/prisma'
import { normalizePhone } from '@/lib/date'

export async function findMarketingSmsIneligibleRecipients(
	recipients = [],
	{ allowWithoutConsent = false, allowManuallyConfirmed = false } = {}
) {
	const customerIds = [...new Set(recipients.map(item => item.customerId).filter(Boolean))]
	const customers = await db.customer.findMany({
		where: { id: { in: customerIds } },
		select: {
			id: true,
			phone: true,
			marketingSmsConsentAt: true,
			marketingSmsRevokedAt: true,
		},
	})
	const byId = new Map(customers.map(customer => [customer.id, customer]))

	return recipients.filter(recipient => {
		const customer = byId.get(recipient.customerId)
		const manualContactConfirmed = allowManuallyConfirmed && !recipient.customerId
		const activeConsent = Boolean(
			customer?.marketingSmsConsentAt &&
			(!customer.marketingSmsRevokedAt || customer.marketingSmsRevokedAt < customer.marketingSmsConsentAt)
		)
		if (manualContactConfirmed) return false
		return (
			!customer ||
			(!activeConsent && !allowWithoutConsent) ||
			normalizePhone(customer.phone) !== normalizePhone(recipient.phone)
		)
	})
}
