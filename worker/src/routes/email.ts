import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import { sendMail } from '../mailer.js'
import { getAppSetting, jsonBody } from '../util.js'

export const emailRoutes = new Hono<AppEnv>()

emailRoutes.get('/users', requireAuth, requirePermission('email.view'), async (c) => {
  const users = await c.get('prisma').user.findMany({
    where: { role: { code: 'user' }, isActive: true },
    orderBy: { name: 'asc' },
    include: { payableAccount: true },
  })
  return c.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      payable: +(u.payableAccount?.balance ?? 0).toFixed(2),
    })),
  })
})

emailRoutes.get('/logs', requireAuth, requirePermission('email.view'), async (c) => {
  const emails = await c.get('prisma').emailMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  return c.json({
    emails: emails.map((m) => ({
      id: m.id,
      toUserId: m.toUserId,
      toEmail: m.toEmail,
      fromEmail: m.fromEmail,
      subject: m.subject,
      body: m.body,
      status: m.status,
      errorMessage: m.errorMessage,
      sentAt: m.sentAt ?? m.createdAt,
      createdAt: m.createdAt,
    })),
  })
})

const sendSchema = z.object({
  toUserId: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
})

emailRoutes.post('/send', requireAuth, requirePermission('email.send'), async (c) => {
  const prisma = c.get('prisma')
  const parsed = sendSchema.safeParse(await jsonBody(c))
  if (!parsed.success) return c.json({ error: 'Invalid email payload' }, 400)

  const user = await prisma.user.findFirst({
    where: { id: parsed.data.toUserId, role: { code: 'user' }, isActive: true },
  })
  if (!user) return c.json({ error: 'User not found' }, 404)

  const settings = await getAppSetting(prisma)
  const fromEmail = settings.smtpFrom || 'Excelorithm Vending <noreply@excelorithm.com>'
  const result = await sendMail(prisma, { to: user.email, subject: parsed.data.subject, text: parsed.data.body })

  const entry = await prisma.emailMessage.create({
    data: {
      toUserId: user.id,
      toEmail: user.email,
      fromEmail,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: result.ok ? 'sent' : 'failed',
      errorMessage: result.ok ? '' : result.error,
      sentByUserId: c.get('user').id,
      sentAt: result.ok ? new Date() : null,
    },
  })

  if (!result.ok) {
    return c.json(
      {
        error: result.error,
        email: {
          id: entry.id,
          toUserId: entry.toUserId,
          toEmail: entry.toEmail,
          subject: entry.subject,
          body: entry.body,
          status: entry.status,
          sentAt: entry.createdAt,
        },
      },
      502,
    )
  }

  return c.json(
    {
      email: {
        id: entry.id,
        toUserId: entry.toUserId,
        toEmail: entry.toEmail,
        fromEmail: entry.fromEmail,
        subject: entry.subject,
        body: entry.body,
        status: entry.status,
        sentAt: entry.sentAt ?? entry.createdAt,
        createdAt: entry.createdAt,
      },
    },
    201,
  )
})
