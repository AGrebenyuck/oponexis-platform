const STATUS_LABELS = {
	new: 'Nowe',
	accepted: 'Przyjęte',
	closed: 'Zamknięte',
	completed: 'Wykonane',
	cancelled: 'Anulowane',
	deleted: 'Usunięte',
}

import { canonicalSourceFromAttribution } from '@/lib/attribution'

export function formatMoney(value) {
	return `${Math.round(Number(value || 0)).toLocaleString('pl-PL')} zł`
}

export function formatDate(value) {
	if (!value) return '-'
	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'Europe/Warsaw',
	}).format(new Date(value))
}

export function formatDateTime(value, time) {
	if (!value) return time || '-'
	const date = formatDate(value)
	return time ? `${date}, ${String(time).slice(0, 5)}` : date
}

export function totalSpent(completions = []) {
	return completions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
}

function cleanList(values) {
	return values.filter(Boolean).map(value => String(value).trim()).filter(Boolean)
}

function serviceTextFromLead(lead) {
	return cleanList(
		lead.selectedNames?.length ? lead.selectedNames : [lead.serviceName]
	).join(', ')
}

function attributionFromLead(lead) {
	if (!lead.firstTouchSource) return null
	return {
		source: lead.firstTouchSource,
		medium: lead.firstTouchMedium,
		campaign: lead.firstTouchCampaign,
		content: lead.firstTouchContent,
		term: lead.firstTouchTerm,
		gclid: lead.firstTouchGclid,
		fbclid: lead.firstTouchFbclid,
		ttclid: lead.firstTouchTtclid,
		msclkid: lead.firstTouchMsclkid,
	}
}

function carText(order) {
	return cleanList([order.carModel, order.regNumber]).join(' / ')
}

function timestamp(value) {
	const date = value ? new Date(value) : null
	const time = date?.getTime()
	return Number.isFinite(time) ? time : 0
}

export function buildCustomerTimeline(customer) {
	const events = []

	for (const lead of customer.leads || []) {
		const attribution = attributionFromLead(lead)
		const source = attribution ? canonicalSourceFromAttribution(attribution) : null
		events.push({
			id: `lead-${lead.id}`,
			type: 'lead',
			at: lead.createdAt,
			title: 'Zgłoszenie ze strony',
			status: STATUS_LABELS[lead.status] || lead.status || 'Nowe',
			primary: serviceTextFromLead(lead) || 'Brak usługi',
			meta: cleanList([
				source ? `Źródło: ${source}` : null,
				lead.partnerCode ? `Partner: ${lead.partnerCode}` : null,
				lead.monthKey ? `Miesiąc: ${lead.monthKey}` : null,
				lead.ua ? 'Dane z formularza strony' : null,
			]),
			details: cleanList([
				attribution?.source ? `UTM source: ${attribution.source}` : null,
				attribution?.medium ? `UTM medium: ${attribution.medium}` : null,
				attribution?.campaign ? `UTM campaign: ${attribution.campaign}` : null,
				attribution?.content ? `UTM content: ${attribution.content}` : null,
				attribution?.term ? `UTM term: ${attribution.term}` : null,
				attribution?.gclid ? `Google Click ID: ${attribution.gclid}` : null,
				attribution?.fbclid ? `Meta Click ID: ${attribution.fbclid}` : null,
				attribution?.ttclid ? `TikTok Click ID: ${attribution.ttclid}` : null,
				attribution?.msclkid ? `Microsoft Click ID: ${attribution.msclkid}` : null,
				lead.ip ? `IP: ${lead.ip}` : null,
			]),
		})
	}

	for (const order of customer.workOrders || []) {
		events.push({
			id: `work-${order.id}`,
			type: 'workOrder',
			at: order.visitDate || order.createdAt,
			createdAt: order.createdAt,
			workOrderId: order.id,
			title:
				order.status === 'cancelled'
					? 'Zlecenie anulowane'
					: 'Rezerwacja / zlecenie',
			status: STATUS_LABELS[order.status] || order.status || 'Nowe',
			primary: order.service || 'Brak usługi',
			meta: cleanList([
				`Termin: ${formatDateTime(order.visitDate, order.visitTime)}`,
				order.address ? `Adres: ${order.address}` : null,
				carText(order) ? `Auto: ${carText(order)}` : null,
			]),
			details: cleanList([
				order.color ? `Kolor: ${order.color}` : null,
				order.wheelRimSize ? `Felga: ${order.wheelRimSize}` : null,
				order.tireSize ? `Opona: ${order.tireSize}` : null,
				order.notes ? `Uwagi: ${order.notes}` : null,
			]),
		})
	}

	for (const completion of customer.completions || []) {
		events.push({
			id: `completion-${completion.id}`,
			type: 'completion',
			at: completion.completedAt || completion.formSubmittedAt || completion.createdAt,
			workOrderId: completion.workOrderId,
			title: 'Wykonane zlecenie',
			status: completion.serviceUsed === false ? 'Nie skorzystał' : 'Wykonane',
			primary: completion.serviceNames?.join(', ') || 'Usługa',
			amount: completion.amount,
			meta: cleanList([
				`Data: ${formatDate(completion.completedAt || completion.createdAt)}`,
				completion.car ? `Auto: ${completion.car}` : null,
				completion.source ? `Źródło: ${completion.source}` : null,
			]),
			details: cleanList([
				completion.paymentMethod ? `Płatność: ${completion.paymentMethod}` : null,
				completion.invoiceIssued == null
					? null
					: `Faktura/paragon: ${completion.invoiceIssued ? 'tak' : 'nie'}`,
				completion.notes ? `Notatka: ${completion.notes}` : null,
			]),
		})
	}

	for (const smsEvent of customer.smsContactEvents || []) {
		const isIncoming = smsEvent.direction === 'IN'
		const isOutgoing = smsEvent.direction === 'OUT'
		events.push({
			id: `sms-${smsEvent.id}`,
			type: 'sms',
			at: smsEvent.occurredAt || smsEvent.createdAt,
			title: isIncoming
				? 'Odpowiedź SMS klienta'
				: isOutgoing
					? 'SMS wysłany'
					: 'Kontakt / notatka',
			status: smsEvent.type,
			primary: smsEvent.message || 'Brak treści',
			meta: cleanList([
				smsEvent.campaign?.name ? `Kampania: ${smsEvent.campaign.name}` : null,
				smsEvent.phone ? `Telefon: ${smsEvent.phone}` : null,
			]),
			details: cleanList([
				smsEvent.providerMessageId ? `SMSGate ID: ${smsEvent.providerMessageId}` : null,
			]),
		})
	}

	return events.sort((a, b) => {
		const diff = timestamp(b.at) - timestamp(a.at)
		if (diff !== 0) return diff
		return timestamp(b.createdAt) - timestamp(a.createdAt)
	})
}
