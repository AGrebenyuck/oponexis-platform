import { db } from '@/lib/prisma'
import { getCompletionFormQuestionConfig } from '@/lib/completion-form-questions'
import {
	CUSTOMER_SOURCE_OPTIONS,
	normalizeCustomerSource,
} from '@/lib/customer-sources'
import PublicCompletionForm from './PublicCompletionForm'

export const dynamic = 'force-dynamic'

const serviceOptions = [
	'Wymiana kół',
	'Wymiana opon',
	'Remont opony',
	'Przechowania kół',
	'Odpalenie auta',
	'Sprzedaż używanych opon',
	'Sprzedaż nowych opon',
	'Sprzedaż opony dojazdowej',
]

const sources = CUSTOMER_SOURCE_OPTIONS

const serviceAliases = {
	'Wymiana kół': ['wymiana kol', 'sezonowa wymiana kol', 'zmiana kol'],
	'Wymiana opon': [
		'wymiana opon',
		'wymien opon',
		'wymiana open',
		'wimen open',
		'przelozenie opon',
		'opony bez felg',
	],
	'Remont opony': ['remont opony', 'naprawa opony', 'pomoc z opona'],
	'Przechowania kół': ['przechowania kol', 'przechowywanie kol', 'magazynowanie kol'],
	'Odpalenie auta': ['odpalenie auta', 'uruchomienie auta'],
	'Sprzedaż używanych opon': ['sprzedaz uzywanych opon', 'uzywane opony'],
	'Sprzedaż nowych opon': ['sprzedaz nowych opon', 'nowe opony'],
	'Sprzedaż opony dojazdowej': ['opona dojazdowa', 'sprzedaz opony dojazdowej'],
}

function normalizeSearchText(value) {
	return String(value || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ł/g, 'l')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function inferServiceNames(value) {
	const text = normalizeSearchText(value)
	if (!text) return []

	return serviceOptions.filter(option => {
		const optionText = normalizeSearchText(option)
		const aliases = serviceAliases[option] || []
		return (
			text.includes(optionText) ||
			aliases.some(alias => text.includes(normalizeSearchText(alias)))
		)
	})
}

function uniqueOptions(...groups) {
	const seen = new Set()
	const result = []
	groups.flat().forEach(value => {
		const text = String(value || '').trim()
		if (!text) return
		const key = normalizeSearchText(text)
		if (seen.has(key)) return
		seen.add(key)
		result.push(text)
	})
	return result
}

function questionOptions(questions, key, fallback = []) {
	const question = questions.find(item => item.key === key)
	return question?.options?.length ? question.options : fallback
}

function normalizeSource(value, availableSources = sources) {
	const raw = String(value || '').trim()
	if (!raw) return ''
	const normalized = normalizeCustomerSource(raw)
	const exact = availableSources.find(source => normalizeSearchText(source) === normalizeSearchText(normalized))
	if (exact) return exact
	return normalized
}

function dateInput(value) {
	if (!value) return new Date().toISOString().slice(0, 10)
	return new Date(value).toISOString().slice(0, 10)
}

export default async function PublicWorkOrderCompletionPage({ searchParams }) {
	const params = await searchParams
	const id = Number(params?.id)
	const saved = params?.saved === '1'
	const questionConfig = await getCompletionFormQuestionConfig({ activeOnly: true })
	const configuredSourceOptions = questionOptions(questionConfig.questions, 'source', sources)
	const configuredServiceOptions = questionOptions(questionConfig.questions, 'serviceNames', serviceOptions)
	const genderOptions = questionOptions(questionConfig.questions, 'gender', ['Mężczyzna', 'Kobieta'])
	const serviceUsedOptions = questionOptions(questionConfig.questions, 'serviceUsed', ['Tak', 'Nie'])
	const invoiceOptions = questionOptions(questionConfig.questions, 'invoiceIssued', ['Tak', 'Nie'])
	const paymentOptions = questionOptions(questionConfig.questions, 'paymentMethod', ['Karta', 'Gotówka'])
	const order = id
		? await db.workOrder.findUnique({
				where: { id },
				include: {
					customer: {
						include: { _count: { select: { completions: true, workOrders: true } } },
					},
					lead: true,
					completions: {
						orderBy: { createdAt: 'desc' },
						take: 1,
						include: { customAnswers: true },
					},
				},
		  })
		: null

	if (!id || !order) {
		return (
			<PublicShell title='Nie znaleziono zlecenia'>
				<div className='opx-card'>
					<p>Link jest niepoprawny albo zlecenie nie istnieje.</p>
				</div>
			</PublicShell>
		)
	}

	const completion = order.completions?.[0] || null
	const selectedServices = completion?.serviceNames?.length
		? completion.serviceNames
		: inferServiceNames(order.service)
	const serviceNameOptions = uniqueOptions(configuredServiceOptions, selectedServices)
	const selectedSource =
		normalizeSource(completion?.source, configuredSourceOptions) ||
		normalizeSource(order.customer?.source, configuredSourceOptions) ||
		(order.leadId ? 'Strona internetowa' : '')
	const sourceOptions = uniqueOptions(configuredSourceOptions, sources, selectedSource)
	const car =
		completion?.car ||
		[order.carModel, order.regNumber].filter(Boolean).join(' / ')
	const formDefaults = {
		name: completion?.name || order.name || '',
		phone: completion?.phone || order.phone || '',
		gender: completion?.gender || '',
		source: selectedSource,
		car,
		serviceUsed:
			completion?.serviceUsed == null
				? 'true'
				: completion.serviceUsed
				? 'true'
				: 'false',
		completedAt: dateInput(completion?.completedAt || order.visitDate),
		serviceNames: selectedServices,
		amount: completion?.amount == null ? '' : String(completion.amount),
		invoiceIssued:
			completion?.invoiceIssued == null
				? ''
				: completion.invoiceIssued
				? 'true'
				: 'false',
		paymentMethod: completion?.paymentMethod || '',
		notes: completion?.notes || '',
		hasCompletion: Boolean(completion),
		saved,
		customAnswers: Object.fromEntries(
			(completion?.customAnswers || []).map(answer => [
				answer.questionId,
				answer.value ?? answer.valueText ?? '',
			])
		),
	}

	return (
		<PublicShell
			title={`Zakończenie zlecenia #${order.id}`}
			subtitle={
				order.customer
					? `Historia klienta: ${order.customer._count.completions} wykonane, ${order.customer._count.workOrders} zlecenia`
					: 'Nowy lub nierozpoznany klient'
			}
		>
			<PublicCompletionForm
				orderId={order.id}
				defaults={formDefaults}
				serviceOptions={serviceNameOptions}
				sources={sourceOptions}
				genderOptions={genderOptions}
				serviceUsedOptions={serviceUsedOptions}
				invoiceOptions={invoiceOptions}
				paymentOptions={paymentOptions}
				customQuestions={questionConfig.customQuestions}
			/>
		</PublicShell>
	)
}

function PublicShell({ title, subtitle, children }) {
	return (
		<main className='opx-public-form'>
			<style>{`
				body { margin: 0; background: #132c43; font-family: Arial, Helvetica, sans-serif; }
				.opx-public-form { min-height: 100vh; padding: 18px; box-sizing: border-box; color: #132c43; }
				.opx-wrap { max-width: 760px; margin: 0 auto; }
				.opx-title { margin: 0 0 4px; color: white; font-size: 26px; }
				.opx-sub { margin: 0 0 18px; color: #d7e4ef; font-size: 14px; }
				.opx-card { background: white; border: 1px solid #d9e4ee; border-radius: 8px; padding: 16px; box-shadow: 0 18px 48px rgba(6,20,34,.12); }
				.opx-success { margin-bottom: 12px; border: 1px solid #a7f3d0; background: #ecfdf5; color: #047857; border-radius: 8px; padding: 11px 12px; font-weight: 800; }
				.opx-toast { margin-bottom: 12px; border-radius: 8px; padding: 12px 14px; display: grid; gap: 3px; font-size: 14px; box-shadow: 0 14px 32px rgba(6,20,34,.14); }
				.opx-toast strong { font-size: 15px; }
				.opx-toast--success { border: 1px solid #a7f3d0; background: #ecfdf5; color: #047857; }
				.opx-toast--error { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
				.opx-toast--info { border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; }
				.opx-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
				label { display: block; margin-bottom: 14px; font-weight: 700; font-size: 14px; }
				input, select, textarea { width: 100%; box-sizing: border-box; margin-top: 7px; border: 1px solid #cbd8e4; border-radius: 8px; padding: 11px 12px; font: inherit; color: #132c43; }
				textarea { resize: vertical; }
				.opx-checks { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 7px; }
				.opx-check { display: flex; align-items: center; gap: 8px; margin: 0; border: 1px solid #d9e4ee; border-radius: 8px; padding: 10px; font-size: 13px; }
				.opx-check input { width: auto; margin: 0; }
				.opx-custom-fields { margin-top: 8px; border-top: 1px solid #e7eef5; padding-top: 14px; }
				.opx-custom-fields h2 { margin: 0 0 12px; font-size: 18px; color: #132c43; }
				.opx-submit { width: 100%; border: 0; border-radius: 8px; background: #fd6d02; color: white; padding: 13px 16px; font-weight: 900; font-size: 16px; transition: transform .15s ease, opacity .15s ease, background .15s ease; }
				.opx-submit--loading { background: #d95b00; }
				.opx-submit-content { display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
				.opx-submit-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.45); border-top-color: white; border-radius: 999px; animation: opx-spin .75s linear infinite; }
				.opx-submit:disabled { opacity: .72; cursor: wait; }
				@keyframes opx-spin { to { transform: rotate(360deg); } }
				@media (max-width: 620px) { .opx-grid, .opx-checks { grid-template-columns: 1fr; } .opx-title { font-size: 22px; } }
			`}</style>
			<div className='opx-wrap'>
				<h1 className='opx-title'>{title}</h1>
				{subtitle ? <p className='opx-sub'>{subtitle}</p> : null}
				{children}
			</div>
		</main>
	)
}
