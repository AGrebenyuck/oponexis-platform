import { DateTime } from 'luxon'
import { realWorkOrderWhere } from './test-data.js'

const ZONE = 'Europe/Warsaw'

export function completedWorkOrderWhere() {
	const today = DateTime.now().setZone(ZONE).startOf('day').toJSDate()
	return realWorkOrderWhere({
		OR: [
			{ visitDate: { lt: today } },
			{ completions: { some: { serviceUsed: { not: false } } } },
			{ status: 'completed' },
		],
	})
}
