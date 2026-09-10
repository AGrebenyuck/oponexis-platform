import { PrismaClient } from '@prisma/client'

const productionUrl = process.env.PROD_DATABASE_URL
const developmentUrl = process.env.DEV_DATABASE_URL

if (!productionUrl || !developmentUrl) throw new Error('Missing PROD_DATABASE_URL or DEV_DATABASE_URL.')
const production = new URL(productionUrl)
const development = new URL(developmentUrl)
if (production.hostname === development.hostname && production.pathname === development.pathname) {
	throw new Error('Production and development databases must be different.')
}
if (!development.hostname.includes('ep-green-bar-a997r3t3')) {
	throw new Error(`Refusing to seed unexpected development host: ${development.hostname}`)
}

const prod = new PrismaClient({ datasources: { db: { url: productionUrl } } })
const dev = new PrismaClient({ datasources: { db: { url: developmentUrl } } })

function scalar(record, excluded = []) {
	return Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.includes(key)))
}

try {
	const [services, promoCodes, partners, calendars, questions, optionSets, smsTemplates, reviews, orders] = await Promise.all([
		prod.service.findMany({ include: { additionalServices: true } }),
		prod.promoCode.findMany(),
		prod.partner.findMany(),
		prod.calendar.findMany({ include: { days: true } }),
		prod.completionFormQuestion.findMany(),
		prod.completionFormOptionSet.findMany(),
		prod.smsTemplate.findMany(),
		prod.googleReviewsCache.findMany(),
		prod.workOrder.findMany({
			where: { customerId: { not: null } },
			include: { customer: { include: { consents: true, seasonStatuses: true } } },
			orderBy: { createdAt: 'desc' },
			take: 30,
		}),
	])

	await dev.$transaction(async transaction => {
		for (const service of services) {
			await transaction.service.upsert({
				where: { id: service.id },
				create: scalar(service, ['additionalServices']),
				update: scalar(service, ['id', 'additionalServices', 'createdAt']),
			})
			if (service.additionalServices.length) {
				await transaction.additionalServices.createMany({
					data: service.additionalServices.map(item => scalar(item)),
					skipDuplicates: true,
				})
			}
		}
		if (promoCodes.length) await transaction.promoCode.createMany({ data: promoCodes.map(item => scalar(item)), skipDuplicates: true })
		if (partners.length) await transaction.partner.createMany({ data: partners.map(item => scalar(item)), skipDuplicates: true })
		for (const calendar of calendars) {
			const days = calendar.days.map(day => scalar(day, ['id', 'availabilityId']))
			await transaction.calendar.upsert({
				where: { id: calendar.id },
				create: { ...scalar(calendar, ['days']), days: { create: days } },
				update: { timeGap: calendar.timeGap, days: { deleteMany: {}, create: days } },
			})
		}
		if (questions.length) await transaction.completionFormQuestion.createMany({ data: questions.map(item => scalar(item)), skipDuplicates: true })
		if (optionSets.length) await transaction.completionFormOptionSet.createMany({ data: optionSets.map(item => scalar(item)), skipDuplicates: true })
		if (smsTemplates.length) await transaction.smsTemplate.createMany({ data: smsTemplates.map(item => scalar(item)), skipDuplicates: true })
		if (reviews.length) await transaction.googleReviewsCache.createMany({ data: reviews.map(item => scalar(item)), skipDuplicates: true })

		const customers = new Map(orders.flatMap(order => order.customer ? [[order.customer.id, order.customer]] : []))
		for (const customer of customers.values()) {
			await transaction.customer.upsert({
				where: { id: customer.id },
				create: scalar(customer, ['consents', 'seasonStatuses']),
				update: scalar(customer, ['id', 'createdAt', 'consents', 'seasonStatuses']),
			})
			if (customer.consents.length) await transaction.customerConsent.createMany({ data: customer.consents.map(item => scalar(item)), skipDuplicates: true })
			if (customer.seasonStatuses.length) await transaction.customerSeasonStatus.createMany({ data: customer.seasonStatuses.map(item => scalar(item)), skipDuplicates: true })
		}
		if (orders.length) {
			await transaction.workOrder.createMany({
				data: orders.map(order => ({ ...scalar(order, ['customer', 'leadId']), leadId: null })),
				skipDuplicates: true,
			})
			await transaction.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"WorkOrder"', 'id'), COALESCE((SELECT MAX("id") FROM "WorkOrder"), 1), true)`)
		}
	}, { timeout: 30_000 })

	console.log(JSON.stringify({
		services: services.length,
		promoCodes: promoCodes.length,
		partners: partners.length,
		questions: questions.length,
		optionSets: optionSets.length,
		smsTemplates: smsTemplates.length,
		customers: new Set(orders.map(order => order.customerId).filter(Boolean)).size,
		workOrders: orders.length,
	}, null, 2))
} finally {
	await Promise.all([prod.$disconnect(), dev.$disconnect()])
}
