import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from './env.js'
import type { PrismaClient } from './prisma.js'

export type Ctx = Context<AppEnv>

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message)
  }
}

/** Shared catch-block responder: HttpError → its status, anything else → logged 500. */
export function errorResponse(c: Ctx, err: unknown, fallback = 'Server error') {
  const status = err instanceof HttpError ? err.status : 500
  if (status === 500) console.error(err)
  return c.json({ error: err instanceof Error ? err.message : fallback }, status)
}

/** Mirrors express.json(): a missing/invalid body is just `{}`; routes validate with zod. */
export async function jsonBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function getAppSetting(prisma: PrismaClient) {
  const existing = await prisma.setting.findUnique({ where: { id: 1 }, include: { currency: true } })
  if (existing) return existing

  const usd = await prisma.currency.findUnique({ where: { code: 'USD' } })
  if (!usd) throw new Error('USD currency missing — run the seed (npm run d1:seed)')
  return prisma.setting.create({ data: { id: 1, currencyId: usd.id }, include: { currency: true } })
}

export function createUserNotification(
  prisma: PrismaClient,
  input: { userId: string; type: string; title: string; message: string },
) {
  return prisma.notification.create({ data: input })
}

export const LOW_STOCK_THRESHOLD = 4

/** Notify admins for items this user charged that are still at/below the threshold. */
export async function notifyLowStockAfterPayment(prisma: PrismaClient, userId: string) {
  const charges = await prisma.itemCharge.findMany({
    where: { userId, deletedAt: null },
    select: { itemId: true },
    distinct: ['itemId'],
  })
  if (charges.length === 0) return

  const lowItems = await prisma.item.findMany({
    where: {
      id: { in: charges.map((c) => c.itemId) },
      isActive: true,
      quantity: { lte: LOW_STOCK_THRESHOLD },
    },
    select: { title: true, quantity: true },
  })
  if (lowItems.length === 0) return

  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { code: 'admin' } },
    select: { id: true },
  })
  // One batched insert instead of items × admins round-trips (Workers cap subrequests per invocation).
  await prisma.notification.createMany({
    data: lowItems.flatMap((item) =>
      admins.map((admin) => ({
        userId: admin.id,
        type: 'low_stock',
        title: 'Low stock reminder',
        message: `Item "${item.title}" quantity is getting low (${item.quantity} left). Please add new stock.`,
      })),
    ),
  })
}
