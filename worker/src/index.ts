import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env.js'
import { createPrisma } from './prisma.js'
import { serveUpload } from './r2.js'
import { HttpError } from './util.js'
import { accountabilityRoutes } from './routes/accountability.js'
import { authRoutes } from './routes/auth.js'
import { cashlineRoutes } from './routes/cashline.js'
import { emailRoutes } from './routes/email.js'
import { itemsRoutes } from './routes/items.js'
import { notificationsRoutes } from './routes/notifications.js'
import { payablesRoutes } from './routes/payables.js'
import { rolesRoutes } from './routes/roles.js'
import { settingsRoutes } from './routes/settings.js'
import { usersRoutes } from './routes/users.js'

// strict:false → `/api/items` and `/api/items/` both match, like Express.
const app = new Hono<AppEnv>({ strict: false })

app.use(
  '*',
  cors({
    // Express parity: unset / "*" / "true" reflect the caller's origin (needed with credentials); else one fixed origin.
    origin: (origin, c) => {
      const configured = c.env.CLIENT_ORIGIN
      return !configured || configured === '*' || configured === 'true' ? origin : configured
    },
    credentials: true,
  }),
)

app.use('/api/*', async (c, next) => {
  c.set('prisma', createPrisma(c.env.DB))
  await next()
})

app.get('/api/health', (c) => c.json({ ok: true }))

// Public files from R2 (receipts live under a different prefix and are never reachable here).
app.get('/uploads/:key', async (c) => {
  const res = await serveUpload(c.env.UPLOADS, c.req.param('key'), c.req.raw)
  return res ?? c.json({ error: 'Not found' }, 404)
})

app.route('/api/auth', authRoutes)
app.route('/api/items', itemsRoutes)
app.route('/api/payables', payablesRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api/email', emailRoutes)
app.route('/api/roles', rolesRoutes)
app.route('/api/users', usersRoutes)
app.route('/api/notifications', notificationsRoutes)
app.route('/api/accountability', accountabilityRoutes)
app.route('/api/cashline', cashlineRoutes)

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: err instanceof Error ? err.message : 'Server error' }, 500)
})

export default { fetch: app.fetch }
