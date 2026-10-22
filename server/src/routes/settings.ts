import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { getAppSetting } from '../lib/settings.js'
import { uploadAny, uploadImage } from '../lib/upload.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'

export const settingsRouter = Router()

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

async function setCurrency(
  currencyCodeOrId: { currency?: string; currencyId?: string },
  userId: string,
) {
  const currency = currencyCodeOrId.currencyId
    ? await prisma.currency.findFirst({
        where: { id: currencyCodeOrId.currencyId, isActive: true },
      })
    : await prisma.currency.findFirst({
        where: { code: currencyCodeOrId.currency?.toUpperCase(), isActive: true },
      })

  if (!currency) return null

  return prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      currencyId: currency.id,
      updatedByUserId: userId,
    },
    update: {
      currencyId: currency.id,
      updatedByUserId: userId,
    },
    include: { currency: true },
  })
}

settingsRouter.get('/public', async (_req, res) => {
  const settings = await getAppSetting()
  res.json({
    branding: {
      appName: settings.appName,
      tagline: settings.tagline,
      logoUrl: settings.logoUrl,
    },
  })
})

settingsRouter.get('/currencies', requireAuth, async (_req, res) => {
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })
  res.json({
    currencies: currencies.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      symbol: c.symbol,
    })),
  })
})

settingsRouter.get('/', requireAuth, requirePermission('settings.view'), async (_req, res) => {
  const settings = await getAppSetting()
  res.json({ settings: mapSettings(settings) })
})

settingsRouter.put(
  '/currency',
  requireAuth,
  requirePermission('settings.update'),
  async (req, res) => {
    const parsed = z
      .object({
        currency: z.string().trim().min(3).max(3).optional(),
        currencyId: z.string().optional(),
      })
      .safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings payload' })
      return
    }

    const settings = await setCurrency(parsed.data, req.user!.id)
    if (!settings) {
      res.status(400).json({ error: 'Currency not found' })
      return
    }
    res.json({ settings: mapSettings(settings) })
  },
)

settingsRouter.put('/', requireAuth, requirePermission('settings.update'), async (req, res) => {
  const parsed = z
    .object({
      currency: z.string().trim().min(3).max(3).optional(),
      currencyId: z.string().optional(),
    })
    .safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid settings payload' })
    return
  }

  const settings = await setCurrency(parsed.data, req.user!.id)
  if (!settings) {
    res.status(400).json({ error: 'Currency not found' })
    return
  }
  res.json({ settings: mapSettings(settings) })
})

settingsRouter.put(
  '/branding',
  requireAuth,
  requirePermission('settings.update'),
  uploadImage.single('logo'),
  async (req, res) => {
    const parsed = z
      .object({
        appName: z.string().trim().min(1).max(80),
        tagline: z.string().trim().max(120),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid branding payload' })
      return
    }
    const current = await getAppSetting()
    const settings = await prisma.setting.update({
      where: { id: 1 },
      data: {
        appName: parsed.data.appName,
        tagline: parsed.data.tagline,
        logoUrl: req.file ? `/uploads/${req.file.filename}` : current.logoUrl,
        updatedByUserId: req.user!.id,
      },
      include: { currency: true },
    })
    res.json({ settings: mapSettings(settings) })
  },
)

settingsRouter.put(
  '/notifications',
  requireAuth,
  requirePermission('settings.update'),
  uploadAny.fields([
    { name: 'sound', maxCount: 1 },
    { name: 'paymentSound', maxCount: 1 },
    { name: 'unselectSound', maxCount: 1 },
  ]),
  async (req, res) => {
    const enabledRaw = req.body.enabled
    const enabled =
      enabledRaw === true ||
      enabledRaw === 'true' ||
      enabledRaw === '1' ||
      enabledRaw === 'on'
    const current = await getAppSetting()
    const files = req.files as
      | { [field: string]: Express.Multer.File[] }
      | undefined
    const itemSound = files?.sound?.[0]
    const paymentSound = files?.paymentSound?.[0]
    const unselectSound = files?.unselectSound?.[0]
    const settings = await prisma.setting.update({
      where: { id: 1 },
      data: {
        notificationSoundEnabled: enabled,
        notificationSoundUrl: itemSound
          ? `/uploads/${itemSound.filename}`
          : current.notificationSoundUrl,
        paymentSoundUrl: paymentSound
          ? `/uploads/${paymentSound.filename}`
          : current.paymentSoundUrl,
        unselectSoundUrl: unselectSound
          ? `/uploads/${unselectSound.filename}`
          : current.unselectSoundUrl,
        updatedByUserId: req.user!.id,
      },
      include: { currency: true },
    })
    res.json({ settings: mapSettings(settings) })
  },
)

settingsRouter.put(
  '/smtp',
  requireAuth,
  requirePermission('settings.smtp'),
  async (req, res) => {
    const parsed = z
      .object({
        host: z.string().trim(),
        port: z.coerce.number().int().min(1).max(65535),
        secure: z.boolean(),
        user: z.string().trim(),
        pass: z.string().optional(),
        from: z.string().trim().min(3),
      })
      .safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid SMTP payload' })
      return
    }

    const current = await getAppSetting()
    const pass =
      parsed.data.pass && parsed.data.pass !== '********'
        ? parsed.data.pass
        : current.smtpPass

    const settings = await prisma.setting.update({
      where: { id: 1 },
      data: {
        smtpHost: parsed.data.host,
        smtpPort: parsed.data.port,
        smtpSecure: parsed.data.secure,
        smtpUser: parsed.data.user,
        smtpPass: pass,
        smtpFrom: parsed.data.from,
        updatedByUserId: req.user!.id,
      },
      include: { currency: true },
    })

    res.json({ settings: mapSettings(settings) })
  },
)

settingsRouter.get(
  '/templates',
  requireAuth,
  requirePermission('settings.view'),
  async (_req, res) => {
    const templates = await prisma.emailTemplate.findMany({ orderBy: { name: 'asc' } })
    res.json({ templates })
  },
)

settingsRouter.put(
  '/templates/:id',
  requireAuth,
  requirePermission('settings.update'),
  async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(80),
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid template' })
      return
    }
    try {
      const template = await prisma.emailTemplate.update({
        where: { id },
        data: parsed.data,
      })
      res.json({ template })
    } catch {
      res.status(404).json({ error: 'Template not found' })
    }
  },
)

settingsRouter.post(
  '/templates',
  requireAuth,
  requirePermission('settings.update'),
  async (req, res) => {
    const parsed = z
      .object({
        code: z
          .string()
          .trim()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9_]+$/),
        name: z.string().trim().min(1).max(80),
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid template' })
      return
    }
    try {
      const template = await prisma.emailTemplate.create({ data: parsed.data })
      res.status(201).json({ template })
    } catch {
      res.status(409).json({ error: 'Template code already exists' })
    }
  },
)
