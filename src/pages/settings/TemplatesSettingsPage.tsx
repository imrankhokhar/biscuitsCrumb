import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { SettingsBack } from '../../components/SettingsBack'
import type { EmailTemplate } from '../../types'

export function TemplatesSettingsPage() {
  const { can } = useApp()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.templates().then((r) => setTemplates(r.templates))
  }, [])

  async function saveTemplate(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const { template } = await api.updateTemplate(editing.id, {
        name: editing.name,
        subject: editing.subject,
        body: editing.body,
      })
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)))
      setEditing(null)
      navigate('/settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="Email templates" />
      <div className="page-header">
        <h1>Email templates</h1>
        <p className="page-desc">
          Placeholders: {'{{name}}'}, {'{{amount}}'}, {'{{appName}}'}, {'{{tagline}}'}
        </p>
      </div>

      {!editing && (
        <div className="panel">
          <ul className="email-log">
            {templates.map((t) => (
              <li key={t.id}>
                <strong>
                  {t.name} <span className="muted">({t.code})</span>
                </strong>
                <span className="muted">{t.subject}</span>
                {can('settings.update') && (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => setEditing({ ...t })}
                  >
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && can('settings.update') && (
        <form className="panel stack" onSubmit={(e) => void saveTemplate(e)}>
          <h2>Edit: {editing.code}</h2>
          <label>
            Name
            <input
              value={editing.name}
              onChange={(e) => setEditing((t) => (t ? { ...t, name: e.target.value } : t))}
              required
            />
          </label>
          <label>
            Subject
            <input
              value={editing.subject}
              onChange={(e) => setEditing((t) => (t ? { ...t, subject: e.target.value } : t))}
              required
            />
          </label>
          <label>
            Body
            <textarea
              rows={8}
              value={editing.body}
              onChange={(e) => setEditing((t) => (t ? { ...t, body: e.target.value } : t))}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save template'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
