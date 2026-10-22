import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { getAppSetting } from '../lib/settings.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'
import { createUserNotification } from './notifications.js'
import { uploadReceiptMemory } from '../lib/upload.js'
import {
  readEncryptedReceipt,
  saveEncryptedReceipt,
  toReceiptViewUrl,
} from '../lib/receiptStore.js'
import { notifyLowStockAfterPayment } from '../lib/lowStock.js'

export const payablesRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

async function notifyAdminsPaymentPending(input: {
  userName: string
  amount: number
  method: string
}) {
  const settings = await getAppSetting()
  const symbol = settings.currency.symbol
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { code: 'admin' } },
    select: { id: true },
  })
  await Promise.all(
    admins.map((admin) =>
      createUserNotification({
        userId: admin.id,
        type: 'payment_pending',
        title: 'Payment request pending',
        message: `${input.userName} submitted a payment of ${symbol}${input.amount.toFixed(2)} via ${input.method}. Review it in Payables.`,
      }),
    ),
  )
}

/** Admin / settlement: apply paid amount immediately. */
async function applyPayment(input: {
  userId: string
  amount: number
  note: string
  paymentMethod?: string
  receiptUrl?: string
  recordedByUserId: string
  notify: boolean
}) {
  const settings = await getAppSetting()
  const paid = +input.amount.toFixed(2)

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.payableAccount.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        currencyId: settings.currencyId,
        balance: 0,
        totalCharged: 0,
        totalPaid: 0,
      },
      update: {
        deletedAt: null,
        deletedByUserId: null,
        deletedByName: '',
      },
    })

    const balanceBefore = +account.balance.toFixed(2)
    const balanceAfter = Math.max(0, +(balanceBefore - paid).toFixed(2))
    const applied = +(balanceBefore - balanceAfter).toFixed(2)

    if (applied <= 0) return { account, applied: 0, balanceBefore, balanceAfter }

    await tx.payment.create({
      data: {
        payableAccountId: account.id,
        userId: input.userId,
        recordedByUserId: input.recordedByUserId,
        amount: applied,
        balanceBefore,
        balanceAfter,
        note: input.note,
        paymentMethod: input.paymentMethod ?? '',
        receiptUrl: input.receiptUrl ?? '',
        currencyId: settings.currencyId,
        isFullSettlement: balanceAfter === 0 && balanceBefore > 0,
        status: 'paid',
        reviewedAt: new Date(),
      },
    })

    const updated = await tx.payableAccount.update({
      where: { id: account.id },
      data: {
        balance: balanceAfter,
        totalPaid: { increment: applied },
        currencyId: settings.currencyId,
      },
    })

    return { account: updated, applied, balanceBefore, balanceAfter }
  })

  if (input.notify && result.applied > 0) {
    const symbol = settings.currency.symbol
    await createUserNotification({
      userId: input.userId,
      type: 'payment_received',
      title: 'Payment received',
      message: `A payment of ${symbol}${result.applied.toFixed(2)} was recorded. Remaining balance: ${symbol}${result.balanceAfter.toFixed(2)}.`,
    })
  }

  if (result.applied > 0) {
    await notifyLowStockAfterPayment(input.userId).catch((err) => console.error(err))
  }

  return result.account
}

function mapPendingPayment(p: {
  id: string
  amount: number
  paymentMethod: string
  receiptUrl?: string
  status: string
  note?: string
  createdAt: Date
}) {
  return {
    id: p.id,
    amount: +p.amount.toFixed(2),
    paymentMethod: p.paymentMethod,
    receiptUrl: p.receiptUrl ? toReceiptViewUrl(p.receiptUrl) : null,
    status: p.status,
    note: p.note,
    createdAt: p.createdAt,
  }
}

payablesRouter.get('/me', requireAuth, async (req, res) => {
  const account = await prisma.payableAccount.findFirst({
    where: { userId: req.user!.id, deletedAt: null },
  })
  const pendingList = await prisma.payment.findMany({
    where: { userId: req.user!.id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  const pendingTotal = +pendingList.reduce((s, p) => s + p.amount, 0).toFixed(2)
  const balance = +(account?.balance ?? 0).toFixed(2)
  res.json({
    amount: balance,
    totalCharged: +(account?.totalCharged ?? 0).toFixed(2),
    totalPaid: +(account?.totalPaid ?? 0).toFixed(2),
    pendingTotal,
    payableDueNow: Math.max(0, +(balance - pendingTotal).toFixed(2)),
    pendingPayments: pendingList.map(mapPendingPayment),
    pendingPayment: pendingList[0] ? mapPendingPayment(pendingList[0]) : null,
  })
})

payablesRouter.get('/receipt/:token', requireAuth, async (req, res) => {
  const token = paramId(req.params.token)
  try {
    const payment = await prisma.payment.findFirst({
      where: { receiptUrl: token },
      select: { userId: true },
    })
    if (!payment) {
      res.status(404).json({ error: 'Receipt not found' })
      return
    }
    const canView =
      payment.userId === req.user!.id || req.user!.permissions.includes('payables.view')
    if (!canView) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const { data, mimeType } = await readEncryptedReceipt(token)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(data)
  } catch (err) {
    console.error(err)
    res.status(404).json({ error: 'Receipt not found' })
  }
})

/** User submits payment proof → pending (balance unchanged until admin accepts). */
payablesRouter.post(
  '/me/pay',
  requireAuth,
  uploadReceiptMemory.single('receipt'),
  async (req, res) => {
    try {
      const amount = Number(req.body.amount)
      const method = String(req.body.method ?? '').trim()
      if (!Number.isFinite(amount) || amount <= 0 || !method) {
        res.status(400).json({ error: 'Invalid payment amount or method' })
        return
      }
      if (!req.file?.buffer) {
        res.status(400).json({ error: 'Payment proof image is required' })
        return
      }

      const settings = await getAppSetting()
      const account = await prisma.payableAccount.findFirst({
        where: { userId: req.user!.id, deletedAt: null },
      })
      const balance = +(account?.balance ?? 0).toFixed(2)
      if (balance <= 0) {
        res.status(400).json({ error: 'Nothing to pay' })
        return
      }

      const pendingList = await prisma.payment.findMany({
        where: { userId: req.user!.id, status: 'pending' },
        orderBy: { createdAt: 'asc' },
      })
      const pendingTotal = +pendingList.reduce((s, p) => s + p.amount, 0).toFixed(2)
      const dueNow = Math.max(0, +(balance - pendingTotal).toFixed(2))
      if (dueNow <= 0) {
        res.status(400).json({
          error:
            'Your outstanding balance is already covered by pending payment requests. Wait for admin review, or add more items first.',
        })
        return
      }

      const requested = Math.min(+amount.toFixed(2), dueNow)
      if (requested <= 0) {
        res.status(400).json({ error: 'Invalid payment amount' })
        return
      }

      const { token } = await saveEncryptedReceipt(req.file.buffer, req.file.mimetype)

      if (!account) {
        res.status(400).json({ error: 'No payable account found' })
        return
      }

      const payment = await prisma.payment.create({
        data: {
          payableAccountId: account.id,
          userId: req.user!.id,
          recordedByUserId: req.user!.id,
          amount: requested,
          balanceBefore: balance,
          balanceAfter: Math.max(0, +(balance - pendingTotal - requested).toFixed(2)),
          note: `Paid via ${method}`,
          paymentMethod: method,
          receiptUrl: token,
          currencyId: settings.currencyId,
          isFullSettlement: +(pendingTotal + requested).toFixed(2) >= balance,
          status: 'pending',
        },
      })

      await notifyAdminsPaymentPending({
        userName: req.user!.name,
        amount: requested,
        method,
      }).catch((err) => console.error(err))

      const allPending = [...pendingList, payment]
      const newPendingTotal = +allPending.reduce((s, p) => s + p.amount, 0).toFixed(2)

      res.json({
        amount: balance,
        totalCharged: +account.totalCharged.toFixed(2),
        totalPaid: +account.totalPaid.toFixed(2),
        pendingTotal: newPendingTotal,
        payableDueNow: Math.max(0, +(balance - newPendingTotal).toFixed(2)),
        pendingPayments: allPending.map(mapPendingPayment),
        pendingPayment: mapPendingPayment(payment),
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not save payment proof' })
    }
  },
)

payablesRouter.get('/', requireAuth, requirePermission('payables.view'), async (_req, res) => {
  const userRole = await prisma.role.findUnique({ where: { code: 'user' } })
  const users = await prisma.user.findMany({
    where: {
      roleId: userRole?.id,
      isActive: true,
      OR: [{ payableAccount: null }, { payableAccount: { deletedAt: null } }],
    },
    orderBy: { name: 'asc' },
    include: {
      payableAccount: {
        include: {
          currency: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      },
    },
  })

  res.json({
    payables: users
      .filter((u) => !u.payableAccount?.deletedAt)
      .map((u) => {
        const payments = u.payableAccount?.payments ?? []
        const pendingList = payments.filter((p) => p.status === 'pending')
        const pending = pendingList[0] ?? null
        const latest = payments[0] ?? null
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          amount: +(u.payableAccount?.balance ?? 0).toFixed(2),
          totalCharged: +(u.payableAccount?.totalCharged ?? 0).toFixed(2),
          totalPaid: +(u.payableAccount?.totalPaid ?? 0).toFixed(2),
          currencyCode: u.payableAccount?.currency.code ?? null,
          updatedAt: u.payableAccount?.updatedAt ?? null,
          paymentMethod: pending?.paymentMethod || latest?.paymentMethod || null,
          receiptUrl: toReceiptViewUrl(pending?.receiptUrl || latest?.receiptUrl),
          paymentStatus: pending?.status || latest?.status || null,
          pendingPayments: pendingList.map(mapPendingPayment),
          pendingPayment: pending ? mapPendingPayment(pending) : null,
        }
      }),
  })
})

payablesRouter.post(
  '/payments/:paymentId/accept',
  requireAuth,
  requirePermission('payables.pay'),
  async (req, res) => {
    const paymentId = paramId(req.params.paymentId)
    const status = String(req.body.status ?? 'paid').trim()
    if (status !== 'paid') {
      res.status(400).json({ error: 'Status must be paid to accept' })
      return
    }

    const settings = await getAppSetting()

    try {
      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } })
        if (!payment || payment.status !== 'pending') {
          throw Object.assign(new Error('Pending payment not found'), { status: 404 })
        }

        const account = await tx.payableAccount.findUnique({
          where: { id: payment.payableAccountId },
        })
        if (!account || account.deletedAt) {
          throw Object.assign(new Error('Payable account not found'), { status: 404 })
        }

        const balanceBefore = +account.balance.toFixed(2)
        const applied = Math.min(+payment.amount.toFixed(2), balanceBefore)
        const balanceAfter = Math.max(0, +(balanceBefore - applied).toFixed(2))

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'paid',
            amount: applied,
            balanceBefore,
            balanceAfter,
            isFullSettlement: balanceAfter === 0 && balanceBefore > 0,
            recordedByUserId: req.user!.id,
            reviewedAt: new Date(),
            rejectionReason: '',
          },
        })

        const updated = await tx.payableAccount.update({
          where: { id: account.id },
          data: {
            balance: balanceAfter,
            totalPaid: { increment: applied },
          },
        })

        return { account: updated, applied, balanceAfter, userId: payment.userId }
      })

      const symbol = settings.currency.symbol
      await createUserNotification({
        userId: result.userId,
        type: 'payment_accepted',
        title: 'Payment accepted',
        message: `Your payment of ${symbol}${result.applied.toFixed(2)} was accepted. Remaining balance: ${symbol}${result.balanceAfter.toFixed(2)}.`,
      })

      await notifyLowStockAfterPayment(result.userId).catch((err) => console.error(err))

      res.json({
        amount: +result.account.balance.toFixed(2),
        totalCharged: +result.account.totalCharged.toFixed(2),
        totalPaid: +result.account.totalPaid.toFixed(2),
      })
    } catch (err) {
      const statusCode = (err as { status?: number }).status ?? 500
      const message = err instanceof Error ? err.message : 'Accept failed'
      if (statusCode === 500) console.error(err)
      res.status(statusCode).json({ error: message })
    }
  },
)

payablesRouter.post(
  '/payments/:paymentId/reject',
  requireAuth,
  requirePermission('payables.pay'),
  async (req, res) => {
    const paymentId = paramId(req.params.paymentId)
    const status = String(req.body.status ?? 'rejected').trim()
    const reason = String(req.body.reason ?? '').trim()
    if (status !== 'rejected') {
      res.status(400).json({ error: 'Status must be rejected' })
      return
    }
    if (!reason) {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== 'pending') {
      res.status(404).json({ error: 'Pending payment not found' })
      return
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        recordedByUserId: req.user!.id,
        reviewedAt: new Date(),
      },
    })

    const settings = await getAppSetting()
    const symbol = settings.currency.symbol
    await createUserNotification({
      userId: payment.userId,
      type: 'payment_rejected',
      title: 'Payment request rejected',
      message: `Your payment request of ${symbol}${payment.amount.toFixed(2)} was rejected by admin. Reason: ${reason}. Your payable balance is unchanged.`,
    })

    const account = await prisma.payableAccount.findUnique({
      where: { id: payment.payableAccountId },
    })

    res.json({
      amount: +(account?.balance ?? 0).toFixed(2),
      totalCharged: +(account?.totalCharged ?? 0).toFixed(2),
      totalPaid: +(account?.totalPaid ?? 0).toFixed(2),
    })
  },
)

payablesRouter.delete(
  '/:userId',
  requireAuth,
  requirePermission('payables.pay'),
  async (req, res) => {
    const userId = paramId(req.params.userId)
    const account = await prisma.payableAccount.findFirst({
      where: { userId, deletedAt: null },
    })
    if (!account) {
      res.status(404).json({ error: 'Payable entry not found' })
      return
    }

    const now = new Date()
    const deletedByName = req.user!.name
    const deletedByUserId = req.user!.id

    await prisma.$transaction([
      prisma.payableAccount.update({
        where: { id: account.id },
        data: { deletedAt: now, deletedByUserId, deletedByName },
      }),
      prisma.itemCharge.updateMany({
        where: { payableAccountId: account.id, deletedAt: null },
        data: { deletedAt: now, deletedByUserId, deletedByName },
      }),
    ])

    res.json({ ok: true })
  },
)

const paySchema = z.object({
  amount: z.number().finite().positive(),
  note: z.string().trim().max(200).optional(),
})

payablesRouter.post('/:userId/pay', requireAuth, requirePermission('payables.pay'), async (req, res) => {
  const parsed = paySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payment amount' })
    return
  }

  const userId = paramId(req.params.userId)
  const user = await prisma.user.findFirst({
    where: { id: userId, role: { code: 'user' } },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const result = await applyPayment({
    userId,
    amount: parsed.data.amount,
    note: parsed.data.note || 'Payment',
    paymentMethod: parsed.data.note?.trim() || 'Admin payment',
    recordedByUserId: req.user!.id,
    notify: true,
  })

  res.json({
    amount: +result.balance.toFixed(2),
    totalCharged: +result.totalCharged.toFixed(2),
    totalPaid: +result.totalPaid.toFixed(2),
  })
})

payablesRouter.post('/:userId/mark-paid', requireAuth, requirePermission('payables.pay'), async (req, res) => {
  const userId = paramId(req.params.userId)
  const user = await prisma.user.findFirst({
    where: { id: userId, role: { code: 'user' } },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const account = await prisma.payableAccount.findUnique({ where: { userId } })
  const balance = +(account?.balance ?? 0).toFixed(2)
  if (balance <= 0) {
    res.json({
      amount: 0,
      totalCharged: +(account?.totalCharged ?? 0).toFixed(2),
      totalPaid: +(account?.totalPaid ?? 0).toFixed(2),
    })
    return
  }

  const result = await applyPayment({
    userId,
    amount: balance,
    note: 'Marked fully paid',
    paymentMethod: 'Admin settlement',
    recordedByUserId: req.user!.id,
    notify: true,
  })

  res.json({
    amount: +result.balance.toFixed(2),
    totalCharged: +result.totalCharged.toFixed(2),
    totalPaid: +result.totalPaid.toFixed(2),
  })
})
