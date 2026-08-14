import { randomUUID } from 'node:crypto'
import { normalizePhone, parseYmdToUtcDate } from '@/lib/date'
import { db } from '@/lib/prisma'
import { sendSmsGateMessage } from '@/lib/sms/smsGateClient'
import {
	bookingFormMessage,
	bookingReminderMessage,
	formCompletedMessage,
	normalizeFormTemplateKey,
} from '@/lib/sms/formTemplates'
import { createSmsContactEvent } from '@/lib/sms/smsContactEvents'
import { renderTemplate } from '@/lib/sms/templateCatalog'
import { updateSmsTrackerMessage } from '@/lib/telegram'

function clean(value, max = 191) {
	const text = String(value || '').trim()
	return text ? text.slice(0, max) : ''
}

function cleanCustomerName(value, phone) {
	const name = clean(value)
	return name && name !== phone ? name : ''
}

function hasKnownAttributionSource(value) {
	const source = clean(value).toLowerCase()
	return Boolean(source && source !== 'direct')
}

function publicSiteUrl() {
	return (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://oponexis.pl')
		.replace(/\/$/, '')
}

function formUrl(token) {
	return `${publicSiteUrl()}/order?token=${encodeURIComponent(token)}`
}

function customMessageId(prefix, requestId) {
	return `${prefix}-${requestId || randomUUID()}`.slice(0, 64)
}

async function customerContext({ leadId, phone, name }) {
	const explicitLeadId = leadId
	let lead = leadId
		? await db.lead.findUnique({
				where: { id: leadId },
				select: {
					id: true,
					name: true,
					customerId: true,
					firstTouchSource: true,
					serviceName: true,
					selectedNames: true,
				},
		  })
		: null
	const customer = lead?.customerId
		? await db.customer.findUnique({ where: { id: lead.customerId }, select: { id: true, name: true, source: true } })
		: await db.customer.findUnique({ where: { phone }, select: { id: true, name: true, source: true } })
	if (!lead && customer?.id) {
		lead = await db.lead.findFirst({
			where: { customerId: customer.id },
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				name: true,
				customerId: true,
				firstTouchSource: true,
				serviceName: true,
				selectedNames: true,
			},
		})
	}

	const previous = customer?.id
		? await db.workOrder.findFirst({
			where: {
				customerId: customer.id,
				...(explicitLeadId && lead?.id ? { leadId: { not: lead.id } } : {}),
			},
			select: {
				phone: true,
				service: true,
				address: true,
				carModel: true,
				regNumber: true,
				wheelRimSize: true,
				tireSize: true,
			},
			orderBy: [{ visitDate: 'desc' }, { updatedAt: 'desc' }],
		})
		: null
	const savedDetails = previous
		? [
				previous.phone && `tel. ${previous.phone}`,
				previous.service && `usługa: ${previous.service}`,
				previous.address && `adres: ${previous.address}`,
				[previous.carModel, previous.regNumber].filter(Boolean).join(' '),
				previous.wheelRimSize && `felgi: ${previous.wheelRimSize}`,
				previous.tireSize && `opony: ${previous.tireSize}`,
			]
				.filter(Boolean)
				.map(value => `• ${value}`)
				.join('\n')
		: ''

	return {
		knownCustomer: Boolean(previous),
		customerId: customer?.id || null,
		name: cleanCustomerName(name || lead?.name || customer?.name, phone),
		leadId: lead?.id || null,
		service: clean(lead?.selectedNames?.join(', ') || lead?.serviceName),
		savedDetails,
		sourceKnown:
			hasKnownAttributionSource(lead?.firstTouchSource) ||
			Boolean(customer?.source && customer.source !== 'Inne'),
	}
}

export async function previewBookingFormSms({
	phone: rawPhone,
	name,
	service,
	leadId,
	visitDate,
	visitTime,
	messageOverride,
}) {
	const phone = normalizePhone(rawPhone) || clean(rawPhone, 32)
	if (!phone) throw new Error('Missing phone')

	const context = await customerContext({ leadId: clean(leadId), phone, name })
	const formUrlPlaceholder = '{{formUrl}}'
	const values = {
		name: context.name,
		formUrl: formUrlPlaceholder,
		visitDate: clean(visitDate, 10),
		visitTime: clean(visitTime, 8),
		savedDetails: context.savedDetails || 'brak dodatkowych danych',
	}
	const text = clean(messageOverride, 1000)
		? renderTemplate(clean(messageOverride, 1000), values)
		: bookingFormMessage({
			name: values.name,
			knownCustomer: context.knownCustomer,
			sourceKnown: context.sourceKnown,
			savedDetails: context.savedDetails,
			visitDate: values.visitDate,
			visitTime: values.visitTime,
			formUrl: formUrlPlaceholder,
		})

	return {
		text,
		knownCustomer: context.knownCustomer,
		sourceKnown: context.sourceKnown,
		formUrlPlaceholder,
	}
}

export async function sendBookingFormSms({
	phone: rawPhone,
	name,
	service,
	leadId,
	visitDate,
	visitTime,
	profile,
	mobileRequestId,
	templateKey,
	messageOverride,
}) {
	const phone = normalizePhone(rawPhone) || clean(rawPhone, 32)
	if (!phone) throw new Error('Missing phone')

	if (mobileRequestId) {
		const existing = await db.smsFormLog.findUnique({ where: { mobileRequestId } })
		if (existing) {
			if (existing.status === 'sending') {
				throw new Error('SMS request is still processing')
			}
			if (existing.status === 'failed') {
				await db.smsFormLog.update({
					where: { id: existing.id },
					data: { mobileRequestId: null },
				})
			} else {
			return {
				entry: existing,
				duplicate: true,
				providerMessageId: existing.providerMessageId,
			}
			}
		}
	}

	const context = await customerContext({ leadId: clean(leadId), phone, name })
	const sentAt = new Date()
	const normalizedTemplateKey = normalizeFormTemplateKey(templateKey)
	const entry = await db.smsFormLog.create({
		data: {
			publicToken: randomUUID(),
			phone,
			name: context.name || null,
			service: clean(service) || context.service || null,
			leadId: context.leadId,
			source: mobileRequestId ? 'mobile-companion' : 'smsgate',
			status: 'sending',
			sentAt,
			visitDate: parseYmdToUtcDate(visitDate),
			visitTime: clean(visitTime, 8) || null,
			expiresAt: new Date(sentAt.getTime() + 2 * 60 * 60 * 1000),
			mobileRequestId: mobileRequestId || null,
			templateKey: context.knownCustomer
				? `${normalizedTemplateKey}_known`
				: `${normalizedTemplateKey}_new`,
		},
	})
	const url = formUrl(entry.publicToken)
	const generatedText = bookingFormMessage({
		name: context.name,
		knownCustomer: context.knownCustomer,
		sourceKnown: context.sourceKnown,
		savedDetails: context.savedDetails,
		visitDate: clean(visitDate, 10),
		visitTime: clean(visitTime, 8),
		formUrl: url,
	})
	const text = clean(messageOverride, 1000)
		? renderTemplate(clean(messageOverride, 1000), {
				name: context.name,
				formUrl: url,
				visitDate: clean(visitDate, 10),
				visitTime: clean(visitTime, 8),
				savedDetails: context.savedDetails || 'brak dodatkowych danych',
		  })
		: generatedText

	try {
		const result = await sendSmsGateMessage({
			phone,
			text,
			customId: customMessageId('form', mobileRequestId),
			profile,
		})
		const saved = await db.smsFormLog.update({
			where: { id: entry.id },
			data: {
				status: 'pending',
				formUrl: url,
				providerMessageId: result?.id || null,
				deliveryStatus: 'QUEUED',
				deliveryError: null,
				deliveryUpdatedAt: new Date(),
			},
		})
		await updateSmsTrackerMessage().catch(() => {})
		return { entry: saved, duplicate: false, providerMessageId: result?.id || null }
	} catch (error) {
		await db.smsFormLog.update({
			where: { id: entry.id },
			data: {
				status: 'failed',
				formUrl: url,
				deliveryStatus: 'FAILED',
				deliveryError: String(error?.message || 'SMS Gateway rejected the message.').slice(0, 500),
				deliveryUpdatedAt: new Date(),
			},
		})
		await updateSmsTrackerMessage().catch(() => {})
		throw error
	}
}

export async function sendFormCompletedSms({ phone, name, visitDate, visitTime, workOrderId, profile }) {
	const text = formCompletedMessage({ name, visitDate, visitTime })
	const result = await sendSmsGateMessage({
		phone,
		text,
		customId: customMessageId('form-completed', String(workOrderId)),
		profile,
	})
	await createSmsContactEvent({
		direction: 'OUT',
		type: 'sms_form_completed',
		phone,
		message: text,
		providerMessageId: result?.id || null,
		raw: result?.raw,
	})
	return result
}

export async function sendBookingFormReminder(log, profile) {
	const result = await sendSmsGateMessage({
		phone: log.phone,
		text: bookingReminderMessage({ name: log.name, formUrl: log.formUrl }),
		customId: customMessageId('reminder', String(log.id)),
		profile,
	})
	return result?.id || null
}
