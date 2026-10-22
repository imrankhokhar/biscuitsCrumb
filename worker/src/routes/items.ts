import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import { fileOf, putUpload, readForm } from '../r2.js'
import { HttpError, errorResponse, getAppSetting } from '../util.js'

export const itemsRoutes = new Hono<AppEnv>()

function canSeeBuyingPrice(permissions: string[]) {
  return ['items.manage', 'items.create', 'items.update', 'accountability.view'].some((p) =>
    permissions.includes(p),
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

function parseItemBody(form: FormData) {
  return z
    .object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional(),
      price: z.coerce.number().finite().min(0),
      buyingPrice: z.coerce.number().finite().min(0),
      quantity: z.coerce.number().int().min(0),
    })
    .safeParse(Object.fromEntries(form))
}

itemsRoutes.get('/', requireAuth, requirePermission('items.view'), async (c) => {
  const includeBuying = canSeeBuyingPrice(c.get('user').permissions)
  const items = await c.get('prisma').item.findMany({
    where: { isActive: true },
    include: { currency: true },
    orderBy: { createdAt: 'desc' },
  })
  return c.json({ items: items.map((item) => mapItem(item, includeBuying)) })
})

itemsRoutes.post('/', requireAuth, requirePermission('items.create'), async (c) => {
  const prisma = c.get('prisma')
  const form = await readForm(c)
  const image = fileOf(form, 'image', { image: true })
  const parsed = parseItemBody(form)
  if (!parsed.success) return c.json({ error: 'Invalid item fields' }, 400)
  if (!image) return c.json({ error: 'Image file is required' }, 400)

  const settings = await getAppSetting(prisma)
  const item = await prisma.item.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? '',
      price: parsed.data.price,
      buyingPrice: parsed.data.buyingPrice,
      quantity: parsed.data.quantity,
      imageUrl: await putUpload(c.env.UPLOADS, image),
      currencyId: settings.currencyId,
      createdByUserId: c.get('user').id,
    },
    include: { currency: true },
  })
  return c.json({ item: mapItem(item, true) }, 201)
})

itemsRoutes.put('/:id', requireAuth, requirePermission('items.update'), async (c) => {
  const prisma = c.get('prisma')
  const form = await readForm(c)
  const image = fileOf(form, 'image', { image: true })
  const parsed = parseItemBody(form)
  if (!parsed.success) return c.json({ error: 'Invalid item fields' }, 400)

  const settings = await getAppSetting(prisma)
  const existing = await prisma.item.findUnique({ where: { id: c.req.param('id') } })
  if (!existing) return c.json({ error: 'Item not found' }, 404)

  const item = await prisma.item.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? '',
      price: parsed.data.price,
      buyingPrice: parsed.data.buyingPrice,
      quantity: parsed.data.quantity,
      imageUrl: image ? await putUpload(c.env.UPLOADS, image) : existing.imageUrl,
      currencyId: settings.currencyId,
    },
    include: { currency: true },
  })
  return c.json({ item: mapItem(item, true) })
})

itemsRoutes.delete('/:id', requireAuth, requirePermission('items.delete'), async (c) => {
  try {
    await c.get('prisma').item.update({ where: { id: c.req.param('id') }, data: { isActive: false } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Item not found' }, 404)
  }
})

/** Active cart: unpaid charges that make up the current payable balance (newest first). */
itemsRoutes.get('/charges/open', requireAuth, requirePermission('items.charge'), async (c) => {
  const prisma = c.get('prisma')
  const userId = c.get('user').id
  const account = await prisma.payableAccount.findFirst({ where: { userId, deletedAt: null } })
  const balance = +(account?.balance ?? 0).toFixed(2)
  if (balance <= 0) return c.json({ charges: [] })

  // Cap scan: newest-first until balance covered (open cart ≪ lifetime history)
  const charges = await prisma.itemCharge.findMany({
    where: { userId, deletedAt: null },
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

  return c.json({
    charges: open.map((ch) => ({
      id: ch.id,
      itemId: ch.itemId,
      amount: +ch.amount.toFixed(2),
      itemTitle: ch.itemTitle,
      createdAt: ch.createdAt,
    })),
  })
})

function payableJson(p: { userId: string; balance: number; totalCharged: number; totalPaid: number }) {
  return {
    userId: p.userId,
    amount: +p.balance.toFixed(2),
    totalCharged: +p.totalCharged.toFixed(2),
    totalPaid: +p.totalPaid.toFixed(2),
  }
}

// ponytail: Prisma's D1 adapter runs $transaction as individual queries (D1 has no interactive transactions), so
// charge/undo are NOT atomic. The stock decrement below is a single guarded UPDATE, so stock can never go negative
// under concurrency; a failure *between* statements can still leave a half-applied charge.
// Upgrade path: rewrite as env.DB.batch([...raw prepared statements]), which D1 runs atomically.
itemsRoutes.post('/:id/charge', requireAuth, requirePermission('items.charge'), async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  const itemId = c.req.param('id')
  const settings = await getAppSetting(prisma)

  try {
    const item = await prisma.item.findFirst({
      where: { id: itemId, isActive: true },
      include: { currency: true },
    })
    if (!item) throw new HttpError(404, 'Item not found')
    if (item.quantity <= 0) throw new HttpError(400, 'Item is out of stock')

    const taken = await prisma.item.updateMany({
      where: { id: item.id, quantity: { gt: 0 } },
      data: { quantity: { decrement: 1 } },
    })
    if (taken.count === 0) throw new HttpError(400, 'Item is out of stock')

    const account = await prisma.payableAccount.upsert({
      where: { userId: me.id },
      create: { userId: me.id, currencyId: settings.currencyId, balance: 0, totalCharged: 0, totalPaid: 0 },
      update: { deletedAt: null, deletedByUserId: null, deletedByName: '' },
    })
    const charge = await prisma.itemCharge.create({
      data: {
        payableAccountId: account.id,
        userId: me.id,
        itemId: item.id,
        itemTitle: item.title,
        amount: item.price,
        costAmount: item.buyingPrice,
        currencyId: settings.currencyId,
      },
    })
    const payable = await prisma.payableAccount.update({
      where: { id: account.id },
      data: {
        balance: { increment: item.price },
        totalCharged: { increment: item.price },
        currencyId: settings.currencyId,
      },
    })

    return c.json({
      payable: payableJson(payable),
      chargeId: charge.id,
      item: mapItem({ ...item, quantity: item.quantity - 1 }, canSeeBuyingPrice(me.permissions)),
    })
  } catch (err) {
    return errorResponse(c, err, 'Charge failed')
  }
})

/** Undo a mistaken charge — restores stock and reduces payable. */
itemsRoutes.post('/charges/:chargeId/undo', requireAuth, requirePermission('items.charge'), async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  const settings = await getAppSetting(prisma)

  try {
    const charge = await prisma.itemCharge.findFirst({
      where: { id: c.req.param('chargeId'), userId: me.id, deletedAt: null },
    })
    if (!charge) throw new HttpError(404, 'Charge not found')

    const pendingList = await prisma.payment.findMany({
      where: { userId: me.id, status: 'pending' },
      select: { amount: true },
    })
    const pendingTotal = +pendingList.reduce((s, p) => s + p.amount, 0).toFixed(2)
    if (pendingTotal > 0) {
      // Oldest charges covering pending totals are locked; newer adds can still be unselected.
      const openCharges = await prisma.itemCharge.findMany({
        where: { userId: me.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 500,
        select: { id: true, amount: true },
      })
      let remaining = pendingTotal
      const locked = new Set<string>()
      for (const ch of openCharges) {
        if (remaining <= 0) break
        locked.add(ch.id)
        remaining = +(remaining - ch.amount).toFixed(2)
      }
      if (locked.has(charge.id)) {
        throw new HttpError(
          400,
          'This item is covered by a pending payment request and cannot be unselected until admin accepts or rejects it.',
        )
      }
    }

    const account = await prisma.payableAccount.findUnique({ where: { userId: me.id } })
    if (!account || account.deletedAt) throw new HttpError(404, 'Payable account not found')

    // Claim the charge first (guarded on deletedAt) so a double-click can't restore stock twice.
    const claimed = await prisma.itemCharge.updateMany({
      where: { id: charge.id, deletedAt: null },
      data: { deletedAt: new Date(), deletedByUserId: me.id, deletedByName: me.name },
    })
    if (claimed.count === 0) throw new HttpError(404, 'Charge not found')

    await prisma.item.update({ where: { id: charge.itemId }, data: { quantity: { increment: 1 } } })
    const payable = await prisma.payableAccount.update({
      where: { id: account.id },
      data: {
        balance: Math.max(0, +(account.balance - charge.amount).toFixed(2)),
        totalCharged: Math.max(0, +(account.totalCharged - charge.amount).toFixed(2)),
        currencyId: settings.currencyId,
      },
    })
    const item = await prisma.item.findUniqueOrThrow({
      where: { id: charge.itemId },
      include: { currency: true },
    })

    return c.json({
      payable: payableJson(payable),
      item: mapItem(item, canSeeBuyingPrice(me.permissions)),
      itemTitle: charge.itemTitle,
    })
  } catch (err) {
    return errorResponse(c, err, 'Undo failed')
  }
})
