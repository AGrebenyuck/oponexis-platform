import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/prisma'

const transactionSchema = z.object({
	type: z.enum(['INCOME', 'EXPENSE']),
	status: z.enum(['PAID', 'PLANNED']).default('PAID'),
	category: z.string().trim().min(2).max(80),
	amount: z.coerce.number().positive().max(1_000_000),
	occurredAt: z.string().date(),
	description: z.string().trim().max(500).optional().or(z.literal('')),
	counterparty: z.string().trim().max(120).optional().or(z.literal('')),
})

const transactionUpdateSchema = transactionSchema
	.omit({ counterparty: true })
	.extend({ id: z.string().trim().min(1).max(191) })

const transactionDeleteSchema = z.object({ id: z.string().trim().min(1).max(191) })

export async function POST(request) {
	try {
		const input = transactionSchema.parse(await request.json())
		const transaction = await db.financeTransaction.create({
			data: {
				type: input.type,
				status: input.status,
				category: input.category,
				amount: input.amount,
				occurredAt: new Date(`${input.occurredAt}T12:00:00.000Z`),
				description: input.description || null,
				counterparty: input.counterparty || null,
			},
		})

		return NextResponse.json({ ok: true, data: transaction }, { status: 201 })
	} catch (error) {
		const isValidationError = error instanceof z.ZodError
		const message = isValidationError
			? 'Sprawdź kategorię, kwotę i datę.'
			: 'Nie udało się zapisać transakcji.'
		if (!isValidationError) console.error('[finance transactions] create failed', error)
		return NextResponse.json({ ok: false, error: message }, { status: isValidationError ? 400 : 500 })
	}
}

export async function PATCH(request) {
	try {
		const input = transactionUpdateSchema.parse(await request.json())
		const transaction = await db.financeTransaction.update({
			where: { id: input.id },
			data: {
				type: input.type,
				status: input.status,
				category: input.category,
				amount: input.amount,
				occurredAt: new Date(`${input.occurredAt}T12:00:00.000Z`),
				description: input.description || null,
			},
		})

		return NextResponse.json({ ok: true, data: transaction })
	} catch (error) {
		const isValidationError = error instanceof z.ZodError
		const message = isValidationError
			? 'Sprawdź kategorię, kwotę i datę.'
			: 'Nie udało się zaktualizować transakcji.'
		if (!isValidationError) console.error('[finance transactions] update failed', error)
		return NextResponse.json({ ok: false, error: message }, { status: isValidationError ? 400 : 500 })
	}
}

export async function DELETE(request) {
	try {
		const { id } = transactionDeleteSchema.parse(await request.json())
		await db.financeTransaction.delete({ where: { id } })
		return NextResponse.json({ ok: true })
	} catch (error) {
		const isValidationError = error instanceof z.ZodError
		if (!isValidationError) console.error('[finance transactions] delete failed', error)
		return NextResponse.json({ ok: false, error: 'Nie udało się usunąć transakcji.' }, { status: isValidationError ? 400 : 500 })
	}
}
