import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: 'alpha' } },
        { email: { contains: 'alpha' } },
      ],
    },
    include: { payableAccount: true },
  })

  if (users.length === 0) {
    console.log('No user matching "alpha" found')
    return
  }

  for (const u of users) {
    console.log(`Found: ${u.name} <${u.email}> balance=${u.payableAccount?.balance ?? 0}`)
    if (!u.payableAccount) {
      console.log('  No payable account')
      continue
    }
    await prisma.payableAccount.update({
      where: { id: u.payableAccount.id },
      data: { balance: 0, totalCharged: 0, totalPaid: 0 },
    })
    console.log('  Payable reset to 0')
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
