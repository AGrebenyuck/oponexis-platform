import { reGeocodeAllWorkOrderAddresses } from '../lib/geocoding.js'
import { db } from '../lib/prisma.js'

try {
	const result = await reGeocodeAllWorkOrderAddresses()
	console.log(JSON.stringify(result))
} finally {
	await db.$disconnect()
}
