import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { SettingsBack } from '../../components/SettingsBack'

export function PasswordSettingsPage() {
  const navigate = useNavigate()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (pw.next !== pw.confirm) {
      setError('New passwords do not match')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(pw.current, pw.next)
      navigate('/settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="Change password" />
      <div className="page-header">
        <h1>Change password</h1>
        <p className="page-desc">Update your account password.</p>
      </div>
      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Current password
          <input
            type="password"
            value={pw.current}
            onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            required
            minLength={6}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
            required
            minLength={6}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </section>
  )
}
