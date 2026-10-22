import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import type { PrismaClient } from '../prisma.js'
import { fileOf, putUpload, readForm } from '../r2.js'
import { getAppSetting, jsonBody } from '../util.js'

export const settingsRoutes = new Hono<AppEnv>()

function mapSettings(settings: Awaited<ReturnType<typeof getAppSetting>>) {
  return {
    id: settings.id,
    appName: settings.appName,
    tagline: settings.tagline,
    logoUrl: settings.logoUrl,
    currency: settings.currency.code,
    currencyId: settings.currencyId,
    currencyName: settings.currency.name,
    currencySymbol: settings.currency.symbol,
    smtp: {
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      user: settings.smtpUser,
      pass: settings.smtpPass ? '********' : '',
      hasPass: Boolean(settings.smtpPass),
      from: settings.smtpFrom,
    },
    notificationSoundEnabled: settings.notificationSoundEnabled,
    notificationSoundUrl: settings.notificationSoundUrl,
    paymentSoundUrl: settings.paymentSoundUrl,
    unselectSoundUrl: settings.unselectSoundUrl,
    updatedAt: settings.updatedAt,
  }
}

const currencySchema = z.object({
  currency: z.string().trim().min(3).max(3).optional(),
  currencyId: z.string().optional(),
})

async function setCurrency(
  prisma: PrismaClient,
  input: { currency?: string; currencyId?: string },
  userId: string,
) {
  const currency = input.currencyId
    ? await prisma.currency.findFirst({ where: { id: input.currencyId, isActive: true } })
    : await prisma.currency.findFirst({ where: { code: input.currency?.toUpperCase(), isActive: true } })
  if (!currency) return null

  return prisma.setting.upsert({
    where: { id: 1 },
    create: { id: 1, currencyId: currency.id, updatedByUserId: userId },
    update: { currencyId: currency.id, updatedByUserId: userId },
    include: { currency: true },
  })
}

settingsRoutes.get('/public', async (c) => {
  const settings = await getAppSetting(c.get('prisma'))
  return c.json({
    branding: { appName: settings.appName, tagline: settings.tagline, logoUrl: settings.logoUrl },
  })
})

settingsRoutes.get('/currencies', requireAuth, async (c) => {
  const currencies = await c.get('prisma').currency.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })
  return c.json({
    currencies: currencies.map((cur) => ({ id: cur.id, code: cur.code, name: cur.name, symbol: cur.symbol })),
  })
})

settingsRoutes.get('/', requireAuth, requirePermission('settings.view'), async (c) =>
  c.json({ settings: mapSettings(await getAppSetting(c.get('prisma'))) }),
)

// PUT /currency and PUT / are the same operation (the Express server exposes both).
for (const path of ['/currency', '/']) {
  settingsRoutes.put(path, requireAuth, requirePermission('settings.update'), async (c) => {
    const parsed = currencySchema.safeParse(await jsonBody(c))
    if (!parsed.success) return c.json({ error: 'Invalid settings payload' }, 400)

    const settings = await setCurrency(c.get('prisma'), parsed.data, c.get('user').id)
    if (!settings) return c.json({ error: 'Currency not found' }, 400)
    return c.json({ settings: mapSettings(settings) })
  })
}

settingsRoutes.put('/branding', requireAuth, requirePermission('settings.update'), async (c) => {
  const prisma = c.get('prisma')
  const form = await readForm(c)
  const logo = fileOf(form, 'logo', { image: true })
  const parsed = z
    .object({ appName: z.string().trim().min(1).max(80), tagline: z.string().trim().max(120) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) return c.json({ error: 'Invalid branding payload' }, 400)

  const settings = await prisma.setting.update({
    where: { id: 1 },
    data: {
      appName: parsed.data.appName,
      tagline: parsed.data.tagline,
      ...(logo ? { logoUrl: await putUpload(c.env.UPLOADS, logo) } : {}),
      updatedByUserId: c.get('user').id,
    },
    include: { currency: true },
  })
  return c.json({ settings: mapSettings(settings) })
})

settingsRoutes.put('/notifications', requireAuth, requirePermission('settings.update'), async (c) => {
  const prisma = c.get('prisma')
  const form = await readForm(c)
  const enabled = ['true', '1', 'on'].includes(String(form.get('enabled')))

  const [itemSound, paymentSound, unselectSound] = ['sound', 'paymentSound', 'unselectSound'].map((name) =>
    fileOf(form, name),
  )
  const settings = await prisma.setting.update({
    where: { id: 1 },
    data: {
      notificationSoundEnabled: enabled,
      ...(itemSound ? { notificationSoundUrl: await putUpload(c.env.UPLOADS, itemSound) } : {}),
      ...(paymentSound ? { paymentSoundUrl: await putUpload(c.env.UPLOADS, paymentSound) } : {}),
      ...(unselectSound ? { unselectSoundUrl: await putUpload(c.env.UPLOADS, unselectSound) } : {}),
      updatedByUserId: c.get('user').id,
    },
    include: { currency: true },
  })
  return c.json({ settings: mapSettings(settings) })
})

settingsRoutes.put('/smtp', requireAuth, requirePermission('settings.smtp'), async (c) => {
  const prisma = c.get('prisma')
  const parsed = z
    .object({
      host: z.string().trim(),
      port: z.coerce.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().trim(),
      pass: z.string().optional(),
      from: z.string().trim().min(3),
    })
    .safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid SMTP payload' }, 400)

  const current = await getAppSetting(prisma)
  const settings = await prisma.setting.update({
    where: { id: 1 },
    data: {
      smtpHost: parsed.data.host,
      smtpPort: parsed.data.port,
      smtpSecure: parsed.data.secure,
      smtpUser: parsed.data.user,
      smtpPass: parsed.data.pass && parsed.data.pass !== '********' ? parsed.data.pass : current.smtpPass,
      smtpFrom: parsed.data.from,
      updatedByUserId: c.get('user').id,
    },
    include: { currency: true },
  })
  return c.json({ settings: mapSettings(settings) })
})

settingsRoutes.get('/templates', requireAuth, requirePermission('settings.view'), async (c) =>
  c.json({ templates: await c.get('prisma').emailTemplate.findMany({ orderBy: { name: 'asc' } }) }),
)

const templateFields = {
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
}

settingsRoutes.put('/templates/:id', requireAuth, requirePermission('settings.update'), async (c) => {
  const parsed = z.object(templateFields).safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid template' }, 400)
  try {
    const template = await c.get('prisma').emailTemplate.update({
      where: { id: c.req.param('id') },
      data: parsed.data,
    })
    return c.json({ template })
  } catch {
    return c.json({ error: 'Template not found' }, 404)
  }
})

settingsRoutes.post('/templates', requireAuth, requirePermission('settings.update'), async (c) => {
  const parsed = z
    .object({ code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/), ...templateFields })
    .safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid template' }, 400)
  try {
    const template = await c.get('prisma').emailTemplate.create({ data: parsed.data })
    return c.json({ template }, 201)
  } catch {
    return c.json({ error: 'Template code already exists' }, 409)
  }
})
