import { NextResponse } from 'next/server'
import { authorizeMobileRequest, responseHeaders } from '@/lib/mobile-api'
import { db } from '@/lib/prisma'
import { SYSTEM_SMS_TEMPLATES, renderTemplate, templatesForAudience } from '@/lib/sms/templateCatalog'

const AUDIENCES = new Set(['NEW', 'RETURNING', 'ALL'])
const KINDS = new Set(['BOOKING_FORM', 'MESSAGE'])

function errorResponse(status, code) {
	return NextResponse.json(
		{ result: 'error', error: { code, retryable: status >= 500 } },
		{ status, headers: responseHeaders() }
	)
}

function authorize(request) {
	const result = authorizeMobileRequest(request)
	if (result === 'not_configured') return errorResponse(503, 'mobile_api_not_configured')
	if (result !== 'authorized') return errorResponse(401, 'unauthorized')
	return null
}

function publicTemplate(template) {
	return {
		id: template.id,
		name: template.name,
		kind: template.kind,
		audience: template.audience,
		body: renderTemplate(template.body, {
			reviewUrl: process.env.GOOGLE_REVIEW_URL || process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || 'https://oponexis.pl',
		}),
		system: template.id.startsWith('system-'),
	}
}

function systemOverrideId(systemId) {
	return `override-${systemId}`
}

function validatedTemplate(body, fallback = null) {
	const name = String(body?.name || fallback?.name || '').trim().slice(0, 80)
	const templateBody = String(body?.body || '').trim().slice(0, 1000)
	const kind = String(body?.kind || fallback?.kind || '')
	const audience = String(body?.audience || fallback?.audience || '')
	if (!name || !templateBody || !KINDS.has(kind) || !AUDIENCES.has(audience)) return null
	if (kind === 'BOOKING_FORM' && !templateBody.includes('{{formUrl}}')) return null
	return { name, body: templateBody, kind, audience }
}

export async function GET(request) {
	const authError = authorize(request)
	if (authError) return authError
	const audience = new URL(request.url).searchParams.get('audience') || 'NEW'
	if (!['NEW', 'RETURNING'].includes(audience)) return errorResponse(422, 'invalid_audience')

	let system = templatesForAudience(SYSTEM_SMS_TEMPLATES, audience)
	let custom = []
	try {
		custom = await db.smsTemplate.findMany({
			where: { active: true, audience: { in: ['ALL', audience] } },
			orderBy: [{ createdAt: 'asc' }],
		})
	} catch (error) {
		console.error('[mobile sms templates] custom templates unavailable', {
			errorType: error?.constructor?.name || 'UnknownError',
		})
	}
	const overriddenSystemIds = new Set(
		custom
			.filter(template => template.id.startsWith('override-system-'))
			.map(template => template.id.replace('override-', '')),
	)
	system = system.filter(template => !overriddenSystemIds.has(template.id))
	const templates = [...system, ...custom]
		.sort((first, second) => {
			if (first.kind !== second.kind) return first.kind === 'BOOKING_FORM' ? -1 : 1
			return first.name.localeCompare(second.name, 'pl')
		})
		.map(publicTemplate)
	return NextResponse.json(
		{ result: 'ok', templates },
		{ headers: responseHeaders() }
	)
}

export async function POST(request) {
	const authError = authorize(request)
	if (authError) return authError
	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json')
	}
	const templateData = validatedTemplate(body)
	if (!templateData) {
		return errorResponse(422, 'booking_template_requires_form_url')
	}
	let template
	try {
		template = await db.smsTemplate.create({
		data: templateData,
		})
	} catch (error) {
		console.error('[mobile sms templates] create failed', {
			errorType: error?.constructor?.name || 'UnknownError',
		})
		return errorResponse(503, 'sms_template_storage_unavailable')
	}
	return NextResponse.json(
		{ result: 'created', template: publicTemplate(template) },
		{ status: 201, headers: responseHeaders() }
	)
}

export async function PUT(request) {
	const authError = authorize(request)
	if (authError) return authError
	let body
	try {
		body = await request.json()
	} catch {
		return errorResponse(400, 'invalid_json')
	}
	const id = String(body?.id || '').trim()
	if (!id) return errorResponse(422, 'invalid_template')

	try {
		if (id.startsWith('system-')) {
			const system = SYSTEM_SMS_TEMPLATES.find(template => template.id === id)
			if (!system) return errorResponse(404, 'template_not_found')
			const templateData = validatedTemplate(body, system)
			if (!templateData) return errorResponse(422, 'booking_template_requires_form_url')
			const template = await db.smsTemplate.upsert({
				where: { id: systemOverrideId(id) },
				update: templateData,
				create: { id: systemOverrideId(id), ...templateData },
			})
			return NextResponse.json(
				{ result: 'updated', template: publicTemplate(template) },
				{ headers: responseHeaders() },
			)
		}

		const existing = await db.smsTemplate.findUnique({ where: { id } })
		if (!existing) return errorResponse(404, 'template_not_found')
		const templateData = validatedTemplate(body, existing)
		if (!templateData) return errorResponse(422, 'booking_template_requires_form_url')
		const template = await db.smsTemplate.update({ where: { id }, data: templateData })
		return NextResponse.json(
			{ result: 'updated', template: publicTemplate(template) },
			{ headers: responseHeaders() },
		)
	} catch (error) {
		console.error('[mobile sms templates] update failed', {
			errorType: error?.constructor?.name || 'UnknownError',
		})
		return errorResponse(503, 'sms_template_storage_unavailable')
	}
}
