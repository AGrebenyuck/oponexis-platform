import { DateTime } from 'luxon'
import { db } from './prisma.js'
import { realWorkOrderWhere } from './test-data.js'
import { completedWorkOrderWhere } from './work-order-map.js'

export const GEOCODING_BATCH_SIZE = 25
export const GEOCODING_INITIAL_LIMIT = 500
export const GEOCODING_MONTHLY_LIMIT = 800

function normalizedText(value) {
	return String(value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
}

function monthKey() {
	return DateTime.now().setZone('Europe/Warsaw').toFormat('yyyy-MM')
}

export function addressKey(address) {
	return normalizedText(address)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
}

function addressComponent(result, type) {
	return result.address_components?.find(component => component.types?.includes(type))?.long_name || null
}

function geocodingQuery(address) {
	const text = String(address || '').trim()
	const hasPostalCode = /\b\d{2}-\d{3}\b/.test(text)
	const hasSeparateLocation = text.split(',').map(part => part.trim()).filter(Boolean).length > 1
	const alreadyNamesOpole = /\bopole\b/i.test(text)
	if (hasPostalCode || hasSeparateLocation || alreadyNamesOpole) {
		return `${text}, województwo opolskie, Polska`
	}
	return `${text}, Opole, województwo opolskie, Polska`
}

async function reserveGoogleRequest() {
	const month = monthKey()
	return db.$transaction(async tx => {
		const usage = await tx.geocodingMonthlyUsage.upsert({
			where: { month },
			create: { month },
			update: {},
		})
		if (usage.requestCount >= GEOCODING_MONTHLY_LIMIT) return false
		await tx.geocodingMonthlyUsage.update({
			where: { month },
			data: { requestCount: { increment: 1 } },
		})
		return true
	})
}

async function googleGeocode(address) {
	const key = process.env.GOOGLE_MAPS_GEOCODING_API_KEY
	if (!key) throw new Error('GOOGLE_MAPS_GEOCODING_API_KEY is not configured')

	const query = geocodingQuery(address)
	const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
	url.search = new URLSearchParams({
		address: query,
		components: 'country:PL|administrative_area:opolskie',
		region: 'pl',
		key,
	}).toString()
	const response = await fetch(url, { cache: 'no-store' })
	if (!response.ok) throw new Error('Google Geocoding request failed')
	const data = await response.json()
	if (data.status === 'ZERO_RESULTS') return null
	if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) {
		throw new Error(`Google Geocoding returned ${data.status || 'an invalid response'}`)
	}
	const result = data.results[0]
	const voivodeship = addressComponent(result, 'administrative_area_level_1')
	if (!normalizedText(voivodeship).includes('opolskie')) return { outsideOpolskie: true }
	return {
		...result.geometry.location,
		locality:
			addressComponent(result, 'locality') ||
			addressComponent(result, 'administrative_area_level_3') ||
			addressComponent(result, 'sublocality'),
		voivodeship,
	}
}

export async function geocodePendingWorkOrders({
	limit = GEOCODING_BATCH_SIZE,
	completedOnly = true,
} = {}) {
	const safeLimit = Math.min(
		Math.max(Number(limit) || GEOCODING_BATCH_SIZE, 1),
		GEOCODING_INITIAL_LIMIT
	)
	const workOrderWhere = completedOnly ? completedWorkOrderWhere() : realWorkOrderWhere()
	const candidates = await db.workOrder.findMany({
		where: {
			...workOrderWhere,
			address: { not: null },
			lat: null,
			lng: null,
		},
		orderBy: [{ visitDate: 'desc' }, { id: 'desc' }],
		take: safeLimit * 4,
		select: { id: true, address: true },
	})

	let processed = 0
	let geocoded = 0
	let cached = 0
	let notFound = 0
	let stoppedByLimit = false

	for (const order of candidates) {
		if (processed >= safeLimit) break
		const key = addressKey(order.address)
		if (!key) continue
		processed += 1

		const saved = await db.addressGeocode.findUnique({ where: { addressKey: key } })
		if (saved?.status === 'SUCCESS' && saved.lat != null && saved.lng != null) {
			await db.workOrder.update({
				where: { id: order.id },
				data: { lat: saved.lat, lng: saved.lng },
			})
			cached += 1
			continue
		}
		if (saved?.status === 'NOT_FOUND' || saved?.status === 'FAILED' || saved?.status === 'OUT_OF_AREA') {
			notFound += 1
			continue
		}

		if (!(await reserveGoogleRequest())) {
			stoppedByLimit = true
			break
		}

		try {
			const coords = await googleGeocode(order.address)
			if (!coords || coords.outsideOpolskie) {
				await db.addressGeocode.upsert({
					where: { addressKey: key },
					create: { addressKey: key, status: coords?.outsideOpolskie ? 'OUT_OF_AREA' : 'NOT_FOUND', attemptedAt: new Date() },
					update: { status: coords?.outsideOpolskie ? 'OUT_OF_AREA' : 'NOT_FOUND', lat: null, lng: null, attemptedAt: new Date() },
				})
				notFound += 1
				continue
			}
			await db.addressGeocode.upsert({
				where: { addressKey: key },
				create: { addressKey: key, status: 'SUCCESS', lat: coords.lat, lng: coords.lng, locality: coords.locality, voivodeship: coords.voivodeship, attemptedAt: new Date() },
				update: { status: 'SUCCESS', lat: coords.lat, lng: coords.lng, locality: coords.locality, voivodeship: coords.voivodeship, attemptedAt: new Date() },
			})
			await db.workOrder.update({
				where: { id: order.id },
				data: { lat: coords.lat, lng: coords.lng },
			})
			geocoded += 1
		} catch (error) {
			console.error('[geocoding]', { workOrderId: order.id, error: error.message })
			await db.addressGeocode.upsert({
				where: { addressKey: key },
				create: { addressKey: key, status: 'FAILED', attemptedAt: new Date() },
				update: { status: 'FAILED', attemptedAt: new Date() },
			})
		}
	}

	const [remaining, usage] = await Promise.all([
		db.workOrder.count({
			where: { ...workOrderWhere, address: { not: null }, lat: null, lng: null },
		}),
		db.geocodingMonthlyUsage.findUnique({ where: { month: monthKey() } }),
	])

	return {
		processed,
		geocoded,
		cached,
		notFound,
		remaining,
		stoppedByLimit,
		monthlyRequests: usage?.requestCount || 0,
		monthlyLimit: GEOCODING_MONTHLY_LIMIT,
	}
}

export async function reGeocodeAllWorkOrderAddresses() {
	const orders = await db.workOrder.findMany({
		where: { ...realWorkOrderWhere(), address: { not: null } },
		select: { id: true, address: true },
	})
	const addresses = new Map()
	for (const order of orders) {
		const key = addressKey(order.address)
		if (!key) continue
		const current = addresses.get(key) || { address: order.address, ids: [] }
		current.ids.push(order.id)
		addresses.set(key, current)
	}

	let geocoded = 0
	let rejected = 0
	let stoppedByLimit = false
	for (const [key, item] of addresses) {
		if (!(await reserveGoogleRequest())) {
			stoppedByLimit = true
			break
		}
		try {
			const coords = await googleGeocode(item.address)
			if (!coords || coords.outsideOpolskie) {
				await db.addressGeocode.upsert({
					where: { addressKey: key },
					create: { addressKey: key, status: coords?.outsideOpolskie ? 'OUT_OF_AREA' : 'NOT_FOUND', attemptedAt: new Date() },
					update: { status: coords?.outsideOpolskie ? 'OUT_OF_AREA' : 'NOT_FOUND', lat: null, lng: null, locality: null, voivodeship: null, attemptedAt: new Date() },
				})
				await db.workOrder.updateMany({ where: { id: { in: item.ids } }, data: { lat: null, lng: null } })
				rejected += item.ids.length
				continue
			}
			await db.addressGeocode.upsert({
				where: { addressKey: key },
				create: { addressKey: key, status: 'SUCCESS', lat: coords.lat, lng: coords.lng, locality: coords.locality, voivodeship: coords.voivodeship, attemptedAt: new Date() },
				update: { status: 'SUCCESS', lat: coords.lat, lng: coords.lng, locality: coords.locality, voivodeship: coords.voivodeship, attemptedAt: new Date() },
			})
			await db.workOrder.updateMany({ where: { id: { in: item.ids } }, data: { lat: coords.lat, lng: coords.lng } })
			geocoded += item.ids.length
		} catch (error) {
			console.error('[regeocoding]', { error: error.message })
		}
	}

	const usage = await db.geocodingMonthlyUsage.findUnique({ where: { month: monthKey() } })
	return { geocoded, rejected, stoppedByLimit, monthlyRequests: usage?.requestCount || 0, monthlyLimit: GEOCODING_MONTHLY_LIMIT }
}
