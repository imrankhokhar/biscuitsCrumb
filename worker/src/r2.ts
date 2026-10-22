import type { Context } from 'hono'
import type { AppEnv } from './env.js'
import { HttpError } from './util.js'

export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Public files live under `uploads/` in the bucket; private receipts under `receipts/` (never served by /uploads). */
const PREFIX = 'uploads/'

export async function readForm(c: Context<AppEnv>): Promise<FormData> {
  const type = c.req.header('content-type') ?? ''
  if (!type.includes('multipart/form-data')) return new FormData()
  return c.req.formData()
}

/** Returns the uploaded file for `name`, or null if the field is absent/empty. Throws 400 on bad size/type. */
export function fileOf(
  form: FormData,
  name: string,
  opts: { image?: boolean; maxBytes?: number } = {},
): File | null {
  const v: unknown = form.get(name)
  if (!(v instanceof File) || v.size === 0) return null
  if (v.size > (opts.maxBytes ?? MAX_FILE_BYTES)) throw new HttpError(400, 'File too large')
  if (opts.image && !v.type.startsWith('image/')) {
    throw new HttpError(400, 'Only image uploads are allowed')
  }
  return v
}

/** Store a public upload in R2 and return the URL the DB stores (same shape as Express: `/uploads/<name>`). */
export async function putUpload(uploads: R2Bucket, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`
  await uploads.put(PREFIX + key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  })
  return `/uploads/${key}`
}

/** GET /uploads/:key handler body. Keys are unique + immutable, so cache hard. */
export async function serveUpload(uploads: R2Bucket, key: string, req: Request): Promise<Response | null> {
  const obj = await uploads.get(PREFIX + key)
  if (!obj) return null
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  if (req.headers.get('if-none-match') === obj.httpEtag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(obj.body, { headers })
}
