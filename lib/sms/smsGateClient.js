import { createHash } from 'node:crypto'

const DEFAULT_BASE_URL = 'https://api.sms-gate.app'
const PROFILE_NAMES = ['test', 'work']
const MESSAGE_ID_MAX_LENGTH = 36
const DEVICE_ONLINE_MAX_AGE_MS = 20 * 60 * 1000

export function normalizeSmsGateMessageId(value) {
	const id = String(value || '').trim()
	if (!id || id.length <= MESSAGE_ID_MAX_LENGTH) return id || undefined

	const hash = createHash('sha256').update(id).digest('hex').slice(0, 12)
	return `${id.slice(0, MESSAGE_ID_MAX_LENGTH - hash.length - 1)}-${hash}`
}

function authHeader(username, password) {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function normalizeBaseUrl(value) {
	const baseUrl = (value || DEFAULT_BASE_URL).trim()
	if (/^https?:\/\//i.test(baseUrl)) return baseUrl
	return `https://${baseUrl}`
}

function normalizeProfile(value) {
	const profile = String(value || '').trim().toLowerCase()
	if (PROFILE_NAMES.includes(profile)) return profile
	const fallback = process.env.SMSGATE_DEFAULT_PROFILE?.trim().toLowerCase()
	return PROFILE_NAMES.includes(fallback) ? fallback : 'work'
}

function profileEnv(profile, key) {
	const scoped = process.env[`SMSGATE_${profile.toUpperCase()}_${key}`]
	if (scoped !== undefined && scoped !== '') return scoped
	return process.env[`SMSGATE_${key}`]
}

function errorMessage(prefix, status, json) {
	const details = json?.message || json?.error || json?.title
	return details ? `${prefix}: ${details}` : `${prefix}: SMSGate HTTP ${status}`
}

function errorCode(status) {
	if (status === 401 || status === 403) return 'sms_gateway_auth_failed'
	if (status === 404) return 'sms_gateway_not_found'
	if (status === 409) return 'sms_gateway_duplicate_request'
	if (status === 422) return 'sms_gateway_rejected'
	if (status === 429) return 'sms_gateway_rate_limited'
	if (status >= 500) return 'sms_gateway_unavailable'
	return 'sms_gateway_request_failed'
}

export class SmsGateRequestError extends Error {
	constructor(message, status) {
		super(message)
		this.name = 'SmsGateRequestError'
		this.status = status
		this.code = errorCode(status)
	}
}

export class SmsGateDeviceError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'SmsGateDeviceError'
		this.code = code
		this.status = 503
	}
}

function extractMessageId(json, fallbackId) {
	return (
		json?.id ||
		json?.messageId ||
		json?.ids?.[0] ||
		json?.data?.id ||
		json?.data?.messageId ||
		json?.items?.[0]?.id ||
		fallbackId ||
		null
	)
}

function extractMessageState(json) {
	const state =
		json?.state ||
		json?.status ||
		json?.data?.state ||
		json?.data?.status ||
		json?.items?.[0]?.state ||
		json?.items?.[0]?.status ||
		''
	return String(state).toUpperCase()
}

function extractMessageReason(json) {
	return (
		json?.reason ||
		json?.error ||
		json?.message ||
		json?.data?.reason ||
		json?.data?.error ||
		json?.items?.[0]?.reason ||
		json?.items?.[0]?.error ||
		null
	)
}

export function smsGateConfigured(profile) {
	const credentials = smsGateCredentials(profile)
	return Boolean(credentials.username && credentials.password)
}

function smsGateCredentials(profileValue) {
	const profile = normalizeProfile(profileValue)
	return {
		profile,
		username: profileEnv(profile, 'USERNAME')?.trim(),
		password: profileEnv(profile, 'PASSWORD')?.trim(),
		baseUrl: normalizeBaseUrl(profileEnv(profile, 'BASE_URL')),
		deviceId: profileEnv(profile, 'DEVICE_ID')?.trim() || '',
		senderPhone: profileEnv(profile, 'SENDER_PHONE')?.trim() || '',
		simNumber: Number(profileEnv(profile, 'SIM_NUMBER') || 1),
		useDeviceId: profileEnv(profile, 'USE_DEVICE_ID') !== 'false',
	}
}

export function smsGateConfigSummary(profileValue) {
	const {
		baseUrl,
		deviceId,
		profile,
		senderPhone,
		simNumber,
		useDeviceId,
		username,
		password,
	} = smsGateCredentials(profileValue)

	return {
		profile,
		baseUrl,
		usernameConfigured: Boolean(username),
		passwordConfigured: Boolean(password),
		usernameLength: username?.length || 0,
		passwordLength: password?.length || 0,
		deviceIdConfigured: Boolean(deviceId),
		deviceIdUsed: Boolean(useDeviceId && deviceId),
		deviceId: useDeviceId && deviceId ? deviceId : null,
		senderPhone: senderPhone || null,
		simNumber,
	}
}

export async function sendSmsGateMessage({ phone, text, customId, profile }) {
	const {
		username,
		password,
		baseUrl,
		deviceId,
		simNumber,
		useDeviceId,
		profile: activeProfile,
	} = smsGateCredentials(profile)

	if (!username || !password) {
		throw new Error(
			`Brak konfiguracji SMSGate dla profilu "${activeProfile}". Ustaw SMSGATE_${activeProfile.toUpperCase()}_USERNAME i SMSGATE_${activeProfile.toUpperCase()}_PASSWORD w .env.`
		)
	}

	const url = new URL('/3rdparty/v1/messages', baseUrl)
	url.searchParams.set('skipPhoneValidation', 'true')
	url.searchParams.set('deviceActiveWithin', '1')

	const messageId = normalizeSmsGateMessageId(customId)
	const payload = {
		id: messageId,
		textMessage: { text },
		phoneNumbers: [phone],
	}
	if (useDeviceId && deviceId) payload.deviceId = deviceId
	if (useDeviceId && Number.isFinite(simNumber)) payload.simNumber = simNumber

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: authHeader(username, password),
		},
		body: JSON.stringify(payload),
		cache: 'no-store',
	})

	const json = await res.json().catch(() => null)
	if (!res.ok) {
		throw new SmsGateRequestError(errorMessage('Nie wysłano SMS', res.status, json), res.status)
	}

	return {
		raw: json,
		id: extractMessageId(json, messageId),
	}
}

export async function getSmsGateMessageStatus(messageId, { profile } = {}) {
	const { username, password, baseUrl, profile: activeProfile } =
		smsGateCredentials(profile)

	if (!username || !password) {
		throw new Error(
			`Brak konfiguracji SMSGate dla profilu "${activeProfile}". Ustaw login i hasło w .env.`
		)
	}
	if (!messageId) {
		throw new Error('Brak ID wiadomości SMSGate.')
	}

	const url = new URL(`/3rdparty/v1/messages/${messageId}`, baseUrl)
	const res = await fetch(url, {
		headers: {
			Authorization: authHeader(username, password),
		},
		cache: 'no-store',
	})
	const json = await res.json().catch(() => null)
	if (!res.ok) {
		throw new Error(errorMessage('Nie pobrano statusu SMS', res.status, json))
	}

	return {
		raw: json,
		state: extractMessageState(json),
		reason: extractMessageReason(json),
	}
}

export async function checkSmsGateConnection(profile, { signal } = {}) {
	const {
		username,
		password,
		baseUrl,
		deviceId,
		senderPhone,
		simNumber,
		useDeviceId,
		profile: activeProfile,
	} = smsGateCredentials(profile)

	if (!username || !password) {
		throw new Error(
			`Brak konfiguracji SMSGate dla profilu "${activeProfile}". Ustaw login i hasło w .env.`
		)
	}

	const devicesUrl = new URL('/3rdparty/v1/devices', baseUrl)
	const res = await fetch(devicesUrl, {
		headers: {
			Authorization: authHeader(username, password),
		},
		cache: 'no-store',
		signal,
	})
	const json = await res.json().catch(() => null)

	if (!res.ok) {
		throw new Error(errorMessage('Autoryzacja SMSGate nie przeszła', res.status, json))
	}

	const devices = Array.isArray(json) ? json : json?.data || json?.items || []
	const device = deviceId
		? devices.find(item => item?.id === deviceId)
		: devices
			.filter(item => item?.lastSeen)
			.sort((left, right) => new Date(right.lastSeen) - new Date(left.lastSeen))[0]
	if (!device) {
		throw new SmsGateDeviceError(
			'sms_gateway_device_not_found',
			'Nie znaleziono skonfigurowanego urządzenia SMS Gateway.'
		)
	}

	const lastSeenAt = Date.parse(device.lastSeen)
	if (!Number.isFinite(lastSeenAt)) {
		throw new SmsGateDeviceError(
			'sms_gateway_device_status_unknown',
			'Urządzenie SMS Gateway nie zwróciło poprawnego statusu aktywności.'
		)
	}
	const deviceAgeMillis = Date.now() - lastSeenAt
	if (deviceAgeMillis < 0 || deviceAgeMillis > DEVICE_ONLINE_MAX_AGE_MS) {
		throw new SmsGateDeviceError(
			'sms_gateway_device_offline',
			'Urządzenie SMS Gateway lub Cloud Server jest offline.'
		)
	}

	const selectedSim = Array.isArray(device.simCards)
		? device.simCards.find(sim => Number(sim?.simNumber) === simNumber) || device.simCards[0]
		: null
	return {
		profile: activeProfile,
		baseUrl,
		usernameLength: username.length,
		passwordLength: password.length,
		deviceIdConfigured: Boolean(deviceId),
		deviceIdUsed: Boolean(useDeviceId && deviceId),
		simNumber,
		senderPhone: senderPhone || selectedSim?.phoneNumber || null,
		deviceName: device.name || null,
		deviceLastSeen: new Date(lastSeenAt).toISOString(),
		deviceAgeSeconds: Math.max(0, Math.floor(deviceAgeMillis / 1000)),
	}
}

async function smsGateRequest(path, { profile, method = 'GET', body } = {}) {
	const { username, password, baseUrl, profile: activeProfile } =
		smsGateCredentials(profile)

	if (!username || !password) {
		throw new Error(
			`Brak konfiguracji SMSGate dla profilu "${activeProfile}". Ustaw login i hasło w .env.`
		)
	}

	const url = new URL(path, baseUrl)
	const res = await fetch(url, {
		method,
		headers: {
			...(body ? { 'Content-Type': 'application/json' } : {}),
			Authorization: authHeader(username, password),
		},
		body: body ? JSON.stringify(body) : undefined,
		cache: 'no-store',
	})
	const json = await res.json().catch(() => null)
	if (!res.ok) {
		throw new Error(errorMessage('SMSGate request failed', res.status, json))
	}

	return { json, profile: activeProfile }
}

export async function listSmsGateWebhooks(profile) {
	const { json, profile: activeProfile } = await smsGateRequest(
		'/3rdparty/v1/webhooks',
		{ profile }
	)
	const webhooks = Array.isArray(json) ? json : json?.data || json?.items || []
	return { profile: activeProfile, webhooks }
}

export async function registerSmsGateWebhook({ profile, url, event, deviceId }) {
	const body = { url, event }
	if (deviceId) body.device_id = deviceId

	const { json, profile: activeProfile } = await smsGateRequest(
		'/3rdparty/v1/webhooks',
		{ profile, method: 'POST', body }
	)
	return { profile: activeProfile, webhook: json }
}

export async function exportSmsGateInbox({ profile, since, until, deviceId }) {
	const body = {}
	if (deviceId) body.deviceId = deviceId
	if (since) body.since = since
	if (until) body.until = until

	const { json, profile: activeProfile } = await smsGateRequest(
		'/3rdparty/v1/messages/inbox/export',
		{ profile, method: 'POST', body }
	)
	return { profile: activeProfile, data: json }
}
