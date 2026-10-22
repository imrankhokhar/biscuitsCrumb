import { Router } from 'express'
import { prisma } from '../prisma.js'
import { requireAuth, requirePermission } from '../middleware/auth.js'

export const notificationsRouter = Router()

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value
}

notificationsRouter.get('/', requireAuth, requirePermission('notifications.view'), async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load notifications' })
  }
})

notificationsRouter.get(
  '/unread-count',
  requireAuth,
  requirePermission('notifications.view'),
  async (req, res) => {
    try {
      const unreadCount = await prisma.notification.count({
        where: { userId: req.user!.id, isRead: false },
      })
      res.json({ unreadCount })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not load unread count' })
    }
  },
)

notificationsRouter.post(
  '/read-all',
  requireAuth,
  requirePermission('notifications.view'),
  async (req, res) => {
    try {
      await prisma.notification.updateMany({
        where: { userId: req.user!.id, isRead: false },
        data: { isRead: true },
      })
      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not mark notifications read' })
    }
  },
)

notificationsRouter.post(
  '/:id/read',
  requireAuth,
  requirePermission('notifications.view'),
  async (req, res) => {
    try {
      const id = paramId(req.params.id)
      const notification = await prisma.notification.updateMany({
        where: { id, userId: req.user!.id },
        data: { isRead: true },
      })
      if (notification.count === 0) {
        res.status(404).json({ error: 'Notification not found' })
        return
      }
      res.json({ ok: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'Could not mark notification read' })
    }
  },
)

export async function createUserNotification(input: {
  userId: string
  type: string
  title: string
  message: string
}) {
  return prisma.notification.create({ data: input })
}
