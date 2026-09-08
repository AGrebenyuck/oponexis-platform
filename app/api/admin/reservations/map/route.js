import { NextResponse } from 'next/server'
import {
	addressKey,
	GEOCODING_BATCH_SIZE,
	GEOCODING_INITIAL_LIMIT,
	geocodePendingWorkOrders,
} from '@/lib/geocoding'
import { db } from '@/lib/prisma'
import { completedWorkOrderWhere } from '@/lib/work-order-map'

export async function GET() {
	try {
		const [rawWorkOrders, missingCoordinates] = await Promise.all([
			db.workOrder.findMany({
				where: { ...completedWorkOrderWhere(), lat: { not: null }, lng: { not: null } },
				orderBy: [{ visitDate: 'desc' }, { id: 'desc' }],
				take: 500,
				select: {
					id: true,
					name: true,
					phone: true,
					service: true,
					address: true,
					lat: true,
					lng: true,
					visitDate: true,
					visitTime: true,
					createdAt: true,
					customerId: true,
				},
			}),
			db.workOrder.count({
				where: { ...completedWorkOrderWhere(), address: { not: null }, lat: null, lng: null },
			}),
		])
		const geocodes = await db.addressGeocode.findMany({
			where: { addressKey: { in: rawWorkOrders.map(order => addressKey(order.address)) } },
			select: { addressKey: true, locality: true },
		})
		const localityByAddress = new Map(geocodes.map(item => [item.addressKey, item.locality]))
		const workOrders = rawWorkOrders.map(order => ({
			...order,
			locality: localityByAddress.get(addressKey(order.address)) || null,
		}))

		return NextResponse.json({ success: true, data: { workOrders, missingCoordinates } })
	} catch (error) {
		console.error('[reservations map get]', error)
		return NextResponse.json({ success: false, error: 'Nie udało się wczytać mapy.' }, { status: 500 })
	}
}

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}))
		const allExistingOrders = body.scope === 'all-existing-work-orders'
		const data = await geocodePendingWorkOrders({
			limit: allExistingOrders ? GEOCODING_INITIAL_LIMIT : GEOCODING_BATCH_SIZE,
			completedOnly: !allExistingOrders,
		})
		return NextResponse.json({ success: true, data })
	} catch (error) {
		console.error('[reservations map geocode]', error)
		const databaseUnavailable = error?.code === 'P1001'
		const keyMissing = error?.message?.includes('GOOGLE_MAPS_GEOCODING_API_KEY')
		return NextResponse.json(
			{
				success: false,
				error: databaseUnavailable
					? 'Baza danych jest chwilowo niedostępna. Spróbuj ponownie za chwilę.'
					: keyMissing
						? 'Klucz Google Geocoding nie jest skonfigurowany.'
						: 'Nie udało się uzupełnić współrzędnych.',
			},
			{ status: 500 }
		)
	}
}
