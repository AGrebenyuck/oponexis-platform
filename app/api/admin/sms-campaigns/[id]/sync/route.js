import { NextResponse } from 'next/server'
import { syncSmsCampaignStatuses } from '@/lib/sms/syncSmsCampaignStatuses'

export async function POST(_req, { params }) {
	try {
		const { id } = await params
		const campaign = await syncSmsCampaignStatuses(id)
		return NextResponse.json({ success: true, data: campaign })
	} catch (error) {
		console.error('POST /api/admin/sms-campaigns/[id]/sync failed:', error)
		return NextResponse.json(
			{ success: false, error: error.message || 'Nie odświeżono statusów SMS.' },
			{ status: 500 }
		)
	}
}
