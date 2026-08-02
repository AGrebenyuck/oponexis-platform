export const SYSTEM_SMS_TEMPLATES = [
	{
		id: 'system-booking-new',
		name: 'Formularz — nowy klient',
		kind: 'BOOKING_FORM',
		audience: 'NEW',
		body: 'Dzień dobry {{name}}! Tu mobilny serwis Oponexis.\nTermin wizyty: {{visitDate}}, {{visitTime}}.\nProsimy uzupełnić formularz potrzebny do realizacji wizyty oraz wskazać, skąd dowiedzieli się Państwo o Oponexis.\nFormularz: {{formUrl}}',
	},
	{
		id: 'system-booking-returning',
		name: 'Formularz — stały klient',
		kind: 'BOOKING_FORM',
		audience: 'RETURNING',
		body: 'Dzień dobry {{name}}! Tu mobilny serwis Oponexis.\nTermin wizyty: {{visitDate}}, {{visitTime}}.\nMamy zapisane dane z poprzedniej wizyty:\n{{savedDetails}}\n\nProsimy otworzyć formularz, sprawdzić dane i wysłać go bez zmian albo poprawić wybrane informacje.\nFormularz: {{formUrl}}',
	},
	{
		id: 'system-review-request',
		name: 'Podziękowanie i prośba o opinię',
		kind: 'MESSAGE',
		audience: 'ALL',
		body: 'Dziękujemy za skorzystanie z usług Oponexis. Jeśli wszystko przebiegło dobrze, będziemy wdzięczni za krótką opinię: {{reviewUrl}}',
	},
]

export function templatesForAudience(templates, audience) {
	return templates.filter(template => template.audience === 'ALL' || template.audience === audience)
}

export function renderTemplate(body, values = {}) {
	return Object.entries(values).reduce(
		(text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value || '')),
		String(body || '')
	)
}
