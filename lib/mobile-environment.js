const PROD_APP_ID = 'com.oponexis.companion'
const DEV_APP_ID = 'com.oponexis.companion.dev'

export function allowedMobileAppIds() {
	const configured = String(process.env.MOBILE_ALLOWED_APP_IDS || '')
		.split(',')
		.map(value => value.trim())
		.filter(Boolean)
	if (configured.length) return configured
	return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
		? [PROD_APP_ID]
		: [DEV_APP_ID]
}

export function mobileDeviceEnvironmentWhere() {
	return { appId: { in: allowedMobileAppIds() } }
}
