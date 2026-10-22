import { prisma } from '../prisma.js'
import { createUserNotification } from '../routes/notifications.js'

export const LOW_STOCK_THRESHOLD = 4

async function notifyAdminsLowStock(itemTitle: string, quantity: number) {
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { code: 'admin' } },
    select: { id: true },
  })
  await Promise.all(
    admins.map((admin) =>
      createUserNotification({
        userId: admin.id,
        type: 'low_stock',
        title: 'Low stock reminder',
        message: `Item "${itemTitle}" quantity is getting low (${quantity} left). Please add new stock.`,
      }),
    ),
  )
}

/** Notify admins for items this user charged that are still at/below the threshold. */
export async function notifyLowStockAfterPayment(userId: string) {
  const charges = await prisma.itemCharge.findMany({
    where: { userId, deletedAt: null },
    select: { itemId: true },
    distinct: ['itemId'],
  })
  const itemIds = [...new Set(charges.map((c) => c.itemId))]
  if (itemIds.length === 0) return

  const lowItems = await prisma.item.findMany({
    where: {
      id: { in: itemIds },
      isActive: true,
      quantity: { lte: LOW_STOCK_THRESHOLD },
    },
    select: { title: true, quantity: true },
  })

  await Promise.all(
    lowItems.map((item) =>
      notifyAdminsLowStock(item.title, item.quantity).catch((err) => console.error(err)),
    ),
  )
}
