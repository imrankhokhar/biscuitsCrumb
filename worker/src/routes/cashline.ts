import { Hono } from 'hono'
import { z } from 'zod'
import { matchCashline, type AppPaymentForMatch } from '../../../server/src/lib/cashlineMatch.js'
import { parseStatementFile, type SheetCredit } from '../../../server/src/lib/cashlineParse.js'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import { fileOf, readForm } from '../r2.js'
import { jsonBody, type Ctx } from '../util.js'

export const cashlineRoutes = new Hono<AppEnv>()

const DAY_MS = 86400000
/** Hard cap — keeps D1 row-reads bounded even on huge ledgers */
const MAX_PAYMENTS = 5000

async function compare(c: Ctx, sheet: SheetCredit[], fileName: string) {
  if (sheet.length === 0) return c.json({ error: 'No credit transactions found in the file' }, 400)

  const dated = sheet.map((s) => s.date).filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
  const where: {
    status: { in: string[] }
    OR?: Array<Record<string, unknown>>
  } = { status: { in: ['paid', 'pending'] } }

  if (dated.length > 0) {
    const min = new Date(Math.min(...dated.map((d) => d.getTime())) - 2 * DAY_MS)
    const max = new Date(Math.max(...dated.map((d) => d.getTime())) + 2 * DAY_MS)
    // Match on createdAt or reviewedAt within statement window (±2 days)
    where.OR = [{ createdAt: { gte: min, lte: max } }, { reviewedAt: { gte: min, lte: max } }]
  }

  const payments = await c.get('prisma').payment.findMany({
    where,
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: MAX_PAYMENTS,
  })

  const forMatch: AppPaymentForMatch[] = payments.map((p) => ({
    id: p.id,
    amount: p.amount,
    status: p.status,
    date: p.status === 'paid' && p.reviewedAt ? p.reviewedAt : p.createdAt,
    userName: p.user.name,
    userEmail: p.user.email,
    paymentMethod: p.paymentMethod,
    note: p.note,
  }))

  const { rows, summary } = matchCashline(sheet, forMatch)
  return c.json({
    rows,
    summary,
    meta: {
      fileName,
      sheetCredits: sheet.length,
      appPayments: forMatch.length,
      truncated: payments.length >= MAX_PAYMENTS,
    },
  })
}

const STATEMENT_EXT = /\.(xlsx|xls|csv|pdf)$/i

/**
 * Multipart upload, same contract as the Express route. CSV and .xlsx work on the Worker; PDF parsing
 * (pdf-parse) is stubbed out in wrangler.toml → use /compare-json or export the statement as CSV/Excel.
 */
cashlineRoutes.post('/compare', requireAuth, requirePermission('cashline.view'), async (c) => {
  const file = fileOf(await readForm(c), 'statement', { maxBytes: 10 * 1024 * 1024 })
  if (!file) return c.json({ error: 'Upload a statement file (Excel, CSV, or PDF)' }, 400)
  if (!STATEMENT_EXT.test(file.name)) {
    return c.json({ error: 'Upload an Excel (.xlsx), CSV, or PDF statement' }, 400)
  }

  let sheet: SheetCredit[]
  try {
    sheet = await parseStatementFile({
      originalname: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Could not parse statement' }, 400)
  }
  return compare(c, sheet, file.name)
})

const rowsSchema = z.object({
  fileName: z.string().max(200).optional(),
  rows: z
    .array(
      z.object({
        date: z.string().nullable().optional(),
        amount: z.coerce.number().finite().positive(),
        description: z.string().max(500).optional(),
      }),
    )
    .max(20000),
})

/** Alternative to /compare: the client parses the statement and posts credit rows as JSON. */
cashlineRoutes.post('/compare-json', requireAuth, requirePermission('cashline.view'), async (c) => {
  const parsed = rowsSchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid rows payload' }, 400)

  const sheet: SheetCredit[] = parsed.data.rows.map((r, i) => {
    const d = r.date ? new Date(r.date) : null
    return {
      key: `j-${i}`,
      rowIndex: i + 1,
      date: d && !Number.isNaN(d.getTime()) ? d : null,
      amount: Math.round(r.amount * 100) / 100,
      description: r.description?.trim() ?? '',
    }
  })
  return compare(c, sheet, parsed.data.fileName ?? 'statement.json')
})
