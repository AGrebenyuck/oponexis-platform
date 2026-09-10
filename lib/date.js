export function parseYmdToUtcDate(value) {
	if (!value) return null
	const [year, month, day] = String(value).split('-').map(Number)
	if (!year || !month || !day) return null
	return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
}

const WARSAW_TIME_ZONE = 'Europe/Warsaw'

export function dateInputValue(value, timeZone = WARSAW_TIME_ZONE) {
	if (!value) return ''
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return ''

	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date)
	const values = Object.fromEntries(
		parts
			.filter(part => part.type !== 'literal')
			.map(part => [part.type, part.value])
	)

	return `${values.year}-${values.month}-${values.day}`
}

export function todayInputValue(timeZone = WARSAW_TIME_ZONE) {
	return dateInputValue(new Date(), timeZone)
}

export function normalizePhone(raw) {
	if (!raw) return null
	const trimmed = String(raw).trim()
	const hasPlus = trimmed.startsWith('+')
	const digits = trimmed.replace(/[^\d]/g, '')
	if (!digits) return null

	if (hasPlus) return `+${digits}`
	if (digits.length === 9) return `+48${digits}`
	return `+${digits}`
}

export function normalizeOptionalText(value) {
	const trimmed = String(value || '').trim()
	return trimmed ? trimmed : null
}
