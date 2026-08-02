export const FINANCE_EXPENSE_CATEGORIES = [
	'Paliwo',
	'Wynagrodzenia',
	'Materiały i części',
	'Materiały eksploatacyjne',
	'Serwis auta',
	'Marketing',
	'Narzędzia i sprzęt',
	'Ubezpieczenia i formalności',
	'Inne operacyjne',
]

export const FINANCE_INCOME_CATEGORIES = [
	'Pozostały przychód',
	'Korekta / zwrot',
	'Inne',
]

export function financeMonthRange(value) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')) return null
	const [year, month] = value.split('-').map(Number)
	return {
		from: new Date(Date.UTC(year, month - 1, 1)),
		to: new Date(Date.UTC(year, month, 1)),
	}
}

export function financeMonthKey(value) {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return null
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

