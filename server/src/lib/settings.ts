import { prisma } from '../prisma.js'

export async function getAppSetting() {
  const existing = await prisma.setting.findUnique({
    where: { id: 1 },
    include: { currency: true },
  })
  if (existing) return existing

  const usd = await prisma.currency.findUnique({ where: { code: 'USD' } })
  if (!usd) throw new Error('USD currency missing — run db seed')

  return prisma.setting.create({
    data: { id: 1, currencyId: usd.id },
    include: { currency: true },
  })
}
