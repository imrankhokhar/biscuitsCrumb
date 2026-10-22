/**
 * Soft-delete all existing item charges so Accountability starts fresh from now on.
 * Run: npx tsx prisma/reset-accountability.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const result = await prisma.itemCharge.updateMany({
    where: { deletedAt: null },
    data: {
      deletedAt: now,
      deletedByName: 'Accountability reset',
      deletedByUserId: null,
    },
  })
  console.log(`Soft-deleted ${result.count} charge(s). Accountability now starts empty.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
