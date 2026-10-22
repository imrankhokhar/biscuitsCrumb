import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { getAppSetting } from '../lib/settings.js'
import { uploadImage } from '../lib/upload.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'

export const itemsRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

function canSeeBuyingPrice(permissions: string[]) {
  return (
    permissions.includes('items.manage') ||
    permissions.includes('items.create') ||
    permissions.includes('items.update') ||
    permissions.includes('accountability.view')
  )
}

function mapItem(
  item: {
    id: string
    title: string
    description: string
    price: number
    buyingPrice: number
    quantity: number
    imageUrl: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    currency: { code: string; symbol: string }
  },
  includeBuyingPrice: boolean,
) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    price: item.price,
    sellingPrice: item.price,
    ...(includeBuyingPrice ? { buyingPrice: item.buyingPrice } : {}),
    quantity: item.quantity,
    imageUrl: item.imageUrl,
    isActive: item.isActive,
    currencyCode: item.currency.code,
    currencySymbol: item.currency.symbol,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function parseItemBody(body: Record<string, unknown>) {
  return z
    .object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional(),
      price: z.coerce.number().finite().min(0),
      buyingPrice: z.coerce.number().finite().min(0),
      quantity: z.coerce.number().int().min(0),
    })
    .safeParse(body)
}

itemsRouter.get('/', requireAuth, requirePermission('items.view'), async (req, res) => {
  const includeBuying = canSeeBuyingPrice(req.user!.permissions)
  const items = await prisma.item.findMany({
    where: { isActive: true },
    include: { currency: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ items: items.map((item) => mapItem(item, includeBuying)) })
})

itemsRouter.post(
  '/',
  requireAuth,
  requirePermission('items.create'),
  uploadImage.single('image'),
  async (req, res) => {
    const parsed = parseItemBody(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid item fields' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required' })
      return
    }
    const settings = await getAppSetting()
    const imageUrl = `/uploads/${req.file.filename}`
    const item = await prisma.item.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? '',
        price: parsed.data.price,
        buyingPrice: parsed.data.buyingPrice,
        quantity: parsed.data.quantity,
        imageUrl,
        currencyId: settings.currencyId,
        createdByUserId: req.user!.id,
      },
      include: { currency: true },
    })
    res.status(201).json({ item: mapItem(item, true) })
  },
)

itemsRouter.put(
  '/:id',
  requireAuth,
  requirePermission('items.update'),
  uploadImage.single('image'),
  async (req, res) => {
    const parsed = parseItemBody(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid item fields' })
      return
    }
    const settings = await getAppSetting()
    try {
      const existing = await prisma.item.findUnique({ where: { id: paramId(req.params.id) } })
      if (!existing) {
        res.status(404).json({ error: 'Item not found' })
        return
      }
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : existing.imageUrl
      const item = await prisma.item.update({
        where: { id: existing.id },
        data: {
          title: parsed.data.title,
          description: parsed.data.description ?? '',
          price: parsed.data.price,
          buyingPrice: parsed.data.buyingPrice,
          quantity: parsed.data.quantity,
          imageUrl,
          currencyId: settings.currencyId,
        },
        include: { currency: true },
      })
      res.json({ item: mapItem(item, true) })
    } catch {
      res.status(404).json({ error: 'Item not found' })
    }
  },
)

itemsRouter.delete(
  '/:id',
  requireAuth,
  requirePermission('items.delete'),
  async (req, res) => {
    try {
      await prisma.item.update({
        where: { id: paramId(req.params.id) },
        data: { isActive: false },
      })
      res.json({ ok: true })
    } catch {
      res.status(404).json({ error: 'Item not found' })
    }
  },
)

/** Active cart: unpaid charges that make up the current payable balance (newest first). */
itemsRouter.get('/charges/open', requireAuth, requirePermission('items.charge'), async (req, res) => {
  const account = await prisma.payableAccount.findFirst({
    where: { userId: req.user!.id, deletedAt: null },
  })
  const balance = +(account?.balance ?? 0).toFixed(2)
  if (balance <= 0) {
    res.json({ charges: [] })
    return
  }

  // Cap scan: newest-first until balance covered (open cart ≪ lifetime history)
  const charges = await prisma.itemCharge.findMany({
    where: { userId: req.user!.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, itemId: true, amount: true, itemTitle: true, createdAt: true },
  })

  const open: typeof charges = []
  let remaining = balance
  for (const charge of charges) {
    if (remaining <= 0) break
    open.push(charge)
    remaining = +(remaining - charge.amount).toFixed(2)
  }

  // Oldest-first so client stacks pop newest on unselect
  open.reverse()

  res.json({
    charges: open.map((c) => ({
      id: c.id,
      itemId: c.itemId,
      amount: +c.amount.toFixed(2),
      itemTitle: c.itemTitle,
      createdAt: c.createdAt,
    })),
  })
})

itemsRouter.post(
  '/:id/charge',
  requireAuth,
  requirePermission('items.charge'),
  async (req, res) => {
    const itemId = paramId(req.params.id)
    const settings = await getAppSetting()

    try {
      const result = await prisma.$transaction(async (tx) => {
        const item = await tx.item.findFirst({
          where: { id: itemId, isActive: true },
          include: { currency: true },
        })
        if (!item) {
          throw Object.assign(new Error('Item not found'), { status: 404 })
        }
        if (item.quantity <= 0) {
          throw Object.assign(new Error('Item is out of stock'), { status: 400 })
        }

        const nextQty = item.quantity - 1

        const account = await tx.payableAccount.upsert({
          where: { userId: req.user!.id },
          create: {
            userId: req.user!.id,
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

        const charge = await tx.itemCharge.create({
          data: {
            payableAccountId: account.id,
            userId: req.user!.id,
            itemId: item.id,
            itemTitle: item.title,
            amount: item.price,
            costAmount: item.buyingPrice,
            currencyId: settings.currencyId,
          },
        })

        await tx.item.update({
          where: { id: item.id },
          data: { quantity: nextQty },
        })

        const payable = await tx.payableAccount.update({
          where: { id: account.id },
          data: {
            balance: { increment: item.price },
            totalCharged: { increment: item.price },
            currencyId: settings.currencyId,
          },
        })

        return {
          payable,
          item: { ...item, quantity: nextQty },
          chargeId: charge.id,
        }
      })

      res.json({
        payable: {
          userId: result.payable.userId,
          amount: +result.payable.balance.toFixed(2),
          totalCharged: +result.payable.totalCharged.toFixed(2),
          totalPaid: +result.payable.totalPaid.toFixed(2),
        },
        chargeId: result.chargeId,
        item: mapItem(
          { ...result.item, quantity: result.item.quantity },
          canSeeBuyingPrice(req.user!.permissions),
        ),
      })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      const message = err instanceof Error ? err.message : 'Charge failed'
      if (status === 500) console.error(err)
      res.status(status).json({ error: message })
    }
  },
)

/** Undo a mistaken charge — restores stock and reduces payable. */
itemsRouter.post(
  '/charges/:chargeId/undo',
  requireAuth,
  requirePermission('items.charge'),
  async (req, res) => {
    const chargeId = paramId(req.params.chargeId)
    const settings = await getAppSetting()

    try {
      const result = await prisma.$transaction(async (tx) => {
        const charge = await tx.itemCharge.findFirst({
          where: { id: chargeId, userId: req.user!.id, deletedAt: null },
        })
        if (!charge) {
          throw Object.assign(new Error('Charge not found'), { status: 404 })
        }

        const pendingList = await tx.payment.findMany({
          where: { userId: req.user!.id, status: 'pending' },
          select: { amount: true },
        })
        const pendingTotal = +pendingList.reduce((s, p) => s + p.amount, 0).toFixed(2)
        if (pendingTotal > 0) {
          // Oldest charges covering pending totals are locked; newer adds can still be unselected.
          const openCharges = await tx.itemCharge.findMany({
            where: { userId: req.user!.id, deletedAt: null },
            orderBy: { createdAt: 'asc' },
            take: 500,
            select: { id: true, amount: true },
          })
          let remaining = pendingTotal
          const locked = new Set<string>()
          for (const c of openCharges) {
            if (remaining <= 0) break
            locked.add(c.id)
            remaining = +(remaining - c.amount).toFixed(2)
          }
          if (locked.has(charge.id)) {
            throw Object.assign(
              new Error(
                'This item is covered by a pending payment request and cannot be unselected until admin accepts or rejects it.',
              ),
              { status: 400 },
            )
          }
        }

        const account = await tx.payableAccount.findUnique({
          where: { userId: req.user!.id },
        })
        if (!account || account.deletedAt) {
          throw Object.assign(new Error('Payable account not found'), { status: 404 })
        }

        await tx.itemCharge.update({
          where: { id: charge.id },
          data: {
            deletedAt: new Date(),
            deletedByUserId: req.user!.id,
            deletedByName: req.user!.name,
          },
        })

        await tx.item.update({
          where: { id: charge.itemId },
          data: { quantity: { increment: 1 } },
        })

        const payable = await tx.payableAccount.update({
          where: { id: account.id },
          data: {
            balance: Math.max(0, +(account.balance - charge.amount).toFixed(2)),
            totalCharged: Math.max(0, +(account.totalCharged - charge.amount).toFixed(2)),
            currencyId: settings.currencyId,
          },
        })

        const item = await tx.item.findUniqueOrThrow({
          where: { id: charge.itemId },
          include: { currency: true },
        })

        return { payable, item, itemTitle: charge.itemTitle }
      })

      res.json({
        payable: {
          userId: result.payable.userId,
          amount: +result.payable.balance.toFixed(2),
          totalCharged: +result.payable.totalCharged.toFixed(2),
          totalPaid: +result.payable.totalPaid.toFixed(2),
        },
        item: mapItem(result.item, canSeeBuyingPrice(req.user!.permissions)),
        itemTitle: result.itemTitle,
      })
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500
      const message = err instanceof Error ? err.message : 'Undo failed'
      if (status === 500) console.error(err)
      res.status(status).json({ error: message })
    }
  },
)
