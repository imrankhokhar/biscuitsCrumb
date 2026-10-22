import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { uploadDir } from './dataPaths.js'

export { uploadDir }
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${safe}`)
  },
})

export const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed'))
      return
    }
    cb(null, true)
  },
})

export const uploadAny = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
})

/** In-memory image upload for encrypted receipt storage (never writes plaintext to disk). */
export const uploadReceiptMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image uploads are allowed'))
      return
    }
    cb(null, true)
  },
})

const STATEMENT_EXT = /\.(xlsx|xls|csv|pdf)$/i

/** In-memory bank/account statement for Cashline compare. */
export const uploadStatementMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!STATEMENT_EXT.test(file.originalname)) {
      cb(new Error('Upload an Excel (.xlsx), CSV, or PDF statement'))
      return
    }
    cb(null, true)
  },
})
