import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { getD1HttpEnv, resolveDbMode } from './lib/dbMode.js'

function createPrisma(): PrismaClient {
  const mode = resolveDbMode()
  const d1 = getD1HttpEnv()

  if (mode === 'd1' && d1) {
    const adapter = new PrismaD1(d1)
    console.log(
      `Database: Cloudflare D1 (HTTP) ${d1.CLOUDFLARE_DATABASE_ID.slice(0, 8)}…`,
    )
    return new PrismaClient({ adapter })
  }

  console.log('Database: SQLite (local file via DATABASE_URL)')
  return new PrismaClient()
}

export const prisma = createPrisma()
