import { db } from '@/lib/prisma'
import { GoogleAuth } from 'google-auth-library'

const DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager'
const DATA_MANAGER_INGEST_URL = 'https://datamanager.googleapis.com/v1/events:ingest'

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

function configuration() {
	const serviceAccountJson = process.env.GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON?.trim()
	const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/\D/g, '')
	const conversionActionId = process.env.GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_ID?.trim()

	if (!serviceAccountJson || !customerId || !conversionActionId) return null

	return { serviceAccountJson, customerId, conversionActionId }
}

async function sendGoogleAdsOfflineConversion(conversion, config) {
	const credentials = JSON.parse(config.serviceAccountJson)
	const auth = new GoogleAuth({ credentials, scopes: [DATA_MANAGER_SCOPE] })
	const accessToken = await auth.getAccessToken()
	if (!accessToken) throw new Error('Google Data Manager access token is unavailable')
	const adIdentifiers = {}
	if (conversion.gclid) adIdentifiers.gclid = conversion.gclid
	if (conversion.wbraid) adIdentifiers.wbraid = conversion.wbraid
	if (conversion.gbraid) adIdentifiers.gbraid = conversion.gbraid

	const response = await fetch(DATA_MANAGER_INGEST_URL, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${accessToken}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			destinations: [
				{
					operatingAccount: { accountType: 'GOOGLE_ADS', accountId: config.customerId },
					loginAccount: { accountType: 'GOOGLE_ADS', accountId: config.customerId },
					productDestinationId: config.conversionActionId,
				},
			],
			events: [
				{
					adIdentifiers,
					conversionValue: conversion.value,
					currency: conversion.currency,
					eventTimestamp: conversion.conversionAt.toISOString(),
					transactionId: conversion.transactionId,
					eventSource: 'WEB',
				},
			],
		}),
	})

	const body = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new Error(body.error?.message || `Google Data Manager returned ${response.status}`)
	}

	return body.requestId || null
}

export async function processGoogleAdsOfflineConversions(limit = 20) {
	const config = configuration()
	if (!config) return { configured: false, sent: 0, failed: 0 }

	const abandonedBefore = new Date(Date.now() - 15 * 60 * 1000)
	const conversions = await db.googleAdsOfflineConversion.findMany({
		where: {
			OR: [
				{ status: { in: ['PENDING_CONFIGURATION', 'RETRY'] } },
				{ status: 'SENDING', updatedAt: { lt: abandonedBefore } },
			],
		},
		orderBy: { createdAt: 'asc' },
		take: limit,
	})

	const results = { configured: true, sent: 0, failed: 0 }
	for (const conversion of conversions) {
		const claim = await db.googleAdsOfflineConversion.updateMany({
			where: {
				id: conversion.id,
				OR: [
					{ status: { in: ['PENDING_CONFIGURATION', 'RETRY'] } },
					{ status: 'SENDING', updatedAt: { lt: abandonedBefore } },
				],
			},
			data: { status: 'SENDING', attemptCount: { increment: 1 }, lastError: null },
		})
		if (!claim.count) continue

		try {
			const requestId = await sendGoogleAdsOfflineConversion(conversion, config)
			await db.googleAdsOfflineConversion.update({
				where: { id: conversion.id },
				data: { status: 'SENT', requestId, sentAt: new Date(), lastError: null },
			})
			results.sent += 1
		} catch (error) {
			await db.googleAdsOfflineConversion.update({
				where: { id: conversion.id },
				data: {
					status: 'RETRY',
					lastError: String(error?.message || 'Google Data Manager import failed').slice(0, 1000),
				},
			})
			results.failed += 1
			console.error('[google ads offline conversion]', error)
		}
	}

	return results
}
