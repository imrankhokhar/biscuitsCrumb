import { Router } from 'express'
import { prisma } from '../prisma.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'
import { uploadStatementMemory } from '../lib/upload.js'
import { parseStatementFile } from '../lib/cashlineParse.js'
import { matchCashline, type AppPaymentForMatch } from '../lib/cashlineMatch.js'

export const cashlineRouter = Router()

const DAY_MS = 86400000
/** Hard cap — keeps D1/SQLite row-reads bounded even on huge ledgers */
const MAX_PAYMENTS = 5000

cashlineRouter.post(
  '/compare',
  requireAuth,
  requirePermission('cashline.view'),
  uploadStatementMemory.single('statement'),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Upload a statement file (Excel, CSV, or PDF)' })
      return
    }

    let sheet
    try {
      sheet = await parseStatementFile(req.file)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not parse statement'
      res.status(400).json({ error: message })
      return
    }

    if (sheet.length === 0) {
      res.status(400).json({ error: 'No credit transactions found in the file' })
      return
    }

    const dated = sheet.map((s) => s.date).filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
    const where: {
      status: { in: string[] }
      OR?: Array<Record<string, unknown>>
      createdAt?: { gte: Date; lte: Date }
    } = { status: { in: ['paid', 'pending'] } }

    if (dated.length > 0) {
      const min = new Date(Math.min(...dated.map((d) => d.getTime())) - 2 * DAY_MS)
      const max = new Date(Math.max(...dated.map((d) => d.getTime())) + 2 * DAY_MS)
      // Match on createdAt or reviewedAt within statement window (±2 days)
      where.OR = [
        { createdAt: { gte: min, lte: max } },
        { reviewedAt: { gte: min, lte: max } },
      ]
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
      },
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
    res.json({
      rows,
      summary,
      meta: {
        fileName: req.file.originalname,
        sheetCredits: sheet.length,
        appPayments: forMatch.length,
        truncated: payments.length >= MAX_PAYMENTS,
      },
    })
  },
)
