import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { getAppSetting } from '../lib/settings.js'
import {
  clearAuthCookie,
  bustAuthCache,
  loadAuthUser,
  publicUser,
  requireAuth,
  setAuthCookie,
  signToken,
} from '../middleware/auth.js'
import { uploadImage } from '../lib/upload.js'

export const authRouter = Router()

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const signupSchema = credsSchema.extend({
  name: z.string().trim().min(2).max(80),
})

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { name, email, password } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const userRole = await prisma.role.findUnique({ where: { code: 'user' } })
  if (!userRole) {
    res.status(500).json({ error: 'User role missing — run db seed' })
    return
  }

  const settings = await getAppSetting()
  const passwordHash = await bcrypt.hash(password, 10)

  const created = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      roleId: userRole.id,
      themePreference: 'system',
      payableAccount: {
        create: {
          currencyId: settings.currencyId,
          balance: 0,
          totalCharged: 0,
          totalPaid: 0,
        },
      },
    },
  })

  const authUser = await loadAuthUser(created.id)
  if (!authUser) {
    res.status(500).json({ error: 'Failed to load user' })
    return
  }
  setAuthCookie(res, signToken(authUser))
  res.status(201).json({ user: publicUser(authUser) })
})

authRouter.post('/login', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid credentials payload' })
    return
  }
  const email = parsed.data.email.toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }
  const authUser = await loadAuthUser(user.id)
  if (!authUser) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }
  setAuthCookie(res, signToken(authUser))
  res.json({ user: publicUser(authUser) })
})

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user!) })
})

authRouter.put('/theme', requireAuth, async (req, res) => {
  const parsed = z.object({ theme: z.enum(['light', 'dark', 'system']) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid theme' })
    return
  }
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { themePreference: parsed.data.theme },
  })
  bustAuthCache(req.user!.id)
  const authUser = await loadAuthUser(req.user!.id)
  res.json({ user: publicUser(authUser!) })
})

authRouter.put(
  '/profile',
  requireAuth,
  uploadImage.single('avatar'),
  async (req, res) => {
    const firstName = String(req.body.firstName ?? '').trim()
    const lastName = String(req.body.lastName ?? '').trim()
    if (firstName.length < 1 || firstName.length > 40) {
      res.status(400).json({ error: 'First name is required (1–40 characters)' })
      return
    }
    if (lastName.length > 40) {
      res.status(400).json({ error: 'Last name must be at most 40 characters' })
      return
    }
    const name = [firstName, lastName].filter(Boolean).join(' ').trim()
    if (name.length < 2) {
      res.status(400).json({ error: 'Full name is too short' })
      return
    }

    const data: { name: string; avatarUrl?: string } = { name }
    if (req.file) {
      data.avatarUrl = `/uploads/${req.file.filename}`
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data,
    })
    bustAuthCache(req.user!.id)
    const authUser = await loadAuthUser(req.user!.id)
    res.json({ user: publicUser(authUser!) })
  },
)

authRouter.put('/password', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid password payload' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ error: 'Current password is incorrect' })
    return
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  })
  res.json({ ok: true })
})
