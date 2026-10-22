/** ponytail: tiny self-check for receipt encrypt/decrypt round-trip */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readEncryptedReceipt, receiptDir, saveEncryptedReceipt } from './receiptStore.js'

process.env.JWT_SECRET ||= 'test-secret-for-receipt-check'

const sample = Buffer.from('fake-png-bytes-for-test')
const { token } = await saveEncryptedReceipt(sample, 'image/png')
const out = await readEncryptedReceipt(token)
assert.equal(out.mimeType, 'image/png')
assert.deepEqual(out.data, sample)
await fs.unlink(path.join(receiptDir, token))
console.log('receiptStore.check: ok')
