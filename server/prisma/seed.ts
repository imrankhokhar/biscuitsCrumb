import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import {
  ADMIN_PERMISSIONS,
  PERMISSIONS,
  USER_PERMISSIONS,
} from '../src/lib/permissions.js'

const prisma = new PrismaClient()

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
]

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

  await prisma.emailTemplate.upsert({
    where: { code: 'payable_reminder' },
    create: {
      code: 'payable_reminder',
      name: 'Payable reminder',
      subject: 'Outstanding payable reminder',
      body: 'Hi {{name}},\n\nYour current payable amount is {{amount}}.\nPlease settle at your earliest convenience.\n\nThanks,\n{{appName}}',
    },
    update: {},
  })
  await prisma.emailTemplate.upsert({
    where: { code: 'welcome' },
    create: {
      code: 'welcome',
      name: 'Welcome email',
      subject: 'Welcome to {{appName}}',
      body: 'Hi {{name}},\n\nWelcome to {{appName}} — {{tagline}}.\n\nYou can sign in and start picking items.\n\nThanks!',
    },
    update: {},
  })

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
      data: [
        {
          title: 'Cola Can',
          description: 'Chilled soft drink',
          price: 1.5,
          buyingPrice: 0.9,
          quantity: 20,
          imageUrl:
            'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop',
          currencyId: usd.id,
        },
        {
          title: 'Potato Chips',
          description: 'Crispy snack pack',
          price: 2.0,
          buyingPrice: 1.2,
          quantity: 15,
          imageUrl:
            'https://images.unsplash.com/photo-1566478989037-eec1753d04eb?w=400&h=400&fit=crop',
          currencyId: usd.id,
        },
        {
          title: 'Chocolate Bar',
          description: 'Sweet treat',
          price: 1.25,
          buyingPrice: 0.7,
          quantity: 25,
          imageUrl:
            'https://images.unsplash.com/photo-1606312619070-d48b4cbc664a?w=400&h=400&fit=crop',
          currencyId: usd.id,
        },
        {
          title: 'Bottled Water',
          description: '500ml still water',
          price: 0.75,
          buyingPrice: 0.35,
          quantity: 30,
          imageUrl:
            'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop',
          currencyId: usd.id,
        },
      ],
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
