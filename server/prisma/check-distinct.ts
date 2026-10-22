import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findFirst()
  if (!user) {
    console.log('no user')
    return
  }
  try {
    const charges = await prisma.itemCharge.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { itemId: true },
      distinct: ['itemId'],
    })
    console.log('distinct ok', charges.length)
  } catch (e) {
    console.error('distinct failed', e)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
