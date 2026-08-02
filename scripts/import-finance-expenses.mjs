import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'

const CATEGORY_MAP = {
	Auto: 'Serwis auta',
	Benzyna: 'Paliwo',
	Diesel: 'Paliwo',
	Inne: 'Inne operacyjne',
	Magazyn: 'Inne operacyjne',
	Marketing: 'Marketing',
	Narzędzia: 'Narzędzia i sprzęt',
	Rozchodniki: 'Materiały eksploatacyjne',
	Wypłata: 'Wynagrodzenia',
}

function parseCsv(text) {
	const rows = []
	let row = []
	let cell = ''
	let quoted = false
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index]
		if (character === '"') {
			if (quoted && text[index + 1] === '"') {
				cell += '"'
				index += 1
			} else {
				quoted = !quoted
			}
		} else if (character === ',' && !quoted) {
			row.push(cell)
			cell = ''
		} else if ((character === '\n' || character === '\r') && !quoted) {
			if (character === '\r' && text[index + 1] === '\n') index += 1
			row.push(cell)
			if (row.some(value => value !== '')) rows.push(row)
			row = []
			cell = ''
		} else {
			cell += character
		}
	}
	if (cell || row.length) {
		row.push(cell)
		rows.push(row)
	}
	const headers = rows.shift().map(value => value.replace(/^\uFEFF/, '').trim())
	return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

function parseGoogleTimestamp(value) {
	const actual = String(value).trim().match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
	if (actual) {
		const [, day, month, year, hour, minute, second] = actual
		return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
	}

	const migrated = String(value).trim().match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2}) (дп|пп) GMT\+3$/u)
	if (!migrated) throw new Error(`Nieprawidłowa data: ${value}`)
	const [, year, month, day, rawHour, minute, second, period] = migrated
	let hour = Number(rawHour) % 12
	if (period === 'пп') hour += 12
	return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour - 3, Number(minute), Number(second)))
}

const inputPath = process.argv[2]
if (!inputPath) throw new Error('Podaj ścieżkę do pliku CSV.')
const legacyPathIndex = process.argv.indexOf('--legacy-file')
const legacyPath = legacyPathIndex >= 0 ? process.argv[legacyPathIndex + 1] : null
if (legacyPathIndex >= 0 && !legacyPath) throw new Error('Podaj ścieżkę po --legacy-file.')

const rows = parseCsv(await readFile(inputPath, 'utf8'))
const occurrences = new Map()
const data = rows.map(row => {
	const sourceCategory = row.Kategoria.trim()
	const category = CATEGORY_MAP[sourceCategory]
	if (!category) throw new Error(`Brak mapowania kategorii: ${sourceCategory}`)
	const amount = Number(String(row.Kwota).trim().replace(',', '.'))
	if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Nieprawidłowa kwota: ${row.Kwota}`)
	const description = row.Opis.trim()
	const fingerprint = [sourceCategory, amount, description].join('\u001f')
	const occurrence = (occurrences.get(fingerprint) || 0) + 1
	occurrences.set(fingerprint, occurrence)
	return {
		type: 'EXPENSE',
		status: 'PAID',
		category,
		amount,
		occurredAt: parseGoogleTimestamp(row['Позначка часу']),
		description: description || sourceCategory,
		externalRef: `google-expenses:v2:${createHash('sha256').update(`${fingerprint}\u001f${occurrence}`).digest('hex')}`,
	}
})

const db = new PrismaClient()
try {
	let corrected = 0
	if (legacyPath) {
		const legacyRows = parseCsv(await readFile(legacyPath, 'utf8'))
		if (legacyRows.length !== rows.length) throw new Error('Nowy i stary plik mają różną liczbę wierszy.')
		for (let index = 0; index < rows.length; index += 1) {
			const current = rows[index]
			const legacy = legacyRows[index]
			const currentSignature = [current.Kategoria.trim(), Number(String(current.Kwota).trim().replace(',', '.')), current.Opis.trim()].join('\u001f')
			const legacySignature = [legacy.Kategoria.trim(), Number(String(legacy.Kwota).trim().replace(',', '.')), legacy.Opis.trim()].join('\u001f')
			if (currentSignature !== legacySignature) throw new Error(`Wiersz ${index + 2} nie odpowiada staremu eksportowi.`)
			const legacyFingerprint = [legacy['Позначка часу'], legacy.Kategoria.trim(), legacy.Kwota, legacy.Opis].join('\u001f')
			const legacyRef = `google-expenses:${createHash('sha256').update(legacyFingerprint).digest('hex')}`
			const result = await db.financeTransaction.updateMany({
				where: { externalRef: legacyRef },
				data: { occurredAt: data[index].occurredAt, externalRef: data[index].externalRef },
			})
			corrected += result.count
		}
	}
	const result = await db.financeTransaction.createMany({ data, skipDuplicates: true })
	const imported = await db.financeTransaction.findMany({ where: { externalRef: { startsWith: 'google-expenses:' } } })
	const totals = imported.reduce((summary, row) => {
		summary.total += row.amount
		summary.categories[row.category] = (summary.categories[row.category] || 0) + row.amount
		return summary
	}, { total: 0, categories: {} })
	console.log(JSON.stringify({ sourceRows: rows.length, corrected, inserted: result.count, databaseRows: imported.length, ...totals }, null, 2))
} finally {
	await db.$disconnect()
}
