import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'

function serialize(device) {
	return {
		...device,
		createdAt: device.createdAt.toISOString(),
		updatedAt: device.updatedAt.toISOString(),
		lastSeenAt: device.lastSeenAt.toISOString(),
		lastSmsAt: device.lastSmsAt?.toISOString() || null,
		installationId: `${device.installationId.slice(0, 8)}…${device.installationId.slice(-6)}`,
	}
}

export async function GET() {
	const devices = await db.mobilePushDevice.findMany({
		orderBy: [{ smsPrimary: 'desc' }, { lastSeenAt: 'desc' }],
	})
	return NextResponse.json({ success: true, data: devices.map(serialize) })
}

export async function PATCH(request) {
	try {
		const body = await request.json()
		const id = String(body?.id || '').trim()
		if (!id) return NextResponse.json({ success: false, error: 'Brak urządzenia.' }, { status: 400 })
		const deviceType = body.deviceType === 'WORK' ? 'WORK' : 'TEST'
		const phoneNumber = String(body.phoneNumber || '').trim().slice(0, 40) || null
		const label = String(body.label || '').trim().slice(0, 100) || null
		const enabled = body.enabled !== false
		const smsPrimary = Boolean(body.smsPrimary)
		const updated = await db.$transaction(async transaction => {
			if (smsPrimary) {
				await transaction.mobilePushDevice.updateMany({
					where: { smsPrimary: true, id: { not: id } },
					data: { smsPrimary: false },
				})
			}
			return transaction.mobilePushDevice.update({
				where: { id },
				data: {
					label,
					deviceType,
					phoneNumber,
					simSlot: Math.max(1, Math.min(4, Number(body.simSlot) || 1)),
					enabled: smsPrimary ? true : enabled,
					smsPrimary,
				},
			})
		})
		return NextResponse.json({ success: true, data: serialize(updated) })
	} catch (error) {
		console.error('[companion devices] update failed', error)
		return NextResponse.json({ success: false, error: 'Nie zapisano urządzenia.' }, { status: 500 })
	}
}
