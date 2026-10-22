/**
 * Encrypted payment receipts in R2 (`receipts/<token>`). Same on-disk layout as server/src/lib/receiptStore.ts
 * — version(1) | iv(12) | tag(16) | ciphertext — so files copied from the Express data dir stay readable.
 * Web-crypto only (no node:crypto), so it also runs under plain Node for worker/scripts/receipts.check.ts.
 */
const VERSION = 1
const TOKEN_RE = /^[a-f0-9]{32}\.bin$/i
const PREFIX = 'receipts/'

type Bucket = Pick<R2Bucket, 'put' | 'get'>

export const isReceiptToken = (s: string) => TOKEN_RE.test(s)

async function keyFor(secret: string) {
  if (!secret) throw new Error('RECEIPT_ENCRYPTION_KEY or JWT_SECRET is required')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`receipt-v1:${secret}`))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([data]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export async function saveEncryptedReceipt(
  bucket: Bucket,
  secret: string,
  data: Uint8Array,
  mimeType: string,
): Promise<{ token: string }> {
  const meta = new TextEncoder().encode(JSON.stringify({ mime: mimeType.slice(0, 80) }))
  if (meta.length > 255) throw new Error('MIME type too long')
  const payload = concat(Uint8Array.of(meta.length), meta, await pipe(data, new CompressionStream('gzip')))

  const iv = crypto.getRandomValues(new Uint8Array(12))
  // WebCrypto returns ciphertext||tag; the file layout stores tag before ciphertext.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, await keyFor(secret), payload),
  )
  const ciphertext = sealed.subarray(0, sealed.length - 16)
  const tag = sealed.subarray(sealed.length - 16)

  const token = `${[...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')}.bin`
  await bucket.put(PREFIX + token, concat(Uint8Array.of(VERSION), iv, tag, ciphertext))
  return { token }
}

export async function readEncryptedReceipt(
  bucket: Bucket,
  secret: string,
  token: string,
): Promise<{ data: Uint8Array; mimeType: string }> {
  if (!isReceiptToken(token)) throw new Error('Invalid receipt token')
  const obj = await bucket.get(PREFIX + token)
  if (!obj) throw new Error('Receipt not found')
  const raw = new Uint8Array(await obj.arrayBuffer())
  if (raw.length < 30 || raw[0] !== VERSION) throw new Error('Corrupt receipt file')

  const iv = raw.subarray(1, 13)
  const tag = raw.subarray(13, 29)
  const ciphertext = raw.subarray(29)
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, await keyFor(secret), concat(ciphertext, tag)),
  )
  const metaLen = plain[0]
  let mimeType = 'image/jpeg'
  try {
    mimeType =
      (JSON.parse(new TextDecoder().decode(plain.subarray(1, 1 + metaLen))) as { mime?: string }).mime || mimeType
  } catch {
    /* keep default */
  }
  return { data: await pipe(plain.subarray(1 + metaLen), new DecompressionStream('gzip')), mimeType }
}

export const receiptApiPath = (token: string) => `/api/payables/receipt/${token}`

export function toReceiptViewUrl(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (stored.startsWith('/api/') || stored.startsWith('/uploads/')) return stored
  if (isReceiptToken(stored)) return receiptApiPath(stored)
  return stored
}
