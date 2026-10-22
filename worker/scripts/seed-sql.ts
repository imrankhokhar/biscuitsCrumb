// Generates an idempotent D1 seed (roles, permissions, currencies, settings, templates, admin, sample items)
// from the SAME data the Express seed uses, as plain SQL for `wrangler d1 execute`.
//
//   npx tsx worker/scripts/seed-sql.ts [out.sql]
//
// Why SQL instead of Prisma-over-HTTP: D1 is only reachable through a Worker binding or its REST API, and a
// Worker invocation has a small subrequest cap (50 free / 1000 paid) — the Prisma seed issues ~200 queries.
// `wrangler d1 execute --file` has no such limit and works identically for --local and --remote.
import bcrypt from 'bcryptjs'
import { writeFileSync } from 'node:fs'
import { ADMIN_PERMISSIONS, PERMISSIONS, USER_PERMISSIONS } from '../../server/src/lib/permissions.js'
import { CURRENCIES, EMAIL_TEMPLATES, SAMPLE_ITEMS } from '../../server/prisma/seedData.js'

const out = process.argv[2] ?? 'worker/seed.generated.sql'
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
const env = process.env

const q = (v: string | number | boolean) =>
  typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : typeof v === 'boolean' ? (v ? '1' : '0') : String(v)
const id = () => crypto.randomUUID()
// Same representation Prisma's D1 adapter writes/reads for DateTime columns (ISO-8601 text, +00:00 offset).
const NOW = q(new Date().toISOString().replace('Z', '+00:00'))
const list = (xs: readonly string[]) => xs.map(q).join(', ')

const sql: string[] = []

for (const p of PERMISSIONS) {
  sql.push(
    `INSERT INTO "Permission" (id, code, name, description, module, createdAt) VALUES (${q(id())}, ${q(p.code)}, ${q(p.name)}, ${q(p.description)}, ${q(p.module)}, ${NOW})
ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description, module = excluded.module;`,
  )
}

sql.push(
  `INSERT INTO "Role" (id, code, name, description, createdAt) VALUES (${q(id())}, 'admin', 'Administrator', 'Full access', ${NOW})
ON CONFLICT(code) DO UPDATE SET name = excluded.name;`,
  `INSERT INTO "Role" (id, code, name, description, createdAt) VALUES (${q(id())}, 'user', 'User', 'Can pick items and build payable', ${NOW})
ON CONFLICT(code) DO UPDATE SET name = excluded.name;`,
)

for (const [role, codes] of [
  ['admin', ADMIN_PERMISSIONS],
  ['user', USER_PERMISSIONS],
] as const) {
  sql.push(
    `INSERT OR IGNORE INTO "RolePermission" (id, roleId, permissionId, createdAt)
SELECT lower(hex(randomblob(16))), r.id, p.id, ${NOW} FROM "Role" r JOIN "Permission" p ON p.code IN (${list(codes)}) WHERE r.code = ${q(role)};`,
  )
}

for (const c of CURRENCIES) {
  sql.push(
    `INSERT INTO "Currency" (id, code, name, symbol, isActive, createdAt) VALUES (${q(id())}, ${q(c.code)}, ${q(c.name)}, ${q(c.symbol)}, 1, ${NOW})
ON CONFLICT(code) DO UPDATE SET name = excluded.name, symbol = excluded.symbol, isActive = 1;`,
  )
}

sql.push(
  `INSERT OR IGNORE INTO "Setting" (id, currencyId, appName, tagline, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, notificationSoundEnabled, createdAt, updatedAt)
SELECT 1, c.id, 'Excelorithm', 'Vending Machine', ${q(env.SMTP_HOST || '')}, ${Number(env.SMTP_PORT || 587)}, ${q(env.SMTP_SECURE === 'true')}, ${q(env.SMTP_USER || '')}, ${q(env.SMTP_PASS || '')}, ${q(env.SMTP_FROM || 'Excelorithm Vending <noreply@excelorithm.com>')}, 1, ${NOW}, ${NOW}
FROM "Currency" c WHERE c.code = 'USD';`,
)

for (const t of EMAIL_TEMPLATES) {
  sql.push(
    `INSERT OR IGNORE INTO "EmailTemplate" (id, code, name, subject, body, createdAt, updatedAt) VALUES (${q(id())}, ${q(t.code)}, ${q(t.name)}, ${q(t.subject)}, ${q(t.body)}, ${NOW}, ${NOW});`,
  )
}

// Like the Express seed: never reset the admin password on re-seed.
sql.push(
  `INSERT INTO "User" (id, name, email, passwordHash, roleId, themePreference, avatarUrl, isActive, createdAt, updatedAt)
SELECT ${q(id())}, 'Admin', 'admin@excelorithm.com', ${q(bcrypt.hashSync(adminPassword, 10))}, r.id, 'system', '', 1, ${NOW}, ${NOW}
FROM "Role" r WHERE r.code = 'admin'
ON CONFLICT(email) DO UPDATE SET roleId = excluded.roleId, name = 'Admin', isActive = 1;`,
)

// Sample items only into an empty catalog.
const rows = SAMPLE_ITEMS.map(
  (i) =>
    `SELECT ${q(id())} AS id, ${q(i.title)} AS title, ${q(i.description)} AS description, ${i.price} AS price, ${i.buyingPrice} AS buyingPrice, ${i.quantity} AS quantity, ${q(i.imageUrl)} AS imageUrl`,
).join('\nUNION ALL ')
sql.push(
  `INSERT INTO "Item" (id, title, description, price, buyingPrice, quantity, imageUrl, currencyId, isActive, createdAt, updatedAt)
SELECT t.id, t.title, t.description, t.price, t.buyingPrice, t.quantity, t.imageUrl, c.id, 1, ${NOW}, ${NOW}
FROM (${rows}) t JOIN "Currency" c ON c.code = 'USD'
WHERE (SELECT COUNT(*) FROM "Item") = 0;`,
)

writeFileSync(out, sql.join('\n\n') + '\n')
console.log(`Wrote ${out} (${sql.length} statements)`)
