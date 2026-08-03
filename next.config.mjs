function getDevOriginHost(value) {
	if (!value) return null

	try {
		return new URL(value).host
	} catch {
		return null
	}
}

const allowedDevOrigins = Array.from(
	new Set(
		[
			getDevOriginHost(process.env.CRM_PUBLIC_URL),
			getDevOriginHost(process.env.NEXT_PUBLIC_CRM_API_URL),
			...(process.env.ALLOWED_DEV_ORIGINS || '')
				.split(',')
				.map(origin => origin.trim())
				.filter(Boolean),
			'10.138.221.219',
			'10.168.210.219',
		].filter(Boolean)
	)
)

/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins,
}

export default nextConfig;
