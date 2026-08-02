import { db } from '@/lib/prisma'
import { isStorageService, seasonFromDate, seasonYearFromDate } from '@/lib/season'
import { normalizeCustomerSource } from '@/lib/customer-sources'

export function money(value) {
	return Math.round((Number(value) || 0) * 100) / 100
}

export function formatMoney(value) {
	return `${Math.round(Number(value) || 0).toLocaleString('pl-PL')} zł`
}

export function splitServiceNames(names = []) {
	return names
		.flatMap(name =>
			String(name || '')
				.split(/[;,]/)
				.map(item => item.trim())
		)
		.filter(Boolean)
}

export function completionDate(completion) {
	return completion.completedAt || completion.createdAt || null
}

export function isRealCompletion(completion) {
	return !completion.isTest && completion.serviceUsed !== false
}

export function isActiveCustomerRow(row) {
	return row.totalOrders > 0 || row.workOrderCount > 0 || row.leadCount > 0
}

function unique(values) {
	return Array.from(new Set(values.filter(Boolean)))
}

function latestDate(values) {
	return values
		.filter(Boolean)
		.map(value => new Date(value))
		.filter(value => !Number.isNaN(value.getTime()))
		.sort((a, b) => b.getTime() - a.getTime())[0]
}

export async function getCustomerAnalyticsRows({ includeTests = false } = {}) {
	const customers = await db.customer.findMany({
		include: {
			leads: true,
			workOrders: true,
			completions: true,
			smsContactEvents: {
				orderBy: { occurredAt: 'desc' },
				take: 5,
			},
		},
		orderBy: { updatedAt: 'desc' },
	})

	return customers
		.filter(customer => includeTests || !customer.isTest)
		.map(customer => {
			const completions = (customer.completions || []).filter(item =>
				includeTests ? item.serviceUsed !== false : isRealCompletion(item)
			)
			const paid = completions.filter(item => typeof item.amount === 'number')
			const lastCompletion = completions
				.slice()
				.sort(
					(a, b) =>
						new Date(completionDate(b) || 0).getTime() -
						new Date(completionDate(a) || 0).getTime()
				)[0]
			const services = unique(
				completions.flatMap(item => splitServiceNames(item.serviceNames || []))
			)
			const completionDates = completions
				.map(item => completionDate(item))
				.filter(Boolean)
				.map(date => new Date(date))
				.filter(date => !Number.isNaN(date.getTime()))
			const seasons = unique(
				completionDates.map(date => `${seasonFromDate(date)}:${seasonYearFromDate(date)}`)
			)
			const totalSpent = money(paid.reduce((sum, item) => sum + (item.amount || 0), 0))
			const latestActivity = latestDate([
				lastCompletion ? completionDate(lastCompletion) : null,
				...(customer.workOrders || []).map(item => item.visitDate || item.createdAt),
				...(customer.leads || []).map(item => item.createdAt),
				...(customer.smsContactEvents || []).map(item => item.occurredAt),
			])

			return {
				id: customer.id,
				name: customer.name || lastCompletion?.name || 'Brak imienia',
				phone: customer.phone,
				source:
					normalizeCustomerSource(customer.source || lastCompletion?.source) || 'Nieznane',
				isTest: customer.isTest,
				notes: customer.notes || '',
				totalOrders: completions.length,
				totalSpent,
				averageCheck: completions.length ? money(totalSpent / completions.length) : 0,
				lastOrderDate: lastCompletion ? completionDate(lastCompletion) : null,
				latestActivity,
				completionDates,
				seasons,
				services,
				hasStorage: completions.some(item => isStorageService(splitServiceNames(item.serviceNames))),
				leadCount: customer.leads.length,
				workOrderCount: customer.workOrders.length,
				completionCount: completions.length,
				recentContactEvents: customer.smsContactEvents || [],
			}
		})
}

export function groupCounts(values, limit = 8) {
	const map = values.reduce((acc, value) => {
		const key = value || 'Nieznane'
		acc[key] = (acc[key] || 0) + 1
		return acc
	}, {})

	return Object.entries(map)
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, limit)
}
