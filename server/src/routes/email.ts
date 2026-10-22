import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'
import { sendMail } from '../lib/mailer.js'
import { getAppSetting } from '../lib/settings.js'

export const emailRouter = Router()

emailRouter.get('/users', requireAuth, requirePermission('email.view'), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { code: 'user' }, isActive: true },
    orderBy: { name: 'asc' },
    include: { payableAccount: true },
  })
  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      payable: +(u.payableAccount?.balance ?? 0).toFixed(2),
    })),
  })
})

emailRouter.get('/logs', requireAuth, requirePermission('email.view'), async (_req, res) => {
  const emails = await prisma.emailMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  res.json({
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

emailRouter.post('/send', requireAuth, requirePermission('email.send'), async (req, res) => {
  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email payload' })
    return
  }

  const user = await prisma.user.findFirst({
    where: { id: parsed.data.toUserId, role: { code: 'user' }, isActive: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const settings = await getAppSetting()
  const fromEmail =
    settings.smtpFrom || 'Excelorithm Vending <noreply@excelorithm.com>'
  const result = await sendMail({
    to: user.email,
    subject: parsed.data.subject,
    text: parsed.data.body,
  })

  const entry = await prisma.emailMessage.create({
    data: {
      toUserId: user.id,
      toEmail: user.email,
      fromEmail,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: result.ok ? 'sent' : 'failed',
      errorMessage: result.ok ? '' : result.error,
      sentByUserId: req.user!.id,
      sentAt: result.ok ? new Date() : null,
    },
  })

  if (!result.ok) {
    res.status(502).json({
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
    })
    return
  }

  res.status(201).json({
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
  })
})
