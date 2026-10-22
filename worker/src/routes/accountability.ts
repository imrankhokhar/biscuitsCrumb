import { Hono } from 'hono'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'

export const accountabilityRoutes = new Hono<AppEnv>()

accountabilityRoutes.get('/', requireAuth, requirePermission('accountability.view'), async (c) => {
  const prisma = c.get('prisma')
  // groupBy = 1 row per item sold, not 1 row per charge (huge read savings)
  const [chargeAgg, accounts, items] = await Promise.all([
    prisma.itemCharge.groupBy({
      by: ['itemId', 'itemTitle'],
      where: { deletedAt: null },
      _sum: { amount: true, costAmount: true },
      _count: { _all: true },
    }),
    prisma.payableAccount.findMany({
      where: { deletedAt: null },
      select: { balance: true, totalCharged: true, totalPaid: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      select: { id: true, title: true, quantity: true, price: true, buyingPrice: true },
      orderBy: { title: 'asc' },
    }),
  ])

  let totalRevenue = 0
  let totalCost = 0
  let unitsSold = 0
  const byItem = new Map<string, { soldQty: number; revenue: number; cost: number }>()

  for (const row of chargeAgg) {
    const revenue = row._sum.amount ?? 0
    const cost = row._sum.costAmount ?? 0
    const soldQty = row._count._all
    totalRevenue += revenue
    totalCost += cost
    unitsSold += soldQty
    byItem.set(row.itemId, { soldQty, revenue, cost })
  }

  const receivables = accounts.reduce((s, a) => s + a.balance, 0)
  const totalCollected = accounts.reduce((s, a) => s + a.totalPaid, 0)
  const inventoryCostValue = items.reduce((s, i) => s + i.quantity * i.buyingPrice, 0)
  const inventorySellValue = items.reduce((s, i) => s + i.quantity * i.price, 0)

  return c.json({
    summary: {
      totalRevenue: +totalRevenue.toFixed(2),
      totalCost: +totalCost.toFixed(2),
      grossProfit: +(totalRevenue - totalCost).toFixed(2),
      receivables: +receivables.toFixed(2),
      totalCollected: +totalCollected.toFixed(2),
      inventoryCostValue: +inventoryCostValue.toFixed(2),
      inventorySellValue: +inventorySellValue.toFixed(2),
      unitsSold,
    },
    items: items.map((i) => {
      const sold = byItem.get(i.id)
      const revenue = sold?.revenue ?? 0
      const cost = sold?.cost ?? 0
      return {
        itemId: i.id,
        title: i.title,
        quantity: i.quantity,
        buyingPrice: i.buyingPrice,
        sellingPrice: i.price,
        soldQty: sold?.soldQty ?? 0,
        revenue: +revenue.toFixed(2),
        cost: +cost.toFixed(2),
        profit: +(revenue - cost).toFixed(2),
        stockCostValue: +(i.quantity * i.buyingPrice).toFixed(2),
        stockSellValue: +(i.quantity * i.price).toFixed(2),
      }
    }),
  })
})
