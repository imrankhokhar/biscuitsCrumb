import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '../generated/prisma/wasm.js'

/** One client per request — cheap, and D1 bindings are request-scoped. */
export function createPrisma(db: D1Database) {
  return new PrismaClient({ adapter: new PrismaD1(db) })
}

export type { PrismaClient }
