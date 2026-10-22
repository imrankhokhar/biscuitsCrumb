import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import {
  ADMIN_PERMISSIONS,
  PERMISSIONS,
  USER_PERMISSIONS,
} from '../src/lib/permissions.js'
import { CURRENCIES, EMAIL_TEMPLATES, SAMPLE_ITEMS } from './seedData.js'

const prisma = new PrismaClient()

async function syncPermissions() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        module: p.module,
        description: p.description,
      },
      update: {
        name: p.name,
        module: p.module,
        description: p.description,
      },
    })
  }
}

async function assignRolePermissions(roleId: string, codes: string[]) {
  const perms = await prisma.permission.findMany({
    where: { code: { in: codes } },
  })
  for (const perm of perms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId: perm.id },
      },
      create: { roleId, permissionId: perm.id },
      update: {},
    })
  }
}

async function main() {
  await syncPermissions()

  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    create: { code: 'admin', name: 'Administrator', description: 'Full access' },
    update: { name: 'Administrator' },
  })
  const userRole = await prisma.role.upsert({
    where: { code: 'user' },
    create: { code: 'user', name: 'User', description: 'Can pick items and build payable' },
    update: { name: 'User' },
  })

  await assignRolePermissions(adminRole.id, [...ADMIN_PERMISSIONS])
  await assignRolePermissions(userRole.id, [...USER_PERMISSIONS])

  for (const c of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: c.code },
      create: c,
      update: { name: c.name, symbol: c.symbol, isActive: true },
    })
  }

  const usd = await prisma.currency.findUniqueOrThrow({ where: { code: 'USD' } })

  await prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      currencyId: usd.id,
      appName: 'Excelorithm',
      tagline: 'Vending Machine',
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER || '',
      smtpPass: process.env.SMTP_PASS || '',
      smtpFrom: process.env.SMTP_FROM || 'Excelorithm Vending <noreply@excelorithm.com>',
      notificationSoundEnabled: true,
    },
    update: {},
  })

  for (const t of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({ where: { code: t.code }, create: t, update: {} })
  }

  const passwordHash = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@excelorithm.com' },
    create: {
      name: 'Admin',
      email: 'admin@excelorithm.com',
      passwordHash,
      roleId: adminRole.id,
      themePreference: 'system',
    },
    // Do not reset password on re-seed (Docker restarts / permission sync)
    update: { roleId: adminRole.id, name: 'Admin', isActive: true },
  })

  const itemCount = await prisma.item.count()
  if (itemCount === 0) {
    await prisma.item.createMany({
      data: SAMPLE_ITEMS.map((item) => ({ ...item, currencyId: usd.id })),
    })
  }

  console.log('Seeded roles, permissions, currencies, settings, admin, sample items')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
