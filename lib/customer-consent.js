import { db } from '@/lib/prisma'

export const PRIVACY_POLICY_VERSION = '2026-08-22'
export const MARKETING_SMS_POLICY_VERSION = '2026-08-22'

function hasActiveMarketingSmsConsent(customer) {
	if (!customer?.marketingSmsConsentAt) return false
	return !customer.marketingSmsRevokedAt || customer.marketingSmsRevokedAt < customer.marketingSmsConsentAt
}

export function consentSnapshot(customer) {
	return {
		privacyAccepted: Boolean(customer?.privacyPolicyAcceptedAt),
		marketingSmsAccepted: hasActiveMarketingSmsConsent(customer),
	}
}

export async function recordCustomerConsents({ customerId, privacyAccepted, marketingSmsAccepted, source }) {
	if (!customerId) return null
	const now = new Date()
	const events = []
	const data = {}

	if (privacyAccepted) {
		data.privacyPolicyAcceptedAt = now
		data.privacyPolicyVersion = PRIVACY_POLICY_VERSION
		events.push({
			customerId,
			type: 'PRIVACY_NOTICE',
			action: 'GRANTED',
			policyVersion: PRIVACY_POLICY_VERSION,
			source,
		})
	}
	if (marketingSmsAccepted) {
		data.marketingSmsConsentAt = now
		data.marketingSmsVersion = MARKETING_SMS_POLICY_VERSION
		data.marketingSmsRevokedAt = null
		events.push({
			customerId,
			type: 'MARKETING_SMS',
			action: 'GRANTED',
			policyVersion: MARKETING_SMS_POLICY_VERSION,
			source,
		})
	}
	if (!events.length) return consentSnapshot(await db.customer.findUnique({ where: { id: customerId } }))

	const [, customer] = await db.$transaction([
		db.customerConsent.createMany({ data: events }),
		db.customer.update({ where: { id: customerId }, data }),
	])
	return consentSnapshot(customer)
}

export async function revokeMarketingSmsConsent({ customerId, source = 'unsubscribe' }) {
	const customer = await db.customer.update({
		where: { id: customerId },
		data: { marketingSmsRevokedAt: new Date() },
	})
	await db.customerConsent.create({
		data: {
			customerId,
			type: 'MARKETING_SMS',
			action: 'REVOKED',
			policyVersion: customer.marketingSmsVersion || MARKETING_SMS_POLICY_VERSION,
			source,
		},
	})
	return consentSnapshot(customer)
}
