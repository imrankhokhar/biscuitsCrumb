import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import type { PrismaClient } from '../prisma.js'
import { fileOf, readForm } from '../r2.js'
import { readEncryptedReceipt, saveEncryptedReceipt, toReceiptViewUrl } from '../receipts.js'
import {
  HttpError,
  createUserNotification,
  errorResponse,
  getAppSetting,
  jsonBody,
  notifyLowStockAfterPayment,
} from '../util.js'

export const payablesRoutes = new Hono<AppEnv>()

// ponytail: D1's Prisma adapter runs $transaction as separate queries (not atomic) — see items.ts. Concurrent
// double-accept of one pending payment is possible; upgrade path is env.DB.batch with raw SQL.

async function notifyAdminsPaymentPending(
  prisma: PrismaClient,
  input: { userName: string; amount: number; method: string },
) {
  const settings = await getAppSetting(prisma)
  const symbol = settings.currency.symbol
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { code: 'admin' } },
    select: { id: true },
  })
  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: 'payment_pending',
      title: 'Payment request pending',
      message: `${input.userName} submitted a payment of ${symbol}${input.amount.toFixed(2)} via ${input.method}. Review it in Payables.`,
    })),
  })
}

/** Admin / settlement: apply paid amount immediately. */
async function applyPayment(
  prisma: PrismaClient,
  input: {
    userId: string
    amount: number
    note: string
    paymentMethod?: string
    receiptUrl?: string
    recordedByUserId: string
    notify: boolean
  },
) {
  const settings = await getAppSetting(prisma)
  const paid = +input.amount.toFixed(2)

  const account = await prisma.payableAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, currencyId: settings.currencyId, balance: 0, totalCharged: 0, totalPaid: 0 },
    update: { deletedAt: null, deletedByUserId: null, deletedByName: '' },
  })

  const balanceBefore = +account.balance.toFixed(2)
  const balanceAfter = Math.max(0, +(balanceBefore - paid).toFixed(2))
  const applied = +(balanceBefore - balanceAfter).toFixed(2)
  if (applied <= 0) return account

  await prisma.payment.create({
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
  const updated = await prisma.payableAccount.update({
    where: { id: account.id },
    data: { balance: balanceAfter, totalPaid: { increment: applied }, currencyId: settings.currencyId },
  })

  if (input.notify) {
    const symbol = settings.currency.symbol
    await createUserNotification(prisma, {
      userId: input.userId,
      type: 'payment_received',
      title: 'Payment received',
      message: `A payment of ${symbol}${applied.toFixed(2)} was recorded. Remaining balance: ${symbol}${balanceAfter.toFixed(2)}.`,
    })
  }
  await notifyLowStockAfterPayment(prisma, input.userId).catch((err) => console.error(err))
  return updated
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

payablesRoutes.get('/me', requireAuth, async (c) => {
  const prisma = c.get('prisma')
  const userId = c.get('user').id
  const account = await prisma.payableAccount.findFirst({ where: { userId, deletedAt: null } })
  const pendingList = await prisma.payment.findMany({
    where: { userId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  const pendingTotal = +pendingList.reduce((s, p) => s + p.amount, 0).toFixed(2)
  const balance = +(account?.balance ?? 0).toFixed(2)
  return c.json({
    amount: balance,
    totalCharged: +(account?.totalCharged ?? 0).toFixed(2),
    totalPaid: +(account?.totalPaid ?? 0).toFixed(2),
    pendingTotal,
    payableDueNow: Math.max(0, +(balance - pendingTotal).toFixed(2)),
    pendingPayments: pendingList.map(mapPendingPayment),
    pendingPayment: pendingList[0] ? mapPendingPayment(pendingList[0]) : null,
  })
})

payablesRoutes.get('/receipt/:token', requireAuth, async (c) => {
  const token = c.req.param('token')
  const me = c.get('user')
  try {
    const payment = await c.get('prisma').payment.findFirst({
      where: { receiptUrl: token },
      select: { userId: true },
    })
    if (!payment) return c.json({ error: 'Receipt not found' }, 404)
    if (payment.userId !== me.id && !me.permissions.includes('payables.view')) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    const { data, mimeType } = await readEncryptedReceipt(
      c.env.UPLOADS,
      c.env.RECEIPT_ENCRYPTION_KEY || c.env.JWT_SECRET,
      token,
    )
    return c.body(data, 200, { 'Content-Type': mimeType, 'Cache-Control': 'private, no-store' })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Receipt not found' }, 404)
  }
})

/** User submits payment proof → pending (balance unchanged until admin accepts). */
payablesRoutes.post('/me/pay', requireAuth, async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  try {
    const form = await readForm(c)
    const amount = Number(form.get('amount'))
    const method = String(form.get('method') ?? '').trim()
    if (!Number.isFinite(amount) || amount <= 0 || !method) {
      return c.json({ error: 'Invalid payment amount or method' }, 400)
    }
    const receipt = fileOf(form, 'receipt', { image: true })
    if (!receipt) return c.json({ error: 'Payment proof image is required' }, 400)

    const settings = await getAppSetting(prisma)
    const account = await prisma.payableAccount.findFirst({ where: { userId: me.id, deletedAt: null } })
    const balance = +(account?.balance ?? 0).toFixed(2)
    if (!account || balance <= 0) {
      return c.json({ error: balance <= 0 ? 'Nothing to pay' : 'No payable account found' }, 400)
    }

    const pendingList = await prisma.payment.findMany({
      where: { userId: me.id, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    })
    const pendingTotal = +pendingList.reduce((s, p) => s + p.amount, 0).toFixed(2)
    const dueNow = Math.max(0, +(balance - pendingTotal).toFixed(2))
    if (dueNow <= 0) {
      return c.json(
        {
          error:
            'Your outstanding balance is already covered by pending payment requests. Wait for admin review, or add more items first.',
        },
        400,
      )
    }
    const requested = Math.min(+amount.toFixed(2), dueNow)
    if (requested <= 0) return c.json({ error: 'Invalid payment amount' }, 400)

    const { token } = await saveEncryptedReceipt(
      c.env.UPLOADS,
      c.env.RECEIPT_ENCRYPTION_KEY || c.env.JWT_SECRET,
      new Uint8Array(await receipt.arrayBuffer()),
      receipt.type,
    )

    const payment = await prisma.payment.create({
      data: {
        payableAccountId: account.id,
        userId: me.id,
        recordedByUserId: me.id,
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

    await notifyAdminsPaymentPending(prisma, { userName: me.name, amount: requested, method }).catch((err) =>
      console.error(err),
    )

    const allPending = [...pendingList, payment]
    const newPendingTotal = +allPending.reduce((s, p) => s + p.amount, 0).toFixed(2)
    return c.json({
      amount: balance,
      totalCharged: +account.totalCharged.toFixed(2),
      totalPaid: +account.totalPaid.toFixed(2),
      pendingTotal: newPendingTotal,
      payableDueNow: Math.max(0, +(balance - newPendingTotal).toFixed(2)),
      pendingPayments: allPending.map(mapPendingPayment),
      pendingPayment: mapPendingPayment(payment),
    })
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(c, err)
    console.error(err)
    return c.json({ error: 'Could not save payment proof' }, 500)
  }
})

payablesRoutes.get('/', requireAuth, requirePermission('payables.view'), async (c) => {
  const prisma = c.get('prisma')
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
        include: { currency: true, payments: { orderBy: { createdAt: 'desc' }, take: 20 } },
      },
    },
  })

  return c.json({
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

payablesRoutes.post('/payments/:paymentId/accept', requireAuth, requirePermission('payables.pay'), async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  const paymentId = c.req.param('paymentId')
  const body = await jsonBody(c)
  if (String(body.status ?? 'paid').trim() !== 'paid') {
    return c.json({ error: 'Status must be paid to accept' }, 400)
  }

  try {
    const settings = await getAppSetting(prisma)
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.status !== 'pending') throw new HttpError(404, 'Pending payment not found')

    const account = await prisma.payableAccount.findUnique({ where: { id: payment.payableAccountId } })
    if (!account || account.deletedAt) throw new HttpError(404, 'Payable account not found')

    const balanceBefore = +account.balance.toFixed(2)
    const applied = Math.min(+payment.amount.toFixed(2), balanceBefore)
    const balanceAfter = Math.max(0, +(balanceBefore - applied).toFixed(2))

    // Claim guarded on status so two admins can't both apply the same payment.
    const claimed = await prisma.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: {
        status: 'paid',
        amount: applied,
        balanceBefore,
        balanceAfter,
        isFullSettlement: balanceAfter === 0 && balanceBefore > 0,
        recordedByUserId: me.id,
        reviewedAt: new Date(),
        rejectionReason: '',
      },
    })
    if (claimed.count === 0) throw new HttpError(404, 'Pending payment not found')

    const updated = await prisma.payableAccount.update({
      where: { id: account.id },
      data: { balance: balanceAfter, totalPaid: { increment: applied } },
    })

    const symbol = settings.currency.symbol
    await createUserNotification(prisma, {
      userId: payment.userId,
      type: 'payment_accepted',
      title: 'Payment accepted',
      message: `Your payment of ${symbol}${applied.toFixed(2)} was accepted. Remaining balance: ${symbol}${balanceAfter.toFixed(2)}.`,
    })
    await notifyLowStockAfterPayment(prisma, payment.userId).catch((err) => console.error(err))

    return c.json({
      amount: +updated.balance.toFixed(2),
      totalCharged: +updated.totalCharged.toFixed(2),
      totalPaid: +updated.totalPaid.toFixed(2),
    })
  } catch (err) {
    return errorResponse(c, err, 'Accept failed')
  }
})

payablesRoutes.post('/payments/:paymentId/reject', requireAuth, requirePermission('payables.pay'), async (c) => {
  const prisma = c.get('prisma')
  const body = await jsonBody(c)
  const status = String(body.status ?? 'rejected').trim()
  const reason = String(body.reason ?? '').trim()
  if (status !== 'rejected') return c.json({ error: 'Status must be rejected' }, 400)
  if (!reason) return c.json({ error: 'Rejection reason is required' }, 400)

  const payment = await prisma.payment.findUnique({ where: { id: c.req.param('paymentId') } })
  if (!payment || payment.status !== 'pending') return c.json({ error: 'Pending payment not found' }, 404)

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'rejected', rejectionReason: reason, recordedByUserId: c.get('user').id, reviewedAt: new Date() },
  })

  const symbol = (await getAppSetting(prisma)).currency.symbol
  await createUserNotification(prisma, {
    userId: payment.userId,
    type: 'payment_rejected',
    title: 'Payment request rejected',
    message: `Your payment request of ${symbol}${payment.amount.toFixed(2)} was rejected by admin. Reason: ${reason}. Your payable balance is unchanged.`,
  })

  const account = await prisma.payableAccount.findUnique({ where: { id: payment.payableAccountId } })
  return c.json({
    amount: +(account?.balance ?? 0).toFixed(2),
    totalCharged: +(account?.totalCharged ?? 0).toFixed(2),
    totalPaid: +(account?.totalPaid ?? 0).toFixed(2),
  })
})

payablesRoutes.delete('/:userId', requireAuth, requirePermission('payables.pay'), async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  const account = await prisma.payableAccount.findFirst({ where: { userId: c.req.param('userId'), deletedAt: null } })
  if (!account) return c.json({ error: 'Payable entry not found' }, 404)

  const data = { deletedAt: new Date(), deletedByUserId: me.id, deletedByName: me.name }
  await prisma.payableAccount.update({ where: { id: account.id }, data })
  await prisma.itemCharge.updateMany({ where: { payableAccountId: account.id, deletedAt: null }, data })
  return c.json({ ok: true })
})

const paySchema = z.object({
  amount: z.number().finite().positive(),
  note: z.string().trim().max(200).optional(),
})

payablesRoutes.post('/:userId/pay', requireAuth, requirePermission('payables.pay'), async (c) => {
  const prisma = c.get('prisma')
  const parsed = paySchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid payment amount' }, 400)

  const userId = c.req.param('userId')
  const user = await prisma.user.findFirst({ where: { id: userId, role: { code: 'user' } } })
  if (!user) return c.json({ error: 'User not found' }, 404)

  const result = await applyPayment(prisma, {
    userId,
    amount: parsed.data.amount,
    note: parsed.data.note || 'Payment',
    paymentMethod: parsed.data.note?.trim() || 'Admin payment',
    recordedByUserId: c.get('user').id,
    notify: true,
  })
  return c.json({
    amount: +result.balance.toFixed(2),
    totalCharged: +result.totalCharged.toFixed(2),
    totalPaid: +result.totalPaid.toFixed(2),
  })
})

payablesRoutes.post('/:userId/mark-paid', requireAuth, requirePermission('payables.pay'), async (c) => {
  const prisma = c.get('prisma')
  const userId = c.req.param('userId')
  const user = await prisma.user.findFirst({ where: { id: userId, role: { code: 'user' } } })
  if (!user) return c.json({ error: 'User not found' }, 404)

  const account = await prisma.payableAccount.findUnique({ where: { userId } })
  const balance = +(account?.balance ?? 0).toFixed(2)
  if (balance <= 0) {
    return c.json({
      amount: 0,
      totalCharged: +(account?.totalCharged ?? 0).toFixed(2),
      totalPaid: +(account?.totalPaid ?? 0).toFixed(2),
    })
  }

  const result = await applyPayment(prisma, {
    userId,
    amount: balance,
    note: 'Marked fully paid',
    paymentMethod: 'Admin settlement',
    recordedByUserId: c.get('user').id,
    notify: true,
  })
  return c.json({
    amount: +result.balance.toFixed(2),
    totalCharged: +result.totalCharged.toFixed(2),
    totalPaid: +result.totalPaid.toFixed(2),
  })
})
