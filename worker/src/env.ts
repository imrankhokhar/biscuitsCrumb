import type { PrismaClient } from '../generated/prisma/wasm.js'
import type { AuthUser } from './auth.js'

/** Bindings + secrets. Secrets: `wrangler secret put <NAME>`; plain vars live in wrangler.toml / .dev.vars. */
export type Env = {
  DB: D1Database
  UPLOADS: R2Bucket
  JWT_SECRET: string
  /** Falls back to JWT_SECRET (same behaviour as the Express server). */
  RECEIPT_ENCRYPTION_KEY?: string
  /** `*`, `true`, or empty = reflect any origin (credentials allowed); otherwise a single origin. */
  CLIENT_ORIGIN?: string
  /** "true" → Secure cookie (needed on HTTPS, i.e. everywhere except wrangler dev). */
  COOKIE_SECURE?: string
  /** Only used by the seed generator / for documentation; SMTP lives in the Setting table. */
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_SECURE?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_FROM?: string
}

export type AppEnv = {
  Bindings: Env
  Variables: { prisma: PrismaClient; user: AuthUser }
}
