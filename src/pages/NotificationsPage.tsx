import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PageHeader } from '../components/PageHeader'
import type { AppNotification } from '../types'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function NotificationsPage() {
  const { refreshUnreadNotifications } = useApp()
  const [rows, setRows] = useState<AppNotification[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { notifications } = await api.notifications()
    setRows(notifications)
    await refreshUnreadNotifications().catch(() => undefined)
  }, [refreshUnreadNotifications])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function markOne(id: string) {
    await api.markNotificationRead(id)
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    await refreshUnreadNotifications().catch(() => undefined)
  }

  async function markAll() {
    setBusy(true)
    try {
      await api.markAllNotificationsRead()
      setRows((prev) => prev.map((n) => ({ ...n, isRead: true })))
      await refreshUnreadNotifications().catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark as read')
    } finally {
      setBusy(false)
    }
  }

  const unread = rows.filter((n) => !n.isRead).length

  return (
    <section className="module-panel">
      <PageHeader
        title="Notifications"
        description="Payment alerts and account updates."
        crumbs={[{ label: 'Notifications' }]}
        actions={
          unread > 0 ? (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void markAll()}
            >
              Mark all read
            </button>
          ) : null
        }
      />

      {error && <p className="error">{error}</p>}

      {rows.length === 0 ? (
        <p className="empty">No notifications yet.</p>
      ) : (
        <ul className="notification-list">
          {rows.map((n) => (
            <li key={n.id} className={`notification-row ${n.isRead ? 'is-read' : 'is-unread'}`}>
              <div className="notification-copy">
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <span className="muted">{formatWhen(n.createdAt)}</span>
              </div>
              {!n.isRead && (
                <button type="button" className="btn ghost sm" onClick={() => void markOne(n.id)}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
