import { NextResponse } from 'next/server'
import { runSmsCampaign } from '@/lib/sms/smsCampaignRunner'
import { smsGateConfigured } from '@/lib/sms/smsGateClient'

export const maxDuration = 60

export async function POST(_req, { params }) {
	try {
		const { id } = await params
		if (!smsGateConfigured()) {
			return NextResponse.json(
				{
					success: false,
					error: 'Brak konfiguracji SMSGate w .env.',
				},
				{ status: 400 }
			)
		}

		const campaign = await runSmsCampaign(id)
		return NextResponse.json({ success: true, data: campaign })
	} catch (error) {
		console.error('POST /api/admin/sms-campaigns/[id]/start failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie uruchomiono kampanii.' },
			{ status: error.code === 'SMS_CAMPAIGN_NOT_STARTABLE' ? 409 : 500 }
		)
	}
}
