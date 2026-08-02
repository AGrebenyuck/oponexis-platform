import { normalizeOptionalText, normalizePhone } from './date'
import { db } from './prisma'
import { looksLikeTestRecord } from './test-data'

export function normalizedPhoneOrRaw(phone) {
	return normalizePhone(phone) || String(phone || '').trim()
}

export function looksLikeTestData(...values) {
	return looksLikeTestRecord(...values)
}

export async function upsertCustomerFromContact({
	phone,
	name,
	gender,
	source,
	isTest = false,
}) {
	const normalizedPhone = normalizedPhoneOrRaw(phone)
	if (!normalizedPhone) return null

	const data = {
		name: normalizeOptionalText(name),
		gender: normalizeOptionalText(gender),
		source: normalizeOptionalText(source),
		isTest: !!isTest,
	}

	const existing = await db.customer.findUnique({
		where: { phone: normalizedPhone },
	})

	if (!existing) {
		return db.customer.create({
			data: {
				phone: normalizedPhone,
				...data,
			},
		})
	}

	return db.customer.update({
		where: { id: existing.id },
		data: {
			name: existing.name || data.name,
			gender: existing.gender || data.gender,
			source: existing.source || data.source,
			isTest: existing.isTest || data.isTest,
		},
	})
}

export async function attachCustomerToLead(lead, { source } = {}) {
	if (!lead?.phone) return lead
	const customer = await upsertCustomerFromContact({
		phone: lead.phone,
		name: lead.name,
		source: source || lead.partnerCode,
		isTest: looksLikeTestData(lead.name, lead.phone, lead.serviceName),
	})
	if (!customer) return lead

	return db.lead.update({
		where: { id: lead.id },
		data: { customerId: customer.id },
	})
}

export async function attachCustomerToWorkOrder(order) {
	if (!order?.phone) return order
	const customer = await upsertCustomerFromContact({
		phone: order.phone,
		name: order.name,
		source: order.lead?.partnerCode,
		isTest: looksLikeTestData(
			order.name,
			order.phone,
			order.service,
			order.carModel,
			order.address
		),
	})
	if (!customer) return order

	return db.workOrder.update({
		where: { id: order.id },
		data: { customerId: customer.id },
	})
}
