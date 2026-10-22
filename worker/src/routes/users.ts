import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { bustAuthCache, requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import { getAppSetting, jsonBody } from '../util.js'

export const usersRoutes = new Hono<AppEnv>()

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

usersRoutes.get('/', requireAuth, requirePermission('users.view'), async (c) => {
  const users = await c.get('prisma').user.findMany({ include: { role: true }, orderBy: { createdAt: 'desc' } })
  return c.json({ users: users.map(mapUser) })
})

usersRoutes.get('/roles', requireAuth, requirePermission('users.view'), async (c) => {
  const roles = await c.get('prisma').role.findMany({ orderBy: { name: 'asc' } })
  return c.json({ roles: roles.map((r) => ({ id: r.id, code: r.code, name: r.name })) })
})

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6),
  roleId: z.string().min(1),
  isActive: z.boolean().optional(),
})

usersRoutes.post('/', requireAuth, requirePermission('users.create'), async (c) => {
  const prisma = c.get('prisma')
  const parsed = createSchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const email = parsed.data.email.toLowerCase()
  if (await prisma.user.findUnique({ where: { email } })) {
    return c.json({ error: 'Email already registered' }, 409)
  }
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } })
  if (!role) return c.json({ error: 'Invalid role' }, 400)

  const settings = await getAppSetting(prisma)
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      roleId: role.id,
      isActive: parsed.data.isActive ?? true,
      themePreference: 'system',
      ...(role.code === 'user'
        ? {
            payableAccount: {
              create: { currencyId: settings.currencyId, balance: 0, totalCharged: 0, totalPaid: 0 },
            },
          }
        : {}),
    },
    include: { role: true },
  })
  return c.json({ user: mapUser(user) }, 201)
})

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

usersRoutes.put('/:id', requireAuth, requirePermission('users.update'), async (c) => {
  const prisma = c.get('prisma')
  const id = c.req.param('id')
  const parsed = updateSchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const existing = await prisma.user.findUnique({ where: { id }, include: { role: true } })
  if (!existing) return c.json({ error: 'User not found' }, 404)
  if (existing.id === c.get('user').id && parsed.data.isActive === false) {
    return c.json({ error: 'You cannot deactivate your own account' }, 400)
  }

  if (parsed.data.email) {
    const clash = await prisma.user.findFirst({
      where: { email: parsed.data.email.toLowerCase(), NOT: { id } },
    })
    if (clash) return c.json({ error: 'Email already registered' }, 409)
  }
  if (parsed.data.roleId && !(await prisma.role.findUnique({ where: { id: parsed.data.roleId } }))) {
    return c.json({ error: 'Invalid role' }, 400)
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email?.toLowerCase(),
      roleId: parsed.data.roleId,
      isActive: parsed.data.isActive,
      ...(parsed.data.password ? { passwordHash: await bcrypt.hash(parsed.data.password, 10) } : {}),
    },
    include: { role: true },
  })
  bustAuthCache(id)

  if (user.role.code === 'user') {
    const settings = await getAppSetting(prisma)
    await prisma.payableAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id, currencyId: settings.currencyId, balance: 0, totalCharged: 0, totalPaid: 0 },
      update: {},
    })
  }
  return c.json({ user: mapUser(user) })
})

usersRoutes.delete('/:id', requireAuth, requirePermission('users.delete'), async (c) => {
  const id = c.req.param('id')
  if (id === c.get('user').id) return c.json({ error: 'You cannot delete your own account' }, 400)
  try {
    await c.get('prisma').user.delete({ where: { id } })
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'User not found' }, 404)
  }
})
