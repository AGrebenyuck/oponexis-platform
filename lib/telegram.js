import { DateTime } from 'luxon'
import { db } from './prisma'
import {
	incompleteCompletionWhere,
	scheduledWorkOrderWhere,
} from './work-order-queries'
import { canonicalSourceFromAttribution } from './attribution'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const LEADS_CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID || 0) || null
const WORK_CHAT_ID = Number(process.env.TELEGRAM_WORK_CHAT_ID || 0) || null
const WORK_SCHEDULE_MESSAGE_ID =
	Number(process.env.TELEGRAM_WORK_SCHEDULE_MESSAGE_ID || 0) || null
const SMS_TRACKER_MESSAGE_ID =
	Number(process.env.TELEGRAM_SMS_TRACKER_MESSAGE_ID || 0) || null
const INCOMPLETE_COMPLETIONS_MESSAGE_ID =
	Number(process.env.TELEGRAM_INCOMPLETE_COMPLETIONS_MESSAGE_ID || 0) || null
const ALLOWED_HANDLERS = [
	Number(process.env.TELEGRAM_ADMIN_1 || 0),
	Number(process.env.TELEGRAM_ADMIN_2 || 0),
].filter(Boolean)

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://oponexis.pl'
const GOOGLE_FORM_BASE = process.env.GOOGLE_FORM_BASE || ''
const ENTRY_FULLNAME = process.env.GOOGLE_FORM_ENTRY_FULLNAME || ''
const ENTRY_PHONE = process.env.GOOGLE_FORM_ENTRY_PHONE || ''
const FORM_ENTRY_CAR = 'entry.1900237660'
const ZONE = 'Europe/Warsaw'

let dynamicScheduleMessageId = null
let dynamicSmsTrackerMessageId = null
let dynamicIncompleteCompletionsMessageId = null

function hasBot(chatId) {
	return Boolean(BOT_TOKEN && chatId)
}

function baseUrl() {
	return (
		process.env.CRM_PUBLIC_URL ||
		process.env.NEXT_PUBLIC_CRM_API_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		SITE_URL
	)
}

function html(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function htmlLink(label, url) {
	if (!url) return html(label)
	return `<a href="${html(url)}">${html(label)}</a>`
}

function nowPL() {
	return DateTime.now().setZone(ZONE)
}

async function telegram(method, payload) {
	if (!BOT_TOKEN) return null

	const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
		cache: 'no-store',
	})

	const json = await res.json().catch(() => null)
	if (!res.ok || !json?.ok) {
		throw new Error(json?.description || `Telegram ${method} failed`)
	}

	return json.result
}

async function answerCallback(callbackQueryId, text, showAlert = false) {
	if (!callbackQueryId) return null
	try {
		return await telegram('answerCallbackQuery', {
			callback_query_id: callbackQueryId,
			text,
			show_alert: showAlert,
		})
	} catch (error) {
		console.error('[telegram answerCallbackQuery] failed:', error)
		return null
	}
}

async function safeTelegram(method, payload) {
	try {
		return await telegram(method, payload)
	} catch (error) {
		const message = String(error?.message || '')
		if (message.includes('message is not modified')) return null
		throw error
	}
}

async function pinTrackerMessage(chatId, message) {
	if (!chatId || !message?.message_id) return null
	try {
		return await safeTelegram('pinChatMessage', {
			chat_id: chatId,
			message_id: message.message_id,
			disable_notification: true,
		})
	} catch (error) {
		console.error('[telegram pinChatMessage] failed:', {
			chatId,
			messageId: message?.message_id || null,
			error: error?.message || String(error),
			hint:
				'Bot needs permission to pin messages in this chat, or set tracker message IDs in env and pin manually.',
		})
		return null
	}
}

function logTrackerMessageId(kind, action, { chatId, messageId, envName }) {
	console.warn('[telegram tracker message id]', {
		kind,
		action,
		chatId,
		messageId: messageId || null,
		envName,
		envHint: messageId ? `${envName}=${messageId}` : null,
	})
}

function withMessageIdFooter(text, messageId) {
	if (!messageId) return text
	const cleaned = String(text || '').replace(/\n\n\[message ID: \d+\]/gi, '')
	return `${cleaned}\n\n[message ID: ${messageId}]`
}

async function sendTrackerMessage({ chatId, text, kind, envName, pin = false }) {
	const sent = await telegram('sendMessage', {
		chat_id: chatId,
		text,
	})
	const messageId = sent?.message_id || null
	logTrackerMessageId(kind, 'created', {
		chatId,
		messageId,
		envName,
	})

	if (messageId) {
		await safeTelegram('editMessageText', {
			chat_id: chatId,
			message_id: messageId,
			text: withMessageIdFooter(text, messageId),
		}).catch(error =>
			console.error('[telegram tracker footer edit] failed:', {
				kind,
				chatId,
				messageId,
				error: error?.message || String(error),
			})
		)
	}

	if (pin) await pinTrackerMessage(chatId, sent)
	return sent
}

async function editTrackerMessage({ chatId, messageId, text, kind, envName }) {
	const result = await safeTelegram('editMessageText', {
		chat_id: chatId,
		message_id: messageId,
		text: withMessageIdFooter(text, messageId),
	})
	logTrackerMessageId(kind, 'updated', {
		chatId,
		messageId,
		envName,
	})
	return result
}

function isAdmin(userId) {
	return ALLOWED_HANDLERS.includes(Number(userId))
}

function callbackLogMeta(callback) {
	return {
		callbackId: callback?.id || null,
		data: callback?.data || null,
		fromId: callback?.from?.id || null,
		fromUsername: callback?.from?.username || null,
		chatId: callback?.message?.chat?.id || null,
		messageId: callback?.message?.message_id || null,
	}
}

function updateLogMeta(update) {
	const callback = update?.callback_query
	const message = update?.message
	if (callback) {
		return {
			updateId: update?.update_id || null,
			type: 'callback_query',
			...callbackLogMeta(callback),
		}
	}

	if (message) {
		return {
			updateId: update?.update_id || null,
			type: 'message',
			fromId: message.from?.id || null,
			fromUsername: message.from?.username || null,
			chatId: message.chat?.id || null,
			messageId: message.message_id || null,
			textPrefix: message.text ? String(message.text).slice(0, 24) : null,
		}
	}

	return {
		updateId: update?.update_id || null,
		type: Object.keys(update || {})[0] || 'unknown',
	}
}

function parseVisitDateToDate(value) {
	if (!value) return null

	let dt
	if (value instanceof Date) {
		dt = DateTime.fromJSDate(value, { zone: ZONE })
	} else {
		const raw = String(value)
		const datePart = raw.includes('T') ? raw.split('T')[0] : raw
		dt = DateTime.fromISO(datePart, { zone: ZONE })
	}

	return dt.isValid ? dt.startOf('day').toJSDate() : null
}

function formatDateWithDay(date) {
	if (!date) return ''
	const dt =
		date instanceof Date
			? DateTime.fromJSDate(date, { zone: ZONE })
			: DateTime.fromISO(String(date), { zone: ZONE })

	return dt.isValid ? dt.setLocale('pl').toFormat('dd.LL.yyyy (ccc)') : ''
}

function formatTime(timeStr) {
	if (!timeStr) return ''
	const [h, m] = String(timeStr).split(':')
	return `${h?.padStart(2, '0') || '00'}:${m?.padStart(2, '0') || '00'}`
}

function buildTerminLine(visitDate, visitTime) {
	try {
		if (!visitDate) return visitTime ? String(visitTime) : ''

		let dt
		if (visitDate instanceof Date) {
			dt = DateTime.fromJSDate(visitDate, { zone: ZONE })
		} else {
			const raw = String(visitDate)
			dt = DateTime.fromISO(raw.includes('T') ? raw.split('T')[0] : raw, {
				zone: ZONE,
			})
		}

		if (!dt.isValid) throw new Error('Invalid date')
		dt = dt.startOf('day')

		if (visitTime) {
			const [h, m] = String(visitTime).split(':').map(Number)
			dt = dt.set({ hour: h || 0, minute: m || 0 })
			return dt.setLocale('pl').toFormat('dd.LL.yyyy (ccc), HH:mm')
		}

		return dt.setLocale('pl').toFormat('dd.LL.yyyy (ccc)')
	} catch {
		return visitTime ? `${String(visitDate)}, ${visitTime}` : String(visitDate)
	}
}

function buildMessageLink(chatId, messageId) {
	if (!chatId || !messageId) return null

	const raw = String(chatId)
	let internalId = raw
	if (raw.startsWith('-100')) internalId = raw.slice(4)
	else if (raw.startsWith('-')) internalId = raw.slice(1)

	return `https://t.me/c/${internalId}/${messageId}`
}

function normalizePhone(raw) {
	if (!raw) return null

	const trimmed = String(raw).trim()
	const hasPlus = trimmed.startsWith('+')
	const digits = trimmed.replace(/[^\d]/g, '')
	if (digits.length < 7) return null

	if (hasPlus) return `+${digits}`
	if (digits.length === 9) return `+48${digits}`
	return `+${digits}`
}

function googleFormUrl({ name, phone, carModel, regNumber }) {
	if (!GOOGLE_FORM_BASE) return null

	const params = new URLSearchParams()
	params.set('usp', 'pp_url')
	if (ENTRY_FULLNAME && name) params.set(ENTRY_FULLNAME, name)
	if (ENTRY_PHONE && phone) params.set(ENTRY_PHONE, phone)

	const carParts = []
	if (carModel) carParts.push(carModel)
	if (regNumber) carParts.push(regNumber)
	if (carParts.length) params.set(FORM_ENTRY_CAR, carParts.join(' / '))

	return `${GOOGLE_FORM_BASE}?${params.toString()}`
}

function completionFormUrl(order) {
	if (!order?.id || !baseUrl()) return null
	const url = new URL('/work-order-complete', baseUrl())
	url.searchParams.set('id', order.id)
	return url.toString()
}

function customerProfileUrl(customerId) {
	if (!customerId || !baseUrl()) return null
	const url = new URL(`/customer/${customerId}`, baseUrl())
	return url.toString()
}

function smsRedirectUrl({ leadId, name, phone, service }) {
	const smsUrl = new URL('/sms-redirect', SITE_URL)
	if (leadId) smsUrl.searchParams.set('lead', String(leadId))
	if (name) smsUrl.searchParams.set('name', name)
	if (phone) smsUrl.searchParams.set('phone', phone)
	if (service) smsUrl.searchParams.set('service', service)
	return smsUrl.toString()
}

function leadKeyboard(lead, { accepted = false, includeClose = true } = {}) {
	const service = lead.selectedNames?.length
		? lead.selectedNames.join(', ')
		: lead.serviceName || ''

	const rows = []
	if (!accepted) {
		rows.push([{ text: '✅ Przejmuję', callback_data: `accept_${lead.id}` }])
	}
	if (includeClose) {
		rows.push([
			{ text: '❌ Zamykam zgłoszenie', callback_data: `close_${lead.id}` },
		])
	}
	rows.push([
		{
			text: '📲 Wyślij SMS',
			url: smsRedirectUrl({
				leadId: lead.id,
				name: lead.name,
				phone: lead.phone,
				service,
			}),
		},
	])

	const formUrl = googleFormUrl({ name: lead.name, phone: lead.phone })
	if (formUrl) rows.push([{ text: '📝 Otwórz formularz', url: formUrl }])

	return { inline_keyboard: rows }
}

async function customerSummary({ customerId, phone }) {
	const normalizedPhone = normalizePhone(phone)
	const customer = await db.customer.findFirst({
		where: {
			OR: [
				customerId ? { id: customerId } : null,
				normalizedPhone ? { phone: normalizedPhone } : null,
				phone ? { phone: String(phone).trim() } : null,
			].filter(Boolean),
		},
		include: {
			_count: {
				select: {
					leads: true,
					workOrders: true,
					completions: true,
				},
			},
			completions: {
				where: { isTest: false, serviceUsed: { not: false } },
				orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
				take: 1,
			},
		},
	})

	if (!customer) {
		return {
			label: '🆕 Klient: nowy kontakt',
			customerId: null,
			profileUrl: null,
		}
	}

	const visits = customer._count.completions || 0
	const orders = customer._count.workOrders || 0
	const leads = customer._count.leads || 0
	const lastVisit = customer.completions?.[0]?.completedAt
		? formatDateWithDay(customer.completions[0].completedAt)
		: null
	let kind = 'nowy klient'
	if (visits > 0) kind = visits >= 2 ? 'stały klient' : 'był już u nas'
	else if (orders > 1 || leads > 1) kind = 'znany kontakt'

	const parts = [`👥 Klient: ${kind}`]
	parts.push(`zgłoszenia: ${leads}`)
	parts.push(`zlecenia: ${orders}`)
	parts.push(`wykonane: ${visits}`)
	if (lastVisit) parts.push(`ostatnio: ${lastVisit}`)

	return {
		label: parts.join(' · '),
		customerId: customer.id,
		profileUrl: customerProfileUrl(customer.id),
	}
}

function attributionFromLead(lead) {
	if (!lead?.firstTouchSource) return null
	return {
		source: lead.firstTouchSource,
		medium: lead.firstTouchMedium,
		campaign: lead.firstTouchCampaign,
		content: lead.firstTouchContent,
		term: lead.firstTouchTerm,
		referrer: lead.firstTouchReferrer,
		landingPage: lead.firstTouchLandingPage,
		gclid: lead.firstTouchGclid,
		fbclid: lead.firstTouchFbclid,
		ttclid: lead.firstTouchTtclid,
		msclkid: lead.firstTouchMsclkid,
	}
}

function leadSourceLines({ source, attribution }) {
	const detectedSource = source || (attribution ? canonicalSourceFromAttribution(attribution) : '')
	const utm = [attribution?.source, attribution?.medium, attribution?.campaign]
		.filter(Boolean)
		.join(' · ')
	return [
		`🎯 Źródło: ${html(detectedSource || 'Nieznane')}`,
		utm ? `🏷 UTM: ${html(utm)}` : null,
	].filter(Boolean)
}

function leadText({ id, name, phone, services, statusLine, customer, source, attribution }) {
	const displayName = customer?.profileUrl
		? htmlLink(name || 'Klient', customer.profileUrl)
		: html(name || '-')

	return [
		`📩 Nowa rezerwacja #${id}`,
		customer?.label || '🆕 Klient: nowy kontakt',
		'',
		`👤 Imię: ${displayName}`,
		`📞 Telefon: ${html(phone || '-')}`,
		`🔧 Usługi: ${html((services || []).filter(Boolean).join(', ') || '-')}`,
		...leadSourceLines({ source, attribution }),
		'',
		statusLine || '📌 Status: ⏳ Oczekuje na przyjęcie',
	].join('\n')
}

function workOrderKeyboard(order) {
	const rows = []

	if (order.id) {
		rows.push([
			{
				text: '❌ Anuluj zlecenie',
				callback_data: `cancel_order_${order.id}`,
			},
		])
	}

	const editRow = []
	if (order.id && baseUrl()) {
		const editUrl = new URL('/admin/work-order', baseUrl())
		editUrl.searchParams.set('id', order.id)
		editRow.push({ text: '✏️ Edytuj zlecenie', url: editUrl.toString() })
	}

	const formUrl = completionFormUrl(order)
	if (formUrl) editRow.push({ text: '📝 Otwórz formularz', url: formUrl })
	if (editRow.length) rows.push(editRow)

	return rows.length ? { inline_keyboard: rows } : undefined
}

function workOrderText(order, extra = {}, title = '🔧 Nowe dane od klienta') {
	const effectiveVisitDate = order.visitDate || extra.visitDate || null
	const effectiveVisitTime = order.visitTime || extra.visitTime || null
	const lines = [title, '']

	if (effectiveVisitDate || effectiveVisitTime) {
		const terminLine = buildTerminLine(effectiveVisitDate, effectiveVisitTime)
		if (terminLine) {
			lines.push(`📅 TERMIN: ${terminLine}`)
			lines.push('')
		}
	}

	if (extra.customer?.label) lines.push(extra.customer.label)
	if (order.name) {
		lines.push(
			`👤 Imię: ${
				extra.customer?.profileUrl
					? htmlLink(order.name, extra.customer.profileUrl)
					: html(order.name)
			}`
		)
	}
	if (order.phone) lines.push(`📞 Telefon: ${html(order.phone)}`)
	if (order.service) lines.push(`🔧 Usługa: ${html(order.service)}`)
	if (order.regNumber) lines.push(`🚘 Rejestracja: ${html(order.regNumber)}`)
	if (order.carModel) lines.push(`🚗 Model: ${html(order.carModel)}`)
	if (order.color) lines.push(`🎨 Kolor: ${html(order.color)}`)
	if (order.wheelRimSize) lines.push(`🛞 Felga: ${html(order.wheelRimSize)}`)
	if (order.tireSize) lines.push(`📏 Rozmiar opony: ${html(order.tireSize)}`)
	if (order.address) lines.push(`📍 Adres: ${html(order.address)}`)

	let mapsUrl = ''
	if (order.lat != null && order.lng != null) {
		mapsUrl = `https://www.google.com/maps?q=${order.lat},${order.lng}`
	} else if (order.address) {
		mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
			order.address
		)}`
	}
	if (mapsUrl) lines.push(`🗺 Google Maps: ${html(mapsUrl)}`)
	if (order.leadId) lines.push(`🆔 ID zgłoszenia: ${html(order.leadId)}`)

	if (order.wantsInvoice) {
		lines.push('')
		lines.push('💼 Faktura: TAK')
		if (order.invoiceNip) lines.push(`   • NIP: ${html(order.invoiceNip)}`)
		if (order.invoiceEmail) lines.push(`   • E-mail: ${html(order.invoiceEmail)}`)
	}

	if (order.notes) {
		lines.push('')
		lines.push(`📝 Uwagi: ${html(order.notes)}`)
	}

	return lines.join('\n')
}

function timeToMinutes(timeStr) {
	if (!timeStr) return 99999
	const [h, m] = String(timeStr).split(':')
	const hh = parseInt(h, 10)
	const mm = parseInt(m || '0', 10)
	if (Number.isNaN(hh) || Number.isNaN(mm)) return 99999
	return hh * 60 + mm
}

function sortOrders(a, b) {
	const da = a.visitDate
		? DateTime.fromJSDate(a.visitDate, { zone: ZONE }).startOf('day')
		: null
	const dbt = b.visitDate
		? DateTime.fromJSDate(b.visitDate, { zone: ZONE }).startOf('day')
		: null

	if (da && dbt) {
		const diff = da.toMillis() - dbt.toMillis()
		if (diff !== 0) return diff
	}

	const ta = timeToMinutes(a.visitTime)
	const tb = timeToMinutes(b.visitTime)
	if (ta !== tb) return ta - tb
	return a.id - b.id
}

export async function sendLeadToTelegram({ id, name, phone, services = [], source, attribution }) {
	if (!hasBot(LEADS_CHAT_ID)) return null
	const customer = await customerSummary({ phone })

	const lead = {
		id,
		name,
		phone,
		selectedNames: services,
		serviceName: services?.[0] || '',
	}

	const text = leadText({ id, name, phone, services, customer, source, attribution })
	const sent = await telegram('sendMessage', {
		chat_id: LEADS_CHAT_ID,
		text,
		parse_mode: 'HTML',
		disable_web_page_preview: true,
		reply_markup: leadKeyboard(lead),
	})

	if (sent?.message_id) {
		await safeTelegram('editMessageText', {
			chat_id: LEADS_CHAT_ID,
			message_id: sent.message_id,
			text: withMessageIdFooter(text, sent.message_id),
			parse_mode: 'HTML',
			disable_web_page_preview: true,
			reply_markup: leadKeyboard(lead),
		}).catch(error =>
			console.error('[sendLeadToTelegram footer edit] failed:', {
				messageId: sent.message_id,
				error: error?.message || String(error),
			})
		)
	}

	return sent
}

export async function notifyExpiredSmsForm(log) {
	if (!hasBot(LEADS_CHAT_ID) || !log) return null
	const lines = [
		'⌛ <b>Formularz nie został uzupełniony w ciągu 2 godzin</b>',
		'',
		`Klient: <b>${html(log.name || 'Nieznany')}</b>`,
		`Telefon: <code>${html(log.phone)}</code>`,
		log.visitDate
			? `Termin: ${html(formatDate(log.visitDate))}${log.visitTime ? `, ${html(formatTime(log.visitTime))}` : ''}`
			: null,
		'',
		'Wstępna rezerwacja wygasła. Prosimy zadzwonić do klienta, jeśli kontakt nadal jest aktualny.',
	].filter(Boolean)

	return safeTelegram('sendMessage', {
		chat_id: LEADS_CHAT_ID,
		text: lines.join('\n'),
		parse_mode: 'HTML',
		disable_web_page_preview: true,
	})
}

export async function sendWorkOrderToTelegram(order, extra = {}) {
	if (!hasBot(WORK_CHAT_ID)) return null
	const customer = await customerSummary({
		customerId: order.customerId,
		phone: order.phone,
	})

	const text = workOrderText(order, { ...extra, customer })
	const sent = await telegram('sendMessage', {
		chat_id: WORK_CHAT_ID,
		text,
		parse_mode: 'HTML',
		disable_web_page_preview: true,
		reply_markup: workOrderKeyboard(order),
	})

	if (sent?.message_id) {
		await safeTelegram('editMessageText', {
			chat_id: WORK_CHAT_ID,
			message_id: sent.message_id,
			text: withMessageIdFooter(text, sent.message_id),
			parse_mode: 'HTML',
			disable_web_page_preview: true,
			reply_markup: workOrderKeyboard(order),
		}).catch(error =>
			console.error('[sendWorkOrderToTelegram footer edit] failed:', {
				messageId: sent.message_id,
				workOrderId: order.id || null,
				error: error?.message || String(error),
			})
		)
	}

	if (sent?.message_id && order.id) {
		await db.workOrder.update({
			where: { id: order.id },
			data: { telegramMessageId: sent.message_id },
		})
	}

	return sent
}

export async function updateWorkOrderMessage(order) {
	if (!hasBot(WORK_CHAT_ID) || !order?.telegramMessageId) return null
	const customer = await customerSummary({
		customerId: order.customerId,
		phone: order.phone,
	})

	return safeTelegram('editMessageText', {
		chat_id: WORK_CHAT_ID,
		message_id: order.telegramMessageId,
		text: withMessageIdFooter(
			workOrderText(order, { customer }, 'Dane klienta (zaktualizowane)'),
			order.telegramMessageId
		),
		parse_mode: 'HTML',
		disable_web_page_preview: true,
		reply_markup: workOrderKeyboard(order),
	})
}

export async function updateScheduleMessage() {
	if (!hasBot(WORK_CHAT_ID)) return null

	let text = ''
	try {
		const todayDate = nowPL().startOf('day').toJSDate()
		const orders = await db.workOrder.findMany({
			where: scheduledWorkOrderWhere(todayDate),
			orderBy: [{ visitDate: 'asc' }, { visitTime: 'asc' }, { id: 'asc' }],
		})

		orders.sort(sortOrders)
		console.warn('[updateScheduleMessage] orders selected', {
			count: orders.length,
			today: nowPL().startOf('day').toISODate(),
			firstIds: orders.slice(0, 10).map(order => ({
				id: order.id,
				date: order.visitDate
					? DateTime.fromJSDate(order.visitDate, { zone: ZONE }).toISODate()
					: null,
				time: order.visitTime || null,
				status: order.status || null,
			})),
		})

		if (!orders.length) {
			text = '📅 Aktualny grafik wizyt\n\nNa razie brak zaplanowanych wizyt.'
		} else {
			const byDate = new Map()
			for (const order of orders) {
				if (!order.visitDate) continue
				const key = DateTime.fromJSDate(order.visitDate, {
					zone: ZONE,
				})
					.startOf('day')
					.toISODate()
				if (!byDate.has(key)) byDate.set(key, [])
				byDate.get(key).push(order)
			}

			const lines = ['📅 Aktualny grafik wizyt', '']
			Array.from(byDate.keys())
				.sort()
				.forEach((key, index) => {
					const group = byDate.get(key) || []
					if (index > 0) lines.push('', '--------------------', '')
					lines.push(`📆 ${formatDateWithDay(DateTime.fromISO(key).toJSDate())}`)
					lines.push('')

					for (const order of group) {
						const baseLine = `${formatTime(order.visitTime) || '??:??'} – ${
							order.service || 'Brak nazwy uslugi'
						}`
						const link =
							order.telegramMessageId &&
							buildMessageLink(WORK_CHAT_ID, order.telegramMessageId)

						lines.push(baseLine)
						if (link) lines.push(`↪️ Karta: ${link}`)
						lines.push('')
					}
				})

			text = lines.join('\n')
		}
	} catch (error) {
		console.error('[updateScheduleMessage] build failed:', error)
		text =
			'📅 Aktualny grafik wizyt\n\n⚠️ Błąd przy generowaniu grafiku. Sprawdź logi serwera.'
	}

	const targetMessageId = dynamicScheduleMessageId || WORK_SCHEDULE_MESSAGE_ID
	if (!targetMessageId) {
		const sent = await sendTrackerMessage({
			chatId: WORK_CHAT_ID,
			text,
			kind: 'schedule',
			envName: 'TELEGRAM_WORK_SCHEDULE_MESSAGE_ID',
		})
		dynamicScheduleMessageId = sent?.message_id || null
		return sent
	}

	try {
		return await editTrackerMessage({
			chatId: WORK_CHAT_ID,
			messageId: targetMessageId,
			text,
			kind: 'schedule',
			envName: 'TELEGRAM_WORK_SCHEDULE_MESSAGE_ID',
		})
	} catch (error) {
		console.error('[updateScheduleMessage] edit failed:', error)
		const sent = await sendTrackerMessage({
			chatId: WORK_CHAT_ID,
			text,
			kind: 'schedule',
			envName: 'TELEGRAM_WORK_SCHEDULE_MESSAGE_ID',
		})
		dynamicScheduleMessageId = sent?.message_id || null
		logTrackerMessageId('schedule', 'recreated_after_edit_error', {
			chatId: WORK_CHAT_ID,
			messageId: sent?.message_id,
			envName: 'TELEGRAM_WORK_SCHEDULE_MESSAGE_ID',
		})
		return sent
	}
}

export async function updateIncompleteCompletionMessage() {
	if (!hasBot(WORK_CHAT_ID)) return null

	let text = ''
	try {
		const orders = await db.workOrder.findMany({
			where: incompleteCompletionWhere(),
			orderBy: [{ visitDate: 'asc' }, { visitTime: 'asc' }, { id: 'asc' }],
			take: 30,
		})

		orders.sort(sortOrders)
		console.warn('[updateIncompleteCompletionMessage] orders selected', {
			count: orders.length,
			scope: 'all scheduled orders without completion forms',
			firstIds: orders.slice(0, 10).map(order => ({
				id: order.id,
				date: order.visitDate
					? DateTime.fromJSDate(order.visitDate, { zone: ZONE }).toISODate()
					: null,
				time: order.visitTime || null,
				status: order.status || null,
			})),
		})

		if (!orders.length) {
			text =
				'🧾 Formularze wykonania\n\n✅ Wszystko uzupełnione. Brak formularzy do uzupełnienia.'
		} else {
			const lines = [
				'🧾 Formularze wykonania – do uzupełnienia',
				'',
				`⏳ Oczekuje: ${orders.length}`,
				'',
			]

			for (const order of orders) {
				const term = buildTerminLine(order.visitDate, order.visitTime) || 'bez terminu'
				const link =
					order.telegramMessageId &&
					buildMessageLink(WORK_CHAT_ID, order.telegramMessageId)
				const parts = [
					`#${order.id}`,
					term,
					order.name || 'Brak imienia',
					order.phone || 'Brak telefonu',
				]
				lines.push(parts.join(' – '))
				if (order.service) lines.push(`   ${order.service}`)
				if (order.wantsInvoice) lines.push('   ⚠️ FAKTURA DO WYSTAWIENIA')
				if (link) lines.push(`   Karta: ${link}`)
				lines.push('')
			}

			text = lines.join('\n').trim()
		}
	} catch (error) {
		console.error('[updateIncompleteCompletionMessage] build failed:', error)
		text =
			'🧾 Formularze wykonania\n\n⚠️ Błąd przy generowaniu listy. Sprawdź logi serwera.'
	}

	const targetMessageId =
		dynamicIncompleteCompletionsMessageId || INCOMPLETE_COMPLETIONS_MESSAGE_ID
	if (!targetMessageId) {
		const sent = await sendTrackerMessage({
			chatId: WORK_CHAT_ID,
			text,
			kind: 'incomplete_completions',
			envName: 'TELEGRAM_INCOMPLETE_COMPLETIONS_MESSAGE_ID',
			pin: true,
		})
		dynamicIncompleteCompletionsMessageId = sent?.message_id || null
		return sent
	}

	try {
		return await editTrackerMessage({
			chatId: WORK_CHAT_ID,
			messageId: targetMessageId,
			text,
			kind: 'incomplete_completions',
			envName: 'TELEGRAM_INCOMPLETE_COMPLETIONS_MESSAGE_ID',
		})
	} catch (error) {
		console.error('[updateIncompleteCompletionMessage] edit failed:', error)
		const sent = await sendTrackerMessage({
			chatId: WORK_CHAT_ID,
			text,
			kind: 'incomplete_completions',
			envName: 'TELEGRAM_INCOMPLETE_COMPLETIONS_MESSAGE_ID',
			pin: true,
		})
		dynamicIncompleteCompletionsMessageId = sent?.message_id || null
		logTrackerMessageId('incomplete_completions', 'recreated_after_edit_error', {
			chatId: WORK_CHAT_ID,
			messageId: sent?.message_id,
			envName: 'TELEGRAM_INCOMPLETE_COMPLETIONS_MESSAGE_ID',
		})
		return sent
	}
}

export async function updateSmsTrackerMessage() {
	if (!hasBot(LEADS_CHAT_ID)) return null

	const todayDate = nowPL().startOf('day').toJSDate()
	const logs = await db.smsFormLog.findMany({
		where: {
			status: { not: 'deleted' },
			OR: [
				{ visitDate: { gte: todayDate } },
				{ AND: [{ visitDate: null }, { sentAt: { gte: todayDate } }] },
			],
		},
		orderBy: [{ visitDate: 'asc' }, { sentAt: 'asc' }, { id: 'asc' }],
	})

	let text = ''
	if (!logs.length) {
		text =
			'📲 SMS z formularzem\n\nNa razie brak wysłanych SMS z formularzem.'
	} else {
		const byDate = new Map()
		for (const log of logs) {
			const baseDate = log.visitDate || log.sentAt
			if (!baseDate) continue
			const key = DateTime.fromJSDate(baseDate, { zone: ZONE })
				.startOf('day')
				.toISODate()
			if (!byDate.has(key)) byDate.set(key, [])
			byDate.get(key).push(log)
		}

		const lines = ['📲 SMS z formularzem – od dziś i później', '']
		Array.from(byDate.keys())
			.sort()
			.forEach((key, index) => {
				const group = byDate.get(key) || []
				const pending = group.filter(row => ['pending', 'reminded'].includes(row.status)).length
				if (index > 0) lines.push('', '--------------------', '')
				lines.push(
					`📆 ${formatDateWithDay(DateTime.fromISO(key).toJSDate())} – wysłane: ${
						group.length
					}${pending ? ` (⏳ oczekuje: ${pending})` : ''}`
				)
				lines.push('')

				for (const log of group) {
					const sentAt = DateTime.fromJSDate(log.sentAt, {
						zone: ZONE,
					}).toFormat('HH:mm')
					const parts = [`#${log.id}`, sentAt, log.phone]
					if (log.name) parts.push(log.name)
					if (log.templateKey?.endsWith('_new')) parts.push('🆕 nowy klient')
					if (log.templateKey?.endsWith('_known')) parts.push('↻ stały klient')
					if (log.visitTime) parts.push(`🕒 ${formatTime(log.visitTime)}`)
					const statusIcon = {
						done: '✅',
						reminded: '🔔',
						expired: '⌛',
						failed: '❌',
					}[log.status] || '⏳'
					parts.push(statusIcon)
					lines.push(parts.join(' – '))
				}
			})

		text = lines.join('\n')
	}

	const targetMessageId = dynamicSmsTrackerMessageId || SMS_TRACKER_MESSAGE_ID
	if (!targetMessageId) {
		const sent = await sendTrackerMessage({
			chatId: LEADS_CHAT_ID,
			text,
			kind: 'sms_forms',
			envName: 'TELEGRAM_SMS_TRACKER_MESSAGE_ID',
		})
		dynamicSmsTrackerMessageId = sent?.message_id || null
		return sent
	}

	try {
		return await editTrackerMessage({
			chatId: LEADS_CHAT_ID,
			messageId: targetMessageId,
			text,
			kind: 'sms_forms',
			envName: 'TELEGRAM_SMS_TRACKER_MESSAGE_ID',
		})
	} catch (error) {
		console.error('[updateSmsTrackerMessage] edit failed:', error)
		const sent = await sendTrackerMessage({
			chatId: LEADS_CHAT_ID,
			text,
			kind: 'sms_forms',
			envName: 'TELEGRAM_SMS_TRACKER_MESSAGE_ID',
		})
		dynamicSmsTrackerMessageId = sent?.message_id || null
		logTrackerMessageId('sms_forms', 'recreated_after_edit_error', {
			chatId: LEADS_CHAT_ID,
			messageId: sent?.message_id,
			envName: 'TELEGRAM_SMS_TRACKER_MESSAGE_ID',
		})
		return sent
	}
}

export async function logSmsFormSent({
	phone,
	name,
	service,
	leadId,
	source,
	visitDate,
	visitTime,
}) {
	if (!phone) return null

	const entry = await db.smsFormLog.create({
		data: {
			phone,
			name: name || null,
			service: service || null,
			leadId: leadId ? String(leadId) : null,
			source: source || null,
			status: 'pending',
			sentAt: nowPL().toJSDate(),
			visitDate: parseVisitDateToDate(visitDate),
			visitTime: visitTime || null,
		},
	})

	await updateSmsTrackerMessage().catch(error =>
		console.error('[logSmsFormSent] tracker failed:', error)
	)

	return entry
}

export async function markSmsFormCompletedByLead(leadId) {
	if (!leadId) return null

	const updated = await db.smsFormLog.updateMany({
		where: {
			leadId: String(leadId),
			status: { in: ['pending', 'reminded', 'sending'] },
		},
		data: {
			status: 'done',
			completedAt: nowPL().toJSDate(),
		},
	})

	if (updated.count > 0) {
		await updateSmsTrackerMessage().catch(error =>
			console.error('[markSmsFormCompletedByLead] tracker failed:', error)
		)
	}

	return updated
}

export async function markSmsFormCompletedById(smsFormLogId, publicToken) {
	if (!smsFormLogId || !publicToken) return null
	const id = Number(smsFormLogId)
	if (!Number.isInteger(id) || id <= 0) return null

	const updated = await db.smsFormLog.updateMany({
		where: {
			id,
			publicToken: String(publicToken),
			status: { in: ['pending', 'reminded', 'sending'] },
		},
		data: {
			status: 'done',
			completedAt: nowPL().toJSDate(),
		},
	})

	if (updated.count > 0) {
		await updateSmsTrackerMessage().catch(error =>
			console.error('[markSmsFormCompletedById] tracker failed:', error)
		)
	}

	return updated
}

export async function markSmsFormCompletedByPhone(
	phone,
	{ visitDate, visitTime } = {}
) {
	if (!phone) return null

	const visitDateObj = parseVisitDateToDate(visitDate)
	const updated = await db.smsFormLog.updateMany({
		where: {
			phone,
			status: { in: ['pending', 'reminded', 'sending'] },
			...(visitDateObj ? { visitDate: visitDateObj } : {}),
			...(visitTime ? { visitTime } : {}),
		},
		data: {
			status: 'done',
			completedAt: nowPL().toJSDate(),
		},
	})

	if (updated.count > 0) {
		await updateSmsTrackerMessage().catch(error =>
			console.error('[markSmsFormCompletedByPhone] tracker failed:', error)
		)
	}

	return updated
}

async function editCallbackMessage(callback, text, replyMarkup, options = {}) {
	const message = callback?.message
	if (!message?.chat?.id || !message?.message_id) return null

	return safeTelegram('editMessageText', {
		chat_id: message.chat.id,
		message_id: message.message_id,
		text: withMessageIdFooter(text, message.message_id),
		reply_markup: replyMarkup,
		...options,
	})
}

async function handleAcceptLead(callback) {
	const user = callback.from || {}
	const id = callback.data.replace('accept_', '')
	console.info('[telegram callback accept] start', {
		...callbackLogMeta(callback),
		leadId: id,
	})
	if (!isAdmin(user.id)) {
		console.warn('[telegram callback accept] denied: user is not admin', {
			...callbackLogMeta(callback),
			leadId: id,
		})
		await answerCallback(callback.id, 'Brak uprawnień', true)
		return
	}

	const lead = await db.lead.update({
		where: { id },
		data: { status: 'accepted' },
	})
	const services = lead.selectedNames?.length
		? lead.selectedNames
		: [lead.serviceName].filter(Boolean)
	const time = nowPL().toFormat('HH:mm')
	const who = user.username || user.first_name || user.id
	const customer = await customerSummary({
		customerId: lead.customerId,
		phone: lead.phone,
	})

	await editCallbackMessage(
		callback,
		leadText({
			id: lead.id,
			name: lead.name,
			phone: lead.phone,
			services,
			customer,
			source: canonicalSourceFromAttribution(attributionFromLead(lead)),
			attribution: attributionFromLead(lead),
			statusLine: `📌 Status: ✅ Przejęte przez @${html(who)}\n⏱ ${time}`,
		}),
		leadKeyboard(lead, { accepted: true, includeClose: false }),
		{ parse_mode: 'HTML', disable_web_page_preview: true }
	)
	await answerCallback(callback.id, 'Przejęte ✓')
	console.info('[telegram callback accept] success', {
		...callbackLogMeta(callback),
		leadId: lead.id,
		status: lead.status,
	})
}

async function handleCloseLead(callback) {
	const user = callback.from || {}
	const id = callback.data.replace('close_', '')
	console.info('[telegram callback close] start', {
		...callbackLogMeta(callback),
		leadId: id,
	})
	if (!isAdmin(user.id)) {
		console.warn('[telegram callback close] denied: user is not admin', {
			...callbackLogMeta(callback),
			leadId: id,
		})
		await answerCallback(callback.id, 'Brak uprawnień', true)
		return
	}

	const lead = await db.lead.update({
		where: { id },
		data: { status: 'closed' },
	})
	const services = lead.selectedNames?.length
		? lead.selectedNames
		: [lead.serviceName].filter(Boolean)
	const time = nowPL().toFormat('HH:mm')
	const who = user.username || user.first_name || user.id
	const customer = await customerSummary({
		customerId: lead.customerId,
		phone: lead.phone,
	})

	await editCallbackMessage(
		callback,
		leadText({
			id: lead.id,
			name: lead.name,
			phone: lead.phone,
			services,
			customer,
			source: canonicalSourceFromAttribution(attributionFromLead(lead)),
			attribution: attributionFromLead(lead),
			statusLine: `📌 Status: ❌ Zamknięte przez @${html(who)}\n⏱ ${time}`,
		}),
		leadKeyboard(lead, { accepted: true, includeClose: false }),
		{ parse_mode: 'HTML', disable_web_page_preview: true }
	)
	await answerCallback(callback.id, 'Zamknięte ✓')
	console.info('[telegram callback close] success', {
		...callbackLogMeta(callback),
		leadId: lead.id,
		status: lead.status,
	})
}

async function handleCancelOrder(callback) {
	const user = callback.from || {}
	const id = Number(callback.data.replace('cancel_order_', ''))
	console.info('[telegram callback cancel_order] start', {
		...callbackLogMeta(callback),
		workOrderId: id || null,
	})
	if (!isAdmin(user.id)) {
		console.warn('[telegram callback cancel_order] denied: user is not admin', {
			...callbackLogMeta(callback),
			workOrderId: id || null,
		})
		await answerCallback(callback.id, 'Brak uprawnień', true)
		return
	}

	if (!id) {
		console.warn('[telegram callback cancel_order] invalid id', callbackLogMeta(callback))
		await answerCallback(callback.id, 'Niepoprawne ID', true)
		return
	}

	await db.workOrder.update({
		where: { id },
		data: {
			visitDate: null,
			visitTime: null,
			status: 'cancelled',
		},
	})
	await db.workOrderCompletion.updateMany({
		where: { workOrderId: id },
		data: { serviceUsed: false },
	})

	const message = callback.message
	const who = user.username || user.first_name || user.id
	const text = `${message?.text || ''}\n\nStatus: ❌ Anulowane przez @${who}`
	await editCallbackMessage(callback, text, undefined)
	await updateScheduleMessage()
	await updateIncompleteCompletionMessage()
	await answerCallback(callback.id, 'Zlecenie anulowane ✓')
	console.info('[telegram callback cancel_order] success', {
		...callbackLogMeta(callback),
		workOrderId: id,
	})
}

async function reply(chatId, text, options = {}) {
	if (!chatId) return null
	return telegram('sendMessage', {
		chat_id: chatId,
		text,
		...options,
	})
}

async function handleSmsCommand(message) {
	if (!isAdmin(message.from?.id)) return
	if (message.chat?.type !== 'private') return

	const text = message.text || ''
	const rawInput = text.startsWith('/sms') ? text.split(/\s+/).slice(1).join(' ') : text
	const phone = normalizePhone(rawInput)
	if (!phone) {
		await reply(message.chat.id, 'Podaj poprawny numer telefonu, np. +48 123 456 789')
		return
	}

	await reply(message.chat.id, 'Kliknij przycisk ponizej, aby otworzyc SMS.', {
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: 'Wyslij SMS',
						url: smsRedirectUrl({ phone }),
					},
				],
			],
		},
	})
}

async function handleSmsDeleteCommand(message) {
	if (!isAdmin(message.from?.id)) return

	const id = Number((message.text || '').split(/\s+/)[1])
	if (!id) {
		await reply(message.chat.id, 'Uzycie: /smsdel <id>, np. /smsdel 12')
		return
	}

	const result = await db.smsFormLog.updateMany({
		where: { id, status: { not: 'deleted' } },
		data: { status: 'deleted' },
	})

	await reply(
		message.chat.id,
		result.count
			? `Log SMS #${id} zostal oznaczony jako usuniety.`
			: `Brak logu z ID #${id} albo juz jest usuniety.`
	)
	await updateSmsTrackerMessage()
}

async function handleDebugCommand(message) {
	if (!isAdmin(message.from?.id)) return

	const lastLogs = await db.smsFormLog.findMany({
		orderBy: { id: 'desc' },
		take: 5,
	})

	const lines = [
		'DEBUG BOT',
		'',
		`User: ${message.from?.username || message.from?.first_name || 'unknown'} (${
			message.from?.id
		})`,
		`Chat: ${message.chat?.title || message.chat?.username || '(brak)'} (${
			message.chat?.type
		}, ${message.chat?.id})`,
		`GROUP_CHAT_ID: ${LEADS_CHAT_ID}`,
		`WORK_CHAT_ID: ${WORK_CHAT_ID}`,
		`WORK_SCHEDULE_MESSAGE_ID: ${WORK_SCHEDULE_MESSAGE_ID}`,
		`SMS_TRACKER_MESSAGE_ID: ${SMS_TRACKER_MESSAGE_ID}`,
		'',
		'Ostatnie SMS logs:',
	]

	if (!lastLogs.length) {
		lines.push('brak')
	} else {
		for (const log of lastLogs) {
			const sentAt = DateTime.fromJSDate(log.sentAt, { zone: ZONE }).toFormat(
				'dd.LL HH:mm'
			)
			lines.push(`#${log.id} - ${sentAt} - ${log.phone} - ${log.status}`)
		}
	}

	await reply(message.chat.id, lines.join('\n'), {
		reply_to_message_id: message.message_id,
	})
}

async function handleRawDebugCommand(message, update) {
	if (!isAdmin(message.from?.id)) return

	const target = message.reply_to_message || update
	const payload = JSON.stringify(target, null, 2)
	await reply(
		message.chat.id,
		payload.length > 3500 ? `${payload.slice(0, 3500)}\n...` : payload,
		{ reply_to_message_id: message.message_id }
	)
}

export async function handleTelegramUpdate(update) {
	console.info('[telegram update] received', updateLogMeta(update))
	const callback = update?.callback_query
	try {
		if (callback?.data?.startsWith('accept_')) return handleAcceptLead(callback)
		if (callback?.data?.startsWith('close_')) return handleCloseLead(callback)
		if (callback?.data?.startsWith('cancel_order_')) return handleCancelOrder(callback)
		if (callback) {
			console.warn('[telegram callback] unsupported data', callbackLogMeta(callback))
			await answerCallback(callback.id, 'Nieznana akcja przycisku', true)
			return null
		}
	} catch (error) {
		console.error('[handleTelegramUpdate callback] failed:', {
			...callbackLogMeta(callback),
			error: error?.message || String(error),
			stack: error?.stack || null,
		})
		if (callback?.id) {
			await answerCallback(callback.id, 'Błąd przy obsłudze przycisku', true)
		}
		return null
	}

	const message = update?.message
	const text = message?.text?.trim() || ''
	if (!message || !text) {
		console.info('[telegram update] ignored: no text message', updateLogMeta(update))
		return null
	}

	if (text.startsWith('/smsdel')) return handleSmsDeleteCommand(message)
	if (text.startsWith('/debug')) return handleDebugCommand(message)
	if (text.startsWith('/rawdebug')) return handleRawDebugCommand(message, update)
	if (text.startsWith('/sms')) return handleSmsCommand(message)
	if (!text.startsWith('/')) return handleSmsCommand(message)

	return null
}
