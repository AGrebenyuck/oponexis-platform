import Script from 'next/script'

export default function PublicCompletionForm({
	orderId,
	defaults,
	serviceOptions,
	sources,
	genderOptions = ['Mężczyzna', 'Kobieta'],
	serviceUsedOptions = ['Tak', 'Nie'],
	invoiceOptions = ['Tak', 'Nie'],
	paymentOptions = ['Karta', 'Gotówka'],
	customQuestions = [],
}) {
	const isEditing = Boolean(defaults.hasCompletion)
	const saved = Boolean(defaults.saved)

	return (
		<>
			<div
				className='opx-toast opx-toast--info'
				role='status'
				data-opx-saving
				hidden
			>
				<strong>Zapisywanie formularza...</strong>
				<span>Nie zamykaj strony. Za chwilę pokażemy wynik zapisu.</span>
			</div>

			<div
				className='opx-toast opx-toast--success'
				role='status'
				data-opx-success
				hidden={!saved}
			>
				<strong>
					{isEditing ? 'Zaktualizowano wykonanie zlecenia.' : 'Zapisano wykonanie zlecenia.'}
				</strong>
				<span>Wszystko gotowe. Możesz zamknąć tę stronę.</span>
			</div>

			<div
				className='opx-toast opx-toast--error'
				role='alert'
				data-opx-error
				hidden
			>
				<strong>Nie zapisano formularza.</strong>
				<span data-opx-error-text>Błąd zapisu formularza.</span>
			</div>

			{isEditing && !saved ? (
				<div className='opx-toast opx-toast--info' role='status' data-opx-existing>
					<strong>To zlecenie ma już zapisane wykonanie.</strong>
					<span>Możesz poprawić dane i zapisać formularz ponownie.</span>
				</div>
			) : null}

			<form
				method='post'
				action={`/api/work-orders/${orderId}/completion?redirect=1`}
				data-fetch-action={`/api/work-orders/${orderId}/completion`}
				data-opx-completion-form='true'
				className='opx-card'
			>
				<div className='opx-grid'>
					<Field label='Imię'>
						<input name='name' defaultValue={defaults.name} />
					</Field>
					<Field label='Telefon' required>
						<input name='phone' required defaultValue={defaults.phone} />
					</Field>
				</div>

				<div className='opx-grid'>
					<Field label='Płeć'>
						<select name='gender' defaultValue={defaults.gender}>
							<option value=''>Nie wybrano</option>
							{genderOptions.map(option => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</Field>
					<Field label='Źródło' required>
						<select name='source' required defaultValue={defaults.source}>
							<option value=''>Nie wybrano</option>
							{sources.map(source => (
								<option key={source} value={source}>
									{source}
								</option>
							))}
						</select>
					</Field>
				</div>

				<Field label='Samochód'>
					<input name='car' defaultValue={defaults.car} />
				</Field>

				<div className='opx-grid'>
					<Field label='Skorzystał z usługi' required>
						<select name='serviceUsed' required defaultValue={defaults.serviceUsed}>
							{serviceUsedOptions.map(option => (
								<option
									key={option}
									value={String(option).toLowerCase() === 'nie' ? 'false' : 'true'}
								>
									{option}
								</option>
							))}
						</select>
					</Field>
					<Field label='Data'>
						<input
							type='date'
							name='completedAt'
							defaultValue={defaults.completedAt}
						/>
					</Field>
				</div>

				<Field label='Usługa' required>
					<div className='opx-checks'>
						{serviceOptions.map(service => (
							<label key={service} className='opx-check'>
								<input
									type='checkbox'
									name='serviceNames'
									value={service}
									defaultChecked={defaults.serviceNames.includes(service)}
								/>
								<span>{service}</span>
							</label>
						))}
					</div>
				</Field>

				<Field label='Kwota do zapłaty'>
					<input
						type='number'
						min='0'
						step='0.01'
						name='amount'
						defaultValue={defaults.amount}
					/>
				</Field>

				<div className='opx-grid'>
					<Field label='Czek albo faktura'>
						<select name='invoiceIssued' defaultValue={defaults.invoiceIssued}>
							<option value=''>Nie wybrano</option>
							{invoiceOptions.map(option => (
								<option
									key={option}
									value={String(option).toLowerCase() === 'nie' ? 'false' : 'true'}
								>
									{option}
								</option>
							))}
						</select>
					</Field>
					<Field label='Płatność'>
						<select name='paymentMethod' defaultValue={defaults.paymentMethod}>
							<option value=''>Nie wybrano</option>
							{paymentOptions.map(option => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
					</Field>
				</div>

				<Field label='Notatka'>
					<textarea name='notes' rows={3} defaultValue={defaults.notes} />
				</Field>

				{customQuestions.length ? (
					<div className='opx-custom-fields'>
						<h2>Dodatkowe pytania</h2>
						{customQuestions.map(question => (
							<CustomField
								key={question.id}
								question={question}
								value={defaults.customAnswers?.[question.id]}
							/>
						))}
					</div>
				) : null}

				<button
					type='submit'
					className='opx-submit'
					data-opx-submit
					data-default-label={isEditing ? 'Zapisz zmiany' : 'Zapisz wykonanie'}
					data-success-label={isEditing ? 'Zapisano zmiany' : 'Zapisano'}
				>
					{saved ? (isEditing ? 'Zapisano zmiany' : 'Zapisano') : isEditing ? 'Zapisz zmiany' : 'Zapisz wykonanie'}
				</button>
			</form>

			<Script
				id='opx-work-order-complete-script'
				src='/work-order-complete.js?v=20260709'
				strategy='afterInteractive'
			/>
		</>
	)
}

function Field({ label, required = false, children }) {
	return (
		<label>
			{label} {required ? <span style={{ color: '#dc2626' }}>*</span> : null}
			{children}
		</label>
	)
}

function CustomField({ question, value }) {
	const name = `custom_${question.id}`
	const commonProps = {
		name,
		required: question.required,
		defaultValue: Array.isArray(value) ? value.join(', ') : value || '',
	}

	if (question.type === 'long_text') {
		return (
			<Field label={question.label} required={question.required}>
				<textarea {...commonProps} rows={3} />
			</Field>
		)
	}

	if (question.type === 'single_choice') {
		return (
			<Field label={question.label} required={question.required}>
				<select name={name} required={question.required} defaultValue={value || ''}>
					<option value=''>Nie wybrano</option>
					{question.options.map(option => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</Field>
		)
	}

	if (question.type === 'multiple_choice') {
		const selected = Array.isArray(value) ? value : []
		return (
			<Field label={question.label} required={question.required}>
				<div className='opx-checks'>
					{question.options.map(option => (
						<label key={option} className='opx-check'>
							<input
								type='checkbox'
								name={name}
								value={option}
								defaultChecked={selected.includes(option)}
							/>
							<span>{option}</span>
						</label>
					))}
				</div>
			</Field>
		)
	}

	const type = question.type === 'phone' ? 'tel' : question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text'
	return (
		<Field label={question.label} required={question.required}>
			<input {...commonProps} type={type} step={question.type === 'number' ? '0.01' : undefined} />
		</Field>
	)
}
