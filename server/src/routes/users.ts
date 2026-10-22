import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { getAppSetting } from '../lib/settings.js'
import { bustAuthCache, requireAuth, requirePermission } from '../middleware/auth.js'

export const usersRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

function mapUser(u: {
  id: string
  name: string
  email: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  role: { id: string; code: string; name: string }
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    roleId: u.role.id,
    roleCode: u.role.code,
    roleName: u.role.name,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }
}

usersRouter.get('/', requireAuth, requirePermission('users.view'), async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ users: users.map(mapUser) })
})

usersRouter.get('/roles', requireAuth, requirePermission('users.view'), async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } })
  res.json({
    roles: roles.map((r) => ({ id: r.id, code: r.code, name: r.name })),
  })
})

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6),
  roleId: z.string().min(1),
  isActive: z.boolean().optional(),
})

usersRouter.post('/', requireAuth, requirePermission('users.create'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const email = parsed.data.email.toLowerCase()
  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } })
  if (!role) {
    res.status(400).json({ error: 'Invalid role' })
    return
  }
  const settings = await getAppSetting()
  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      roleId: role.id,
      isActive: parsed.data.isActive ?? true,
      themePreference: 'system',
      ...(role.code === 'user'
        ? {
            payableAccount: {
              create: {
                currencyId: settings.currencyId,
                balance: 0,
                totalCharged: 0,
                totalPaid: 0,
              },
            },
          }
        : {}),
    },
    include: { role: true },
  })
  res.status(201).json({ user: mapUser(user) })
})

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

usersRouter.put('/:id', requireAuth, requirePermission('users.update'), async (req, res) => {
  const id = paramId(req.params.id)
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (existing.id === req.user!.id && parsed.data.isActive === false) {
    res.status(400).json({ error: 'You cannot deactivate your own account' })
    return
  }

  if (parsed.data.email) {
    const email = parsed.data.email.toLowerCase()
    const clash = await prisma.user.findFirst({
      where: { email, NOT: { id } },
    })
    if (clash) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }
  }

  if (parsed.data.roleId) {
    const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } })
    if (!role) {
      res.status(400).json({ error: 'Invalid role' })
      return
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email?.toLowerCase(),
      roleId: parsed.data.roleId,
      isActive: parsed.data.isActive,
      ...(parsed.data.password
        ? { passwordHash: await bcrypt.hash(parsed.data.password, 10) }
        : {}),
    },
    include: { role: true },
  })
  bustAuthCache(id)

  if (user.role.code === 'user') {
    const settings = await getAppSetting()
    await prisma.payableAccount.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        currencyId: settings.currencyId,
        balance: 0,
        totalCharged: 0,
        totalPaid: 0,
      },
      update: {},
    })
  }

  res.json({ user: mapUser(user) })
})

usersRouter.delete('/:id', requireAuth, requirePermission('users.delete'), async (req, res) => {
  const id = paramId(req.params.id)
  if (id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own account' })
    return
  }
  try {
    await prisma.user.delete({ where: { id } })
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'User not found' })
  }
})
