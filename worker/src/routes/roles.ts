import { Hono } from 'hono'
import { z } from 'zod'
import { bustAuthCache, requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import { jsonBody } from '../util.js'

export const rolesRoutes = new Hono<AppEnv>()

rolesRoutes.get('/', requireAuth, requirePermission('roles.view'), async (c) => {
  const roles = await c.get('prisma').role.findMany({
    orderBy: { name: 'asc' },
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
  })
  return c.json({
    roles: roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      userCount: r._count.users,
      permissionCodes: r.permissions.map((p) => p.permission.code),
    })),
  })
})

rolesRoutes.get('/permissions', requireAuth, requirePermission('roles.view'), async (c) =>
  c.json({
    permissions: await c.get('prisma').permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }),
  }),
)

rolesRoutes.post('/', requireAuth, requirePermission('roles.manage'), async (c) => {
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers, underscore'),
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(200).optional(),
    })
    .safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid role payload' }, 400)
  try {
    const role = await c.get('prisma').role.create({
      data: { code: parsed.data.code, name: parsed.data.name, description: parsed.data.description ?? '' },
    })
    return c.json(
      {
        role: {
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          userCount: 0,
          permissionCodes: [],
        },
      },
      201,
    )
  } catch {
    return c.json({ error: 'Role code already exists' }, 409)
  }
})

rolesRoutes.delete('/:roleId', requireAuth, requirePermission('roles.manage'), async (c) => {
  const prisma = c.get('prisma')
  const roleId = c.req.param('roleId')
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  })
  if (!role) return c.json({ error: 'Role not found' }, 404)
  if (role.code === 'admin' || role.code === 'user') {
    return c.json({ error: 'System roles (admin, user) cannot be deleted' }, 400)
  }
  if (role._count.users > 0) {
    return c.json(
      { error: `Cannot delete role while ${role._count.users} user(s) are assigned. Reassign them first.` },
      400,
    )
  }
  await prisma.rolePermission.deleteMany({ where: { roleId } })
  await prisma.role.delete({ where: { id: roleId } })
  return c.json({ ok: true })
})

rolesRoutes.put('/:roleId/permissions', requireAuth, requirePermission('roles.manage'), async (c) => {
  const prisma = c.get('prisma')
  const parsed = z.object({ permissionCodes: z.array(z.string()) }).safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid payload' }, 400)

  const roleId = c.req.param('roleId')
  if (!(await prisma.role.findUnique({ where: { id: roleId } }))) {
    return c.json({ error: 'Role not found' }, 404)
  }

  const perms = await prisma.permission.findMany({ where: { code: { in: parsed.data.permissionCodes } } })
  // ponytail: delete+insert is not atomic on D1 (adapter ignores transactions); a crash in between leaves the role
  // with no permissions until the PUT is retried. Upgrade path: env.DB.batch([...]).
  await prisma.rolePermission.deleteMany({ where: { roleId } })
  if (perms.length) {
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) })
  }
  bustAuthCache()

  const updated = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  })
  return c.json({
    role: {
      id: updated!.id,
      code: updated!.code,
      name: updated!.name,
      permissionCodes: updated!.permissions.map((p) => p.permission.code),
    },
  })
})
