import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { SettingsBack } from '../../components/SettingsBack'
import type { SmtpSettings } from '../../types'

export function SmtpSettingsPage() {
  const navigate = useNavigate()
  const [smtp, setSmtp] = useState<SmtpSettings>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    hasPass: false,
    from: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.settings().then((r) => setSmtp(r.settings.smtp))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.setSmtp({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        pass: smtp.pass,
        from: smtp.from,
      })
      navigate('/settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SMTP save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="SMTP" />
      <div className="page-header">
        <h1>SMTP</h1>
        <p className="page-desc">Outgoing email server used by the Email module.</p>
      </div>
      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Host
          <input
            value={smtp.host}
            onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))}
            placeholder="smtp.gmail.com"
          />
        </label>
        <label>
          Port
          <input
            type="number"
            value={smtp.port}
            onChange={(e) => setSmtp((s) => ({ ...s, port: Number(e.target.value) }))}
          />
        </label>
        <label className="perm-row">
          <input
            type="checkbox"
            checked={smtp.secure}
            onChange={(e) => setSmtp((s) => ({ ...s, secure: e.target.checked }))}
          />
          <span>Use TLS/SSL (secure)</span>
        </label>
        <label>
          Username
          <input
            value={smtp.user}
            onChange={(e) => setSmtp((s) => ({ ...s, user: e.target.value }))}
          />
        </label>
        <label>
          Password {smtp.hasPass ? '(leave ******** to keep current)' : ''}
          <input
            type="password"
            value={smtp.pass}
            onChange={(e) => setSmtp((s) => ({ ...s, pass: e.target.value }))}
            placeholder={smtp.hasPass ? '********' : ''}
          />
        </label>
        <label>
          From address
          <input
            value={smtp.from}
            onChange={(e) => setSmtp((s) => ({ ...s, from: e.target.value }))}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save SMTP'}
        </button>
      </form>
    </section>
  )
}
