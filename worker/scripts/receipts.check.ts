// Run: npx tsx worker/scripts/receipts.check.ts
// Round-trips a receipt through the R2-style API and (when the Express server is built) checks it
// decrypts with the *Express* implementation too, so on-disk files stay compatible.
import assert from 'node:assert/strict'
import { readEncryptedReceipt, saveEncryptedReceipt } from '../src/receipts.js'

const store = new Map<string, Uint8Array>()
const bucket = {
  put: async (k: string, v: Uint8Array) => void store.set(k, v),
  get: async (k: string) => {
    const v = store.get(k)
    return v ? { arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) } : null
  },
} as never

const data = crypto.getRandomValues(new Uint8Array(4096))
const { token } = await saveEncryptedReceipt(bucket, 'secret', data, 'image/png')
assert.match(token, /^[a-f0-9]{32}\.bin$/)

const back = await readEncryptedReceipt(bucket, 'secret', token)
assert.equal(back.mimeType, 'image/png')
assert.deepEqual(back.data, data)
await assert.rejects(readEncryptedReceipt(bucket, 'wrong', token))
await assert.rejects(readEncryptedReceipt(bucket, 'secret', '../etc/passwd'))

// Cross-check with the Express implementation (file layout compatibility).
process.env.RECEIPT_ENCRYPTION_KEY = 'secret'
process.env.DATA_DIR = (await import('node:os')).tmpdir()
const express = await import('../../server/src/lib/receiptStore.js')
const { writeFile } = await import('node:fs/promises')
await express.ensureReceiptDir()
await writeFile(`${express.receiptDir}/${token}`, store.get(`receipts/${token}`)!)
const viaExpress = await express.readEncryptedReceipt(token)
assert.equal(viaExpress.mimeType, 'image/png')
assert.deepEqual(new Uint8Array(viaExpress.data), data)

console.log('receipts.check ok')
