// End-to-end smoke test against a running Worker (after `npm run d1:migrate:local && npm run d1:seed`):
//   npm run cf:dev            # terminal 1
//   npx tsx worker/scripts/smoke.ts [http://127.0.0.1:8787]
// (On Node 20 set NODE_OPTIONS=--no-experimental-require-module, or tsx fails loading exceljs' deps.)
// Needs the seeded admin (admin@excelorithm.com / ADMIN_PASSWORD or admin123).
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const ADMIN_PW = process.env.ADMIN_PASSWORD || 'admin123'

class Client {
  cookie = ''
  async req(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { cookie: this.cookie }
    let payload: BodyInit | undefined
    if (body instanceof FormData) payload = body
    else if (body !== undefined) {
      headers['content-type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(BASE + path, { method, headers, body: payload })
    const set = res.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    return res
  }
  async json(method: string, path: string, body?: unknown, expect = 200) {
    const res = await this.req(method, path, body)
    const text = await res.text()
    assert.equal(res.status, expect, `${method} ${path} → ${res.status} ${text}`)
    return text ? JSON.parse(text) : {}
  }
}

const png = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
)
const img = (name: string) => new File([png], name, { type: 'image/png' })

const admin = new Client()
const user = new Client()
const step = (s: string) => console.log('✓', s)

assert.deepEqual(await (await admin.req('GET', '/api/health')).json(), { ok: true })
assert.equal((await admin.req('GET', '/api/auth/me')).status, 401)
await admin.json('POST', '/api/auth/login', { email: 'admin@excelorithm.com', password: 'wrong-pw' }, 401)
const login = await admin.json('POST', '/api/auth/login', { email: 'admin@excelorithm.com', password: ADMIN_PW })
assert.equal(login.user.role, 'admin')
step('health + login')

const me = await admin.json('GET', '/api/auth/me')
assert.ok(me.user.permissions.includes('payables.pay'))
await admin.json('PUT', '/api/auth/theme', { theme: 'dark' })
const prof = new FormData()
prof.set('firstName', 'Admin')
prof.set('lastName', 'Boss')
prof.set('avatar', img('a b.png'))
const profile = await admin.json('PUT', '/api/auth/profile', prof)
assert.match(profile.user.avatarUrl, /^\/uploads\/.+a_b\.png$/)
const avatar = await admin.req('GET', profile.user.avatarUrl)
assert.equal(avatar.status, 200)
assert.equal(avatar.headers.get('content-type'), 'image/png')
assert.equal((await avatar.arrayBuffer()).byteLength, png.length)
assert.equal((await admin.req('GET', '/uploads/nope.png')).status, 404)
assert.equal((await admin.req('GET', '/uploads/receipts%2Fx.bin')).status, 404)
step('profile + R2 upload + GET /uploads/:key')

// users / roles / settings / email
const roles = await admin.json('GET', '/api/users/roles')
const userRole = roles.roles.find((r: { code: string }) => r.code === 'user')
const email = `smoke${Date.now()}@example.com`
const created = await admin.json('POST', '/api/users', { name: 'Smoke User', email, password: 'secret12', roleId: userRole.id }, 201)
await admin.json('POST', '/api/users', { name: 'Smoke User', email, password: 'secret12', roleId: userRole.id }, 409)
await admin.json('PUT', `/api/users/${created.user.id}`, { name: 'Smoke Renamed' })
assert.ok((await admin.json('GET', '/api/users')).users.length >= 2)
assert.ok((await admin.json('GET', '/api/roles')).roles.length >= 2)
assert.ok((await admin.json('GET', '/api/roles/permissions')).permissions.length > 10)
const s = await admin.json('GET', '/api/settings')
assert.equal(s.settings.currency, 'USD')
assert.equal((await admin.json('GET', '/api/settings/public')).branding.appName.length > 0, true)
assert.ok((await admin.json('GET', '/api/settings/currencies')).currencies.length >= 10)
await admin.json('PUT', '/api/settings/currency', { currency: 'EUR' })
await admin.json('PUT', '/api/settings', { currency: 'USD' })
const brand = new FormData()
brand.set('appName', 'Smoke App')
brand.set('tagline', 'Testing')
brand.set('logo', img('logo.png'))
assert.match((await admin.json('PUT', '/api/settings/branding', brand)).settings.logoUrl, /^\/uploads\//)
const snd = new FormData()
snd.set('enabled', 'true')
snd.set('sound', new File([new Uint8Array(100)], 'ding.mp3', { type: 'audio/mpeg' }))
assert.match((await admin.json('PUT', '/api/settings/notifications', snd)).settings.notificationSoundUrl, /ding\.mp3$/)
assert.equal((await admin.json('GET', '/api/settings/templates')).templates.length >= 2, true)
const tpl = await admin.json('POST', '/api/settings/templates', { code: `t_${Date.now()}`, name: 'T', subject: 'S', body: 'B' }, 201)
await admin.json('PUT', `/api/settings/templates/${tpl.template.id}`, { name: 'T2', subject: 'S', body: 'B' })
const mail = await admin.json('POST', '/api/email/send', { toUserId: created.user.id, subject: 'Hi', body: 'There' }, 201)
assert.equal(mail.email.status, 'sent')
assert.ok((await admin.json('GET', '/api/email/logs')).emails.length >= 1)
assert.ok((await admin.json('GET', '/api/email/users')).users.length >= 1)
step('users, roles, settings (+uploads), templates, email')

// items: create with image, list, charge, undo
const form = new FormData()
form.set('title', 'Smoke Snack')
form.set('price', '2.5')
form.set('buyingPrice', '1')
form.set('quantity', '2')
form.set('image', img('snack.png'))
const item = (await admin.json('POST', '/api/items', form, 201)).item
await admin.json('POST', '/api/items', new FormData(), 400)
assert.equal(item.quantity, 2)
const upd = new FormData()
upd.set('title', 'Smoke Snack 2')
upd.set('price', '2.5')
upd.set('buyingPrice', '1')
upd.set('quantity', '2')
assert.equal((await admin.json('PUT', `/api/items/${item.id}`, upd)).item.imageUrl, item.imageUrl)
step('item create/update with image')

const uLogin = await user.json('POST', '/api/auth/login', { email, password: 'secret12' })
assert.equal(uLogin.user.role, 'user')
assert.ok(!(await user.json('GET', '/api/items')).items.some((i: { buyingPrice?: number }) => 'buyingPrice' in i))
await user.json('GET', '/api/users', undefined, 403)
const c1 = await user.json('POST', `/api/items/${item.id}/charge`)
assert.equal(c1.item.quantity, 1)
assert.equal(c1.payable.amount, 2.5)
const c2 = await user.json('POST', `/api/items/${item.id}/charge`)
assert.equal(c2.item.quantity, 0)
await user.json('POST', `/api/items/${item.id}/charge`, undefined, 400) // out of stock
const open = await user.json('GET', '/api/items/charges/open')
assert.equal(open.charges.length, 2)
const undone = await user.json('POST', `/api/items/charges/${c2.chargeId}/undo`)
assert.equal(undone.payable.amount, 2.5)
assert.equal(undone.item.quantity, 1)
await user.json('POST', `/api/items/charges/${c2.chargeId}/undo`, undefined, 404) // no double restore
step('charge / out-of-stock / undo')

// payment proof → R2 receipts/ → accept
const pay = new FormData()
pay.set('amount', '2.5')
pay.set('method', 'Bank')
await user.json('POST', '/api/payables/me/pay', pay, 400) // no receipt
pay.set('receipt', img('proof.png'))
const paid = await user.json('POST', '/api/payables/me/pay', pay)
assert.equal(paid.pendingPayment.status, 'pending')
assert.match(paid.pendingPayment.receiptUrl, /^\/api\/payables\/receipt\/[a-f0-9]{32}\.bin$/)
const receipt = await user.req('GET', paid.pendingPayment.receiptUrl)
assert.equal(receipt.status, 200)
assert.equal(receipt.headers.get('content-type'), 'image/png')
assert.deepEqual(new Uint8Array(await receipt.arrayBuffer()), png)
const other = new Client()
await other.json('POST', '/api/auth/signup', { name: 'Other One', email: `o${Date.now()}@example.com`, password: 'secret12' }, 201)
assert.equal((await other.req('GET', paid.pendingPayment.receiptUrl)).status, 403)
assert.ok((await admin.json('GET', '/api/payables')).payables.some((p: { userId: string }) => p.userId === created.user.id))
assert.ok((await admin.json('GET', '/api/notifications')).notifications.some((n: { type: string }) => n.type === 'payment_pending'))
assert.ok((await admin.json('GET', '/api/notifications/unread-count')).unreadCount >= 1)
await admin.json('POST', '/api/notifications/read-all')
const acc = await admin.json('POST', `/api/payables/payments/${paid.pendingPayment.id}/accept`)
assert.equal(acc.amount, 0)
await admin.json('POST', `/api/payables/payments/${paid.pendingPayment.id}/accept`, undefined, 404)
const after = await user.json('GET', '/api/payables/me')
assert.equal(after.amount, 0)
assert.equal(after.totalPaid, 2.5)
assert.ok((await user.json('GET', '/api/notifications')).notifications.some((n: { type: string }) => n.type === 'payment_accepted'))
// admin-side payment paths
await user.json('POST', `/api/items/${item.id}/charge`)
assert.equal((await admin.json('POST', `/api/payables/${created.user.id}/pay`, { amount: 1, note: 'cash' })).amount, 1.5)
assert.equal((await admin.json('POST', `/api/payables/${created.user.id}/mark-paid`)).amount, 0)
step('payment proof, receipt privacy, accept, admin pay / mark-paid')

// accountability + cashline
const acct = await admin.json('GET', '/api/accountability')
assert.ok(acct.summary.totalRevenue >= 5)
const today = new Date().toISOString()
const cmpJson = await admin.json('POST', '/api/cashline/compare-json', { rows: [{ date: today, amount: 2.5, description: email }, { date: today, amount: 999, description: 'x' }] })
assert.equal(cmpJson.meta.sheetCredits, 2)
assert.ok(cmpJson.summary.not_in_system >= 1)
const csv = new FormData()
csv.set('statement', new File([`Date,Description,Credit\n${today.slice(0, 10)},${email},2.50\n`], 'st.csv', { type: 'text/csv' }))
assert.equal((await admin.json('POST', '/api/cashline/compare', csv)).meta.sheetCredits, 1)
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('S')
ws.addRow(['Date', 'Description', 'Credit'])
ws.addRow([new Date(), email, 2.5])
const xlsx = new FormData()
xlsx.set('statement', new File([new Uint8Array(await wb.xlsx.writeBuffer())], 'st.xlsx'))
assert.equal((await admin.json('POST', '/api/cashline/compare', xlsx)).meta.sheetCredits, 1)
const pdf = new FormData()
pdf.set('statement', new File([new Uint8Array([37, 80, 68, 70])], 'st.pdf'))
assert.match((await admin.json('POST', '/api/cashline/compare', pdf, 400)).error, /PDF/)
step('accountability, cashline (json/csv/xlsx; pdf → clear 400)')

// cleanup + session
await admin.json('DELETE', `/api/payables/${created.user.id}`)
await admin.json('DELETE', `/api/items/${item.id}`)
await admin.json('DELETE', `/api/users/${created.user.id}`)
await admin.json('DELETE', `/api/users/${me.user.id}`, undefined, 400)
await admin.json('POST', '/api/auth/logout')
await admin.json('PUT', '/api/auth/password', { currentPassword: ADMIN_PW, newPassword: ADMIN_PW }, 401)
console.log('smoke ok')
