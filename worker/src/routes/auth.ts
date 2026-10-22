import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import {
  bustAuthCache,
  clearAuthCookie,
  loadAuthUser,
  publicUser,
  requireAuth,
  setAuthCookie,
} from '../auth.js'
import type { AppEnv } from '../env.js'
import { fileOf, putUpload, readForm } from '../r2.js'
import { getAppSetting, jsonBody } from '../util.js'

export const authRoutes = new Hono<AppEnv>()

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const signupSchema = credsSchema.extend({
  name: z.string().trim().min(2).max(80),
})

authRoutes.post('/signup', async (c) => {
  const prisma = c.get('prisma')
  const parsed = signupSchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const { name, email, password } = parsed.data
  if (await prisma.user.findUnique({ where: { email: email.toLowerCase() } })) {
    return c.json({ error: 'Email already registered' }, 409)
  }
  const userRole = await prisma.role.findUnique({ where: { code: 'user' } })
  if (!userRole) return c.json({ error: 'User role missing — run db seed' }, 500)

  const settings = await getAppSetting(prisma)
  const created = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      roleId: userRole.id,
      themePreference: 'system',
      payableAccount: {
        create: { currencyId: settings.currencyId, balance: 0, totalCharged: 0, totalPaid: 0 },
      },
    },
  })

  const authUser = await loadAuthUser(prisma, created.id)
  if (!authUser) return c.json({ error: 'Failed to load user' }, 500)
  await setAuthCookie(c, authUser)
  return c.json({ user: publicUser(authUser) }, 201)
})

authRoutes.post('/login', async (c) => {
  const prisma = c.get('prisma')
  const parsed = credsSchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid credentials payload' }, 400)

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }
  const authUser = await loadAuthUser(prisma, user.id)
  if (!authUser) return c.json({ error: 'Invalid email or password' }, 401)
  await setAuthCookie(c, authUser)
  return c.json({ user: publicUser(authUser) })
})

authRoutes.post('/logout', (c) => {
  clearAuthCookie(c)
  return c.json({ ok: true })
})

authRoutes.get('/me', requireAuth, (c) => c.json({ user: publicUser(c.get('user')) }))

authRoutes.put('/theme', requireAuth, async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  const parsed = z.object({ theme: z.enum(['light', 'dark', 'system']) }).safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid theme' }, 400)

  await prisma.user.update({ where: { id: me.id }, data: { themePreference: parsed.data.theme } })
  bustAuthCache(me.id)
  return c.json({ user: publicUser((await loadAuthUser(prisma, me.id))!) })
})

authRoutes.put('/profile', requireAuth, async (c) => {
  const prisma = c.get('prisma')
  const me = c.get('user')
  const form = await readForm(c)
  const firstName = String(form.get('firstName') ?? '').trim()
  const lastName = String(form.get('lastName') ?? '').trim()
  if (firstName.length < 1 || firstName.length > 40) {
    return c.json({ error: 'First name is required (1–40 characters)' }, 400)
  }
  if (lastName.length > 40) return c.json({ error: 'Last name must be at most 40 characters' }, 400)
  const name = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (name.length < 2) return c.json({ error: 'Full name is too short' }, 400)

  const avatar = fileOf(form, 'avatar', { image: true })
  await prisma.user.update({
    where: { id: me.id },
    data: { name, ...(avatar ? { avatarUrl: await putUpload(c.env.UPLOADS, avatar) } : {}) },
  })
  bustAuthCache(me.id)
  return c.json({ user: publicUser((await loadAuthUser(prisma, me.id))!) })
})

authRoutes.put('/password', requireAuth, async (c) => {
  const prisma = c.get('prisma')
  const parsed = z
    .object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) })
    .safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid password payload' }, 400)

  const user = await prisma.user.findUnique({ where: { id: c.get('user').id } })
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return c.json({ error: 'Current password is incorrect' }, 400)
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  })
  return c.json({ ok: true })
})
