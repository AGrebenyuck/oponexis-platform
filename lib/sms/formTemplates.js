const TEMPLATE_KEYS = new Set(['booking_form'])

export function normalizeFormTemplateKey(value) {
	return TEMPLATE_KEYS.has(value) ? value : 'booking_form'
}

export function bookingFormMessage({
	name,
	knownCustomer,
	sourceKnown,
	savedDetails,
	visitDate,
	visitTime,
	formUrl,
}) {
	const greeting = name ? `Dzień dobry ${name}!` : 'Dzień dobry!'
	const termin = visitDate && visitTime
		? `\nTermin wizyty: ${visitDate}, ${visitTime}.\n`
		: '\n'
	const context = knownCustomer
		? `Mamy zapisane dane z poprzedniej wizyty${savedDetails ? `:\n${savedDetails}` : '.'}\n\nProsimy otworzyć formularz, sprawdzić dane i wysłać go bez zmian albo poprawić wybrane informacje.`
		: sourceKnown
			? 'Prosimy uzupełnić dane potrzebne do realizacji wizyty.'
			: 'Prosimy uzupełnić dane potrzebne do realizacji wizyty oraz wskazać, skąd dowiedzieli się Państwo o Oponexis.'

	return `${greeting} Tu mobilny serwis Oponexis.${termin}${context}\nFormularz: ${formUrl}`
}

export function formCompletedMessage({ name, visitDate, visitTime }) {
	const greeting = name ? `Dziękujemy, ${name}.` : 'Dziękujemy.'
	const term = visitDate && visitTime ? ` Termin: ${visitDate}, godz. ${visitTime}.` : ''
	return `${greeting} Formularz Oponexis został zapisany, a rezerwacja przyjęta.${term} Do zobaczenia!`
}

export function bookingReminderMessage({ name, formUrl }) {
	const greeting = name ? `Dzień dobry ${name}!` : 'Dzień dobry!'
	return `${greeting} Przypominamy o uzupełnieniu formularza Oponexis. Link będzie aktywny jeszcze przez około godzinę: ${formUrl}`
}
