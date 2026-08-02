import { CUSTOMER_SOURCE_OPTIONS, normalizeCustomerSource } from './customer-sources'

export const baseCompletionQuestions = [
	{
		key: 'name',
		label: 'Imię',
		type: 'short_text',
		required: false,
		description: 'Imię klienta z formularza wykonania.',
	},
	{
		key: 'gender',
		label: 'Płeć',
		type: 'single_choice',
		required: false,
		options: ['Mężczyzna', 'Kobieta'],
	},
	{
		key: 'phone',
		label: 'Telefon',
		type: 'phone',
		required: true,
	},
	{
		key: 'source',
		label: 'Źródło',
		type: 'single_choice',
		required: false,
		options: CUSTOMER_SOURCE_OPTIONS,
	},
	{
		key: 'car',
		label: 'Samochód',
		type: 'short_text',
		required: false,
	},
	{
		key: 'serviceUsed',
		label: 'Skorzystał z usługi',
		type: 'single_choice',
		required: true,
		options: ['Tak', 'Nie'],
	},
	{
		key: 'completedAt',
		label: 'Data',
		type: 'date',
		required: false,
	},
	{
		key: 'serviceNames',
		label: 'Usługa',
		type: 'multiple_choice',
		required: true,
		options: [
			'Wymiana kół',
			'Wymiana opon',
			'Remont opony',
			'Przechowania kół',
			'Odpalenie auta',
			'Sprzedaż używanych opon',
			'Sprzedaż nowych opon',
			'Sprzedaż opony dojazdowej',
		],
	},
	{
		key: 'amount',
		label: 'Kwota do zapłaty',
		type: 'number',
		required: false,
	},
	{
		key: 'invoiceIssued',
		label: 'Czek albo faktura',
		type: 'single_choice',
		required: false,
		options: ['Tak', 'Nie'],
	},
	{
		key: 'paymentMethod',
		label: 'Płatność',
		type: 'single_choice',
		required: false,
		options: ['Karta', 'Gotówka'],
	},
	{
		key: 'notes',
		label: 'Notatka',
		type: 'long_text',
		required: false,
	},
]

export const completionQuestions = baseCompletionQuestions

function customAnswerMap(completion) {
	return Object.fromEntries(
		(completion.customAnswers || []).map(answer => [
			answer.questionId,
			answer.value ?? answer.valueText ?? '',
		])
	)
}

const monthFormatter = new Intl.DateTimeFormat('pl-PL', {
	month: 'short',
	year: 'numeric',
})

function countBy(values) {
	const map = new Map()
	values
		.map(value => String(value || '').trim())
		.filter(Boolean)
		.forEach(value => map.set(value, (map.get(value) || 0) + 1))

	return Array.from(map.entries())
		.map(([name, value]) => ({ name, value }))
		.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pl'))
}

function splitServiceName(value) {
	return String(value || '')
		.split(/[;,]/)
		.map(item => item.trim())
		.filter(Boolean)
}

function normalizeServiceNames(values = []) {
	return values.flatMap(splitServiceName)
}

function boolLabel(value) {
	if (value === true) return 'Tak'
	if (value === false) return 'Nie'
	return ''
}

function dateOnly(value) {
	if (!value) return ''
	return new Date(value).toISOString().slice(0, 10)
}

function iso(value) {
	if (!value) return ''
	return new Date(value).toISOString()
}

function answeredTextValues(completions, key) {
	return completions
		.map(item => item[key])
		.map(value => String(value || '').trim())
		.filter(Boolean)
}

function dateSummary(completions) {
	const months = new Map()

	completions.forEach(item => {
		if (!item.completedAt) return
		const date = new Date(item.completedAt)
		if (Number.isNaN(date.getTime())) return

		const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
		const month = months.get(monthKey) || {
			key: monthKey,
			label: monthFormatter.format(date),
			days: new Map(),
		}
		const day = String(date.getDate())
		month.days.set(day, (month.days.get(day) || 0) + 1)
		months.set(monthKey, month)
	})

	return Array.from(months.values())
		.sort((a, b) => a.key.localeCompare(b.key))
		.map(month => ({
			...month,
			days: Array.from(month.days.entries())
				.map(([day, count]) => ({ day, count }))
				.sort((a, b) => Number(a.day) - Number(b.day)),
		}))
}

export function serializeCompletion(completion) {
	const customAnswers = customAnswerMap(completion)
	return {
		id: completion.id,
		createdAt: iso(completion.createdAt),
		updatedAt: iso(completion.updatedAt),
		formSubmittedAt: iso(completion.formSubmittedAt),
		completedAt: iso(completion.completedAt),
		name: completion.name || '',
		gender: completion.gender || '',
		phone: completion.phone || '',
		source: normalizeCustomerSource(completion.source) || '',
		car: completion.car || '',
		serviceUsed: boolLabel(completion.serviceUsed),
		serviceNames: normalizeServiceNames(completion.serviceNames || []),
		amount: completion.amount ?? '',
		invoiceIssued: boolLabel(completion.invoiceIssued),
		paymentMethod: completion.paymentMethod || '',
		notes: completion.notes || '',
		importSource: completion.importSource || '',
		workOrderId: completion.workOrderId || '',
		customerId: completion.customerId || '',
		customAnswers,
	}
}

function customSummary(active, question) {
	const values = active
		.map(item => customAnswerMap(item)[question.id])
		.filter(value => {
			if (Array.isArray(value)) return value.length > 0
			return String(value ?? '').trim()
		})

	if (question.type === 'single_choice') {
		return { type: 'pie', count: values.length, data: countBy(values) }
	}

	if (question.type === 'multiple_choice') {
		const flattened = values.flatMap(value => (Array.isArray(value) ? value : [value]))
		return { type: 'bar', count: flattened.length, data: countBy(flattened) }
	}

	if (question.type === 'date') {
		const datedItems = values.map(value => ({ completedAt: value }))
		return { type: 'date', count: datedItems.length, months: dateSummary(datedItems) }
	}

	return {
		type: 'list',
		count: values.length,
		values: values.map(value => (Array.isArray(value) ? value.join(', ') : String(value))),
	}
}

export function buildCompletionAnalytics(completions, questions = completionQuestions) {
	const active = completions.filter(item => !item.isTest)
	const customQuestions = questions.filter(question => question.custom)
	const textFields = ['name', 'phone', 'car', 'notes']
	const fieldAnswers = Object.fromEntries(
		textFields.map(key => [key, answeredTextValues(active, key)])
	)
	const serviceNames = normalizeServiceNames(active.flatMap(item => item.serviceNames || []))
	const amounts = active
		.map(item => Number(item.amount))
		.filter(value => Number.isFinite(value))
	const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0)

	const customQuestionSummaries = Object.fromEntries(
		customQuestions.map(question => [
			question.key,
			customSummary(active, question),
		])
	)

	return {
		totalResponses: active.length,
		totalAmount,
		averageAmount: amounts.length ? totalAmount / amounts.length : 0,
		questions,
		responses: active.map(serializeCompletion),
		summary: {
			name: {
				type: 'list',
				count: fieldAnswers.name.length,
				values: fieldAnswers.name,
			},
			gender: {
				type: 'pie',
				count: active.filter(item => item.gender).length,
				data: countBy(active.map(item => item.gender)),
			},
			phone: {
				type: 'list',
				count: fieldAnswers.phone.length,
				values: fieldAnswers.phone,
			},
			source: {
				type: 'pie',
				count: active.filter(item => item.source).length,
				data: countBy(active.map(item => item.source)),
			},
			car: {
				type: 'list',
				count: fieldAnswers.car.length,
				values: fieldAnswers.car,
			},
			serviceUsed: {
				type: 'pie',
				count: active.filter(item => item.serviceUsed != null).length,
				data: countBy(active.map(item => boolLabel(item.serviceUsed))),
			},
			completedAt: {
				type: 'date',
				count: active.filter(item => item.completedAt).length,
				months: dateSummary(active),
			},
			serviceNames: {
				type: 'bar',
				count: serviceNames.length,
				data: countBy(serviceNames),
			},
			amount: {
				type: 'list',
				count: amounts.length,
				values: amounts.map(amount => `${amount.toLocaleString('pl-PL')} zł`),
			},
			invoiceIssued: {
				type: 'pie',
				count: active.filter(item => item.invoiceIssued != null).length,
				data: countBy(active.map(item => boolLabel(item.invoiceIssued))),
			},
			paymentMethod: {
				type: 'pie',
				count: active.filter(item => item.paymentMethod).length,
				data: countBy(active.map(item => item.paymentMethod)),
			},
			notes: {
				type: 'list',
				count: fieldAnswers.notes.length,
				values: fieldAnswers.notes,
			},
			...customQuestionSummaries,
		},
	}
}

function csvCell(value) {
	const text = Array.isArray(value) ? value.join(', ') : String(value ?? '')
	if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
	return text
}

export function completionsToCsv(completions, customQuestions = []) {
	const headers = [
		'ID',
		'Data wyslania',
		'Data wykonania',
		'Imie',
		'Plec',
		'Telefon',
		'Zrodlo',
		'Samochod',
		'Skorzystal z uslugi',
		'Uslugi',
		'Kwota',
		'Czek albo faktura',
		'Platnosc',
		'Notatka',
		'WorkOrder ID',
		'Customer ID',
		...customQuestions.map(question => question.label),
	]
	const rows = completions
		.filter(item => !item.isTest)
		.map(item => {
			const row = serializeCompletion(item)
			return [
				row.id,
				dateOnly(row.formSubmittedAt || row.createdAt),
				dateOnly(row.completedAt),
				row.name,
				row.gender,
				row.phone,
				row.source,
				row.car,
				row.serviceUsed,
				row.serviceNames,
				row.amount,
				row.invoiceIssued,
				row.paymentMethod,
				row.notes,
				row.workOrderId,
				row.customerId,
				...customQuestions.map(question => {
					const value = row.customAnswers?.[question.id]
					return Array.isArray(value) ? value.join(', ') : value ?? ''
				}),
			]
		})

	return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}
