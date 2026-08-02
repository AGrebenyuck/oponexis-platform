import { NextResponse } from 'next/server'
import { checkSmsGateConnection } from '@/lib/sms/smsGateClient'

export async function GET(req) {
	try {
		const { searchParams } = new URL(req.url)
		const data = await checkSmsGateConnection(searchParams.get('profile'))
		return NextResponse.json({ success: true, data })
	} catch (error) {
		console.error('GET /api/admin/sms-gate/test failed:', error)
		return NextResponse.json(
			{
				success: false,
				error: error.message || 'Nie sprawdzono SMSGate.',
			},
			{ status: 500 }
		)
	}
}
