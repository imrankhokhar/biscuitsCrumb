import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { formatMoney } from '../lib/currency'
import { PageHeader } from '../components/PageHeader'
import type { EmailLog, EmailUser } from '../types'

export function EmailPage() {
  const { currency, currencies } = useApp()
  const [users, setUsers] = useState<EmailUser[]>([])
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [toUserId, setToUserId] = useState('')
  const [subject, setSubject] = useState('Outstanding payable reminder')
  const [body, setBody] = useState('')
  const [sentMsg, setSentMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [u, e] = await Promise.all([api.emailUsers(), api.emailLogs()])
      setUsers(u.users)
      setLogs(e.emails)
      setToUserId(u.users[0]?.id ?? '')
    })()
  }, [])

  const selected = useMemo(() => users.find((u) => u.id === toUserId), [users, toUserId])

  function fillReminder() {
    if (!selected) return
    setSubject('Outstanding payable reminder')
    setBody(
      `Hi ${selected.name},\n\nYour current payable amount is ${formatMoney(selected.payable, currency, currencies)}.\nPlease settle at your earliest convenience.\n\nThanks,\nExcelorithm Vending Machine`,
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!toUserId || !subject.trim() || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { email } = await api.sendEmail(toUserId, subject, body)
      setLogs((prev) => [email, ...prev])
      setSentMsg(`Email sent to ${selected?.email ?? 'user'}`)
      window.setTimeout(() => setSentMsg(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="Email"
        description="Send reminders using SMTP from Settings. Without SMTP, messages are logged on the server."
        crumbs={[{ label: 'Email' }]}
      />

      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          To user
          <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}) — due{' '}
                {formatMoney(u.payable, currency, currencies)}
              </option>
            ))}
          </select>
        </label>
        <div className="row-actions">
          <button type="button" className="btn secondary" onClick={fillReminder}>
            Fill unpaid reminder
          </button>
        </div>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label>
          Message
          <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy || users.length === 0}>
          {busy ? 'Sending…' : 'Send email'}
        </button>
        {sentMsg && <p className="success">{sentMsg}</p>}
      </form>

      <div className="panel">
        <h2>Sent log</h2>
        {logs.length === 0 ? (
          <p className="muted">No emails yet.</p>
        ) : (
          <ul className="email-log">
            {logs.map((m) => (
              <li key={m.id}>
                <strong>{m.subject}</strong>
                <span className="muted">
                  → {m.toEmail} · {new Date(m.sentAt).toLocaleString()}
                </span>
                <pre>{m.body}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
