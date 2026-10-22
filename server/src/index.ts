import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import path from 'node:path'
import { authRouter } from './routes/auth.js'
import { itemsRouter } from './routes/items.js'
import { payablesRouter } from './routes/payables.js'
import { settingsRouter } from './routes/settings.js'
import { emailRouter } from './routes/email.js'
import { rolesRouter } from './routes/roles.js'
import { usersRouter } from './routes/users.js'
import { notificationsRouter } from './routes/notifications.js'
import { accountabilityRouter } from './routes/accountability.js'
import { cashlineRouter } from './routes/cashline.js'
import { ensureDataDirs, publicDir, uploadDir } from './lib/dataPaths.js'

ensureDataDirs()

const app = express()
const port = Number(process.env.PORT || 4000)
const originEnv = process.env.CLIENT_ORIGIN
const origin =
  !originEnv || originEnv === 'true' || originEnv === '*'
    ? true
    : originEnv

app.use(
  cors({
    origin,
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use('/uploads', express.static(uploadDir))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/items', itemsRouter)
app.use('/api/payables', payablesRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/email', emailRouter)
app.use('/api/roles', rolesRouter)
app.use('/api/users', usersRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/accountability', accountabilityRouter)
app.use('/api/cashline', cashlineRouter)

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }))
  app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  const message = err instanceof Error ? err.message : 'Server error'
  res.status(500).json({ error: message })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`)
})
