import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { sendBookingFormReminder } from '@/lib/sms/formSms'
import { smsGateConfigured } from '@/lib/sms/smsGateClient'
import { notifyExpiredSmsForm, updateSmsTrackerMessage } from '@/lib/telegram'

function authorized(request) {
	const secret = process.env.CRON_SECRET?.trim()
	if (!secret) return process.env.NODE_ENV !== 'production'
	return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(request) {
	if (!authorized(request)) {
		return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
	}
	if (!smsGateConfigured(process.env.SMSGATE_FORM_PROFILE)) {
		return NextResponse.json({ ok: false, error: 'SMSGate is not configured' }, { status: 503 })
	}

	const now = new Date()
	const reminderCutoff = new Date(now.getTime() - 60 * 60 * 1000)
	const results = { reminded: 0, expired: 0, failed: 0, notified: 0 }

	const expiring = await db.smsFormLog.findMany({
		where: {
			status: { in: ['pending', 'reminded', 'reminder_sending', 'expired'] },
			expiresAt: { lte: now },
			completedAt: null,
		},
		orderBy: { expiresAt: 'asc' },
		take: 100,
	})
	for (const log of expiring) {
		if (log.status !== 'expired') {
			const claim = await db.smsFormLog.updateMany({
				where: { id: log.id, status: { in: ['pending', 'reminded', 'reminder_sending'] } },
				data: { status: 'expired', expiredAt: now },
			})
			if (!claim.count) continue
			results.expired += 1
		}
		if (!log.managerNotifiedAt) {
			try {
				await notifyExpiredSmsForm(log)
				await db.smsFormLog.update({ where: { id: log.id }, data: { managerNotifiedAt: new Date() } })
				results.notified += 1
			} catch {
				results.failed += 1
			}
		}
	}

	const due = await db.smsFormLog.findMany({
		where: {
			status: 'pending',
			sentAt: { lte: reminderCutoff },
			reminderSentAt: null,
			expiresAt: { gt: now },
			formUrl: { not: null },
		},
		orderBy: { sentAt: 'asc' },
		take: 50,
	})
	for (const log of due) {
		const claim = await db.smsFormLog.updateMany({
			where: { id: log.id, status: 'pending', reminderSentAt: null },
			data: { status: 'reminder_sending' },
		})
		if (!claim.count) continue
		try {
			const providerMessageId = await sendBookingFormReminder(
				log,
				process.env.SMSGATE_FORM_PROFILE
			)
			await db.smsFormLog.update({
				where: { id: log.id },
				data: {
					status: 'reminded',
					reminderSentAt: new Date(),
					reminderProviderMessageId: providerMessageId,
				},
			})
			results.reminded += 1
		} catch {
			await db.smsFormLog.update({ where: { id: log.id }, data: { status: 'pending' } })
			results.failed += 1
		}
	}

	if (results.reminded || results.expired) {
		await updateSmsTrackerMessage().catch(() => {})
	}
	return NextResponse.json({ ok: true, ...results })
}

export async function GET(request) {
	return POST(request)
}
