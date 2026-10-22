import { Hono } from 'hono'
import { requireAuth, requirePermission } from '../auth.js'
import type { AppEnv } from '../env.js'
import { errorResponse } from '../util.js'

export const notificationsRoutes = new Hono<AppEnv>()

const guard = [requireAuth, requirePermission('notifications.view')] as const

notificationsRoutes.get('/', ...guard, async (c) => {
  try {
    const notifications = await c.get('prisma').notification.findMany({
      where: { userId: c.get('user').id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return c.json({
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
    return c.json({ error: 'Could not load notifications' }, 500)
  }
})

notificationsRoutes.get('/unread-count', ...guard, async (c) => {
  try {
    const unreadCount = await c.get('prisma').notification.count({
      where: { userId: c.get('user').id, isRead: false },
    })
    return c.json({ unreadCount })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Could not load unread count' }, 500)
  }
})

notificationsRoutes.post('/read-all', ...guard, async (c) => {
  try {
    await c.get('prisma').notification.updateMany({
      where: { userId: c.get('user').id, isRead: false },
      data: { isRead: true },
    })
    return c.json({ ok: true })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Could not mark notifications read' }, 500)
  }
})

notificationsRoutes.post('/:id/read', ...guard, async (c) => {
  try {
    const result = await c.get('prisma').notification.updateMany({
      where: { id: c.req.param('id'), userId: c.get('user').id },
      data: { isRead: true },
    })
    if (result.count === 0) return c.json({ error: 'Notification not found' }, 404)
    return c.json({ ok: true })
  } catch (err) {
    return errorResponse(c, err, 'Could not mark notification read')
  }
})
