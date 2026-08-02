import { realWorkOrderWhere } from './test-data'

export function incompleteCompletionWhere(untilDate) {
	return realWorkOrderWhere({
		visitDate: untilDate ? { lte: untilDate } : { not: null },
		completions: { none: { serviceUsed: { not: false } } },
	})
}

export function scheduledWorkOrderWhere(todayDate) {
	return realWorkOrderWhere({
		visitDate: { gte: todayDate },
		visitTime: { not: null },
	})
}
