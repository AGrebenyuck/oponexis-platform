import { geocodePendingWorkOrders, GEOCODING_INITIAL_LIMIT } from '../lib/geocoding.js'
import { db } from '../lib/prisma.js'

try {
	const result = await geocodePendingWorkOrders({
		limit: GEOCODING_INITIAL_LIMIT,
		completedOnly: false,
	})
	console.log(JSON.stringify(result))
} finally {
	await db.$disconnect()
}
