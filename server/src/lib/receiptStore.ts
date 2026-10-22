import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { promisify } from 'node:util'
import { receiptDir } from './dataPaths.js'

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)

/** Private folder — not served by /uploads. DB only stores the short token. */
export { receiptDir }

const VERSION = 1

function encryptionKey(): Buffer {
  const raw = process.env.RECEIPT_ENCRYPTION_KEY || process.env.JWT_SECRET || ''
  if (!raw) throw new Error('RECEIPT_ENCRYPTION_KEY or JWT_SECRET is required')
  return crypto.createHash('sha256').update(`receipt-v1:${raw}`).digest()
}

export async function ensureReceiptDir() {
  await fs.mkdir(receiptDir, { recursive: true })
}

/** Compress + AES-256-GCM encrypt. Returns a short token for the DB (image bytes stay off-DB). */
export async function saveEncryptedReceipt(
  data: Buffer,
  mimeType: string,
): Promise<{ token: string }> {
  await ensureReceiptDir()
  const token = `${crypto.randomBytes(16).toString('hex')}.bin`
  const compressed = await gzip(data)
  const meta = Buffer.from(JSON.stringify({ mime: mimeType.slice(0, 80) }), 'utf8')
  if (meta.length > 255) throw new Error('MIME type too long')

  const payload = Buffer.concat([Buffer.from([meta.length]), meta, compressed])
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()])
  const tag = cipher.getAuthTag()

  // layout: version(1) | iv(12) | tag(16) | ciphertext
  await fs.writeFile(
    path.join(receiptDir, token),
    Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]),
  )
  return { token }
}

export async function readEncryptedReceipt(
  token: string,
): Promise<{ data: Buffer; mimeType: string }> {
  if (!/^[a-f0-9]{32}\.bin$/i.test(token)) {
    throw new Error('Invalid receipt token')
  }
  const raw = await fs.readFile(path.join(receiptDir, token))
  if (raw.length < 30 || raw[0] !== VERSION) {
    throw new Error('Corrupt receipt file')
  }
  const iv = raw.subarray(1, 13)
  const tag = raw.subarray(13, 29)
  const ciphertext = raw.subarray(29)

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const metaLen = plain[0]
  const metaJson = plain.subarray(1, 1 + metaLen).toString('utf8')
  const body = await gunzip(plain.subarray(1 + metaLen))
  let mimeType = 'image/jpeg'
  try {
    mimeType = (JSON.parse(metaJson) as { mime?: string }).mime || mimeType
  } catch {
    /* keep default */
  }
  return { data: body, mimeType }
}

export function receiptApiPath(token: string) {
  return `/api/payables/receipt/${token}`
}

export function toReceiptViewUrl(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (stored.startsWith('/api/') || stored.startsWith('/uploads/')) return stored
  if (/^[a-f0-9]{32}\.bin$/i.test(stored)) return receiptApiPath(stored)
  return stored
}
