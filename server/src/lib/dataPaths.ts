import path from 'node:path'
import fs from 'node:fs'

/** Root for durable files in Docker (`DATA_DIR=/data`) or local cwd. */
export const dataDir = path.resolve(process.env.DATA_DIR || process.cwd())

export const uploadDir = path.join(dataDir, 'uploads')
export const receiptDir = path.join(dataDir, 'private', 'receipts')
export const publicDir = path.resolve(
  process.env.PUBLIC_DIR || path.join(process.cwd(), 'public'),
)

export function ensureDataDirs() {
  fs.mkdirSync(uploadDir, { recursive: true })
  fs.mkdirSync(receiptDir, { recursive: true })
  const dbUrl = process.env.DATABASE_URL || ''
  const fileMatch = dbUrl.match(/^file:(.+)$/)
  if (fileMatch) {
    const dbPath = path.resolve(fileMatch[1])
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
}
