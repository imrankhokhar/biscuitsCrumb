import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { bustAuthCache, requireAuth, requirePermission } from '../middleware/auth.js'

export const rolesRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

rolesRouter.get('/', requireAuth, requirePermission('roles.view'), async (_req, res) => {
  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  })
  res.json({
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

rolesRouter.get(
  '/permissions',
  requireAuth,
  requirePermission('roles.view'),
  async (_req, res) => {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    })
    res.json({ permissions })
  },
)

rolesRouter.post('/', requireAuth, requirePermission('roles.manage'), async (req, res) => {
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
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid role payload' })
    return
  }
  try {
    const role = await prisma.role.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
      },
    })
    res.status(201).json({
      role: {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        userCount: 0,
        permissionCodes: [],
      },
    })
  } catch {
    res.status(409).json({ error: 'Role code already exists' })
  }
})

rolesRouter.delete(
  '/:roleId',
  requireAuth,
  requirePermission('roles.manage'),
  async (req, res) => {
    const roleId = paramId(req.params.roleId)
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { users: true } } },
    })
    if (!role) {
      res.status(404).json({ error: 'Role not found' })
      return
    }
    if (role.code === 'admin' || role.code === 'user') {
      res.status(400).json({ error: 'System roles (admin, user) cannot be deleted' })
      return
    }
    if (role._count.users > 0) {
      res.status(400).json({
        error: `Cannot delete role while ${role._count.users} user(s) are assigned. Reassign them first.`,
      })
      return
    }
    await prisma.rolePermission.deleteMany({ where: { roleId } })
    await prisma.role.delete({ where: { id: roleId } })
    res.json({ ok: true })
  },
)

rolesRouter.put(
  '/:roleId/permissions',
  requireAuth,
  requirePermission('roles.manage'),
  async (req, res) => {
    const parsed = z.object({ permissionCodes: z.array(z.string()) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payload' })
      return
    }

    const roleId = paramId(req.params.roleId)
    const role = await prisma.role.findUnique({ where: { id: roleId } })
    if (!role) {
      res.status(404).json({ error: 'Role not found' })
      return
    }

    const perms = await prisma.permission.findMany({
      where: { code: { in: parsed.data.permissionCodes } },
    })

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } })
      if (perms.length) {
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId, permissionId: p.id })),
        })
      }
    })
    bustAuthCache()

    const updated = await prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    })

    res.json({
      role: {
        id: updated!.id,
        code: updated!.code,
        name: updated!.name,
        permissionCodes: updated!.permissions.map((p) => p.permission.code),
      },
    })
  },
)
