import { db } from '@/lib/prisma'
import { mobileDeviceEnvironmentWhere } from '@/lib/mobile-environment'
import { publishMobileSmsDispatch } from '@/lib/mobile-push'

const ID_PREFIX = 'cmp:'

export function companionSmsEnabled() {
	return String(process.env.OPONEXIS_SMS_PROVIDER || '').trim().toLowerCase() === 'companion'
}

export function companionProviderMessageId(id) {
	return `${ID_PREFIX}${id}`
}

export function parseCompanionProviderMessageId(value) {
	const id = String(value || '')
	return id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : null
}

export async function getPrimaryCompanionDevice() {
	return db.mobilePushDevice.findFirst({
		where: { enabled: true, smsPrimary: true, ...mobileDeviceEnvironmentWhere() },
		orderBy: { lastSeenAt: 'desc' },
	})
}

export function companionDeviceLabel(device) {
	if (!device) return 'Brak aktywnego urządzenia Companion'
	const name = device.label || [device.manufacturer, device.model].filter(Boolean).join(' ') || 'Oponexis Companion'
	const phone = device.phoneNumber || 'numer SIM nieuzupełniony'
	return `${name} · ${phone} · SIM ${device.simSlot || 1}`
}

export async function enqueueCompanionSms({ phone, text, customId, profile }) {
	const idempotencyKey = String(customId || '').trim() || null
	const source = await dispatchSource(idempotencyKey)
	const device = await getPrimaryCompanionDevice()
	if (!device) throw new Error('Brak aktywnego urządzenia Oponexis Companion.')
	let dispatch = idempotencyKey
		? await db.mobileSmsDispatch.findUnique({ where: { idempotencyKey } })
		: null
	if (!dispatch) {
		try {
			dispatch = await db.mobileSmsDispatch.create({
				data: { idempotencyKey, phone, message: text, source, profile: profile || null, deviceId: device.id },
			})
		} catch (error) {
			if (error?.code !== 'P2002' || !idempotencyKey) throw error
			dispatch = await db.mobileSmsDispatch.findUnique({ where: { idempotencyKey } })
			if (!dispatch) throw error
		}
	}
	if (dispatch.status === 'QUEUED') await publishMobileSmsDispatch(dispatch)
	return {
		id: companionProviderMessageId(dispatch.id),
		raw: {
			provider: 'companion',
			status: dispatch.status,
			dispatchId: dispatch.id,
			deviceId: device.id,
			deviceLabel: companionDeviceLabel(device),
		},
	}
}

async function dispatchSource(idempotencyKey) {
	if (!idempotencyKey) return 'PLATFORM'
	if (idempotencyKey.includes('form-completed')) return 'FORM_COMPLETED'
	if (idempotencyKey.includes('appointment-change')) return 'APPOINTMENT_CHANGED'
	if (idempotencyKey.includes('reminder')) return 'REMINDER'
	if (idempotencyKey.includes('form')) return 'BOOKING_FORM'
	if (idempotencyKey.startsWith('mobile-')) return 'COMPANION'
	const campaignRecipient = await db.smsCampaignRecipient.findUnique({
		where: { id: idempotencyKey },
		select: { id: true },
	})
	return campaignRecipient ? 'CAMPAIGN' : 'PLATFORM'
}

export async function getCompanionSmsStatus(providerMessageId) {
	const id = parseCompanionProviderMessageId(providerMessageId)
	if (!id) return null
	const dispatch = await db.mobileSmsDispatch.findUnique({ where: { id } })
	if (!dispatch) throw new Error('Companion message not found')
	return {
		state: dispatch.status === 'CLAIMED' ? 'QUEUED' : dispatch.status,
		reason: dispatch.error,
		raw: dispatch,
	}
}
