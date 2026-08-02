import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/prisma'

const schema = z.object({
	type: z.enum(['INCOME', 'EXPENSE']),
	category: z.string().trim().min(2).max(80),
	amount: z.coerce.number().positive().max(1_000_000),
	occurredAt: z.string().date(),
	description: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function POST(request) {
	try {
		const input = schema.parse(await request.json())
		const transaction = await db.financeTransaction.create({
			data: {
				type: input.type,
				status: 'PAID',
				category: input.category,
				amount: input.amount,
				occurredAt: new Date(`${input.occurredAt}T12:00:00.000Z`),
				description: input.description || null,
			},
		})
		return NextResponse.json({ ok: true, data: { id: transaction.id } }, { status: 201 })
	} catch (error) {
		const validation = error instanceof z.ZodError
		if (!validation) console.error('[public finance transaction] create failed', error)
		return NextResponse.json(
			{ ok: false, error: validation ? 'Sprawdź kategorię, kwotę i datę.' : 'Nie udało się zapisać wydatku.' },
			{ status: validation ? 400 : 500 },
		)
	}
}
