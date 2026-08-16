import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { db } from '@/lib/prisma'

const TERMINAL_TYPES = {
	sms_sent: 'SENT',
	sms_delivered: 'DELIVERED',
	sms_failed: 'FAILED',
	sms_cancelled: 'CANCELLED',
}

export function smsActivityStatus(event) {
	return TERMINAL_TYPES[event?.type] || (event?.direction === 'OUT' ? 'QUEUED' : null)
}

export function firebaseMessagingConfigured() {
	return Boolean(
		process.env.FIREBASE_PROJECT_ID?.trim() &&
		process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
		process.env.FIREBASE_PRIVATE_KEY?.trim()
	)
}

function messaging() {
	if (!firebaseMessagingConfigured()) return null
	const app = getApps()[0] || initializeApp({
		credential: cert({
			projectId: process.env.FIREBASE_PROJECT_ID.trim(),
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
			privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
		}),
	})
	return getMessaging(app)
}

function pushSource(type) {
	if (type.includes('reminder')) return 'REMINDER'
	if (type.includes('form_completed')) return 'FORM_COMPLETED'
	if (type.includes('booking_form')) return 'BOOKING_FORM'
	if (type.includes('campaign')) return 'CAMPAIGN'
	if (type.includes('mobile')) return 'COMPANION'
	return 'PLATFORM'
}

export async function publishSmsContactEvent(event) {
	try {
		const status = smsActivityStatus(event)
		if (!status || !event?.id) return
		const client = messaging()
		if (!client) return
		const devices = await db.mobilePushDevice.findMany({
			where: { enabled: true },
			select: { id: true, installationId: true },
			take: 500,
		})
		if (!devices.length) return
		const result = await client.sendEachForMulticast({
			fids: devices.map(device => device.installationId),
			android: { priority: 'high' },
			data: {
				type: 'sms_activity_changed',
				eventId: event.id,
				status,
				source: pushSource(event.type),
				occurredAt: event.occurredAt.toISOString(),
				...(event.providerMessageId ? { providerMessageId: event.providerMessageId } : {}),
			},
		})
		const invalidIds = result.responses.flatMap((response, index) => {
			const code = response.error?.code
			return code === 'messaging/registration-token-not-registered' ||
				code === 'messaging/invalid-registration-token'
				? [devices[index].id]
				: []
		})
		if (invalidIds.length) {
			await db.mobilePushDevice.updateMany({
				where: { id: { in: invalidIds } },
				data: { enabled: false },
			})
		}
	} catch (error) {
		console.error('[mobile push] send failed', {
			event: 'mobile_push_send_failed',
			errorCode: error?.code || 'unknown',
			errorType: error?.constructor?.name || 'UnknownError',
		})
	}
}
