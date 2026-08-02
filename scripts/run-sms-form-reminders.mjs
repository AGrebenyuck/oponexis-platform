const baseUrl = (process.env.CRM_CRON_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const intervalMs = Number(process.env.SMS_FORM_CRON_INTERVAL_MS || 60_000)
const secret = process.env.CRON_SECRET?.trim()

async function tick() {
	try {
		const response = await fetch(`${baseUrl}/api/cron/sms-form-reminders`, {
			method: 'POST',
			headers: secret ? { Authorization: `Bearer ${secret}` } : {},
		})
		const result = await response.json().catch(() => null)
		console.log(JSON.stringify({ event: 'sms_form_cron', ok: response.ok, result }))
	} catch (error) {
		console.error(JSON.stringify({
			event: 'sms_form_cron_failed',
			errorType: error?.constructor?.name || 'UnknownError',
		}))
	}
}

await tick()
setInterval(tick, intervalMs)
