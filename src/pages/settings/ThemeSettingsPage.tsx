import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { SettingsBack } from '../../components/SettingsBack'
import type { ThemePreference } from '../../types'

export function ThemeSettingsPage() {
  const { currentUser, setTheme } = useApp()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onTheme(theme: ThemePreference) {
    setBusy(true)
    setError(null)
    try {
      await setTheme(theme)
      navigate('/settings')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save theme')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="Theme" />
      <div className="page-header">
        <h1>Theme</h1>
        <p className="page-desc">Saved for {currentUser?.email}. System follows OS preference.</p>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="panel stack">
        <div className="row-actions">
          {(['light', 'dark', 'system'] as ThemePreference[]).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`btn ${currentUser?.themePreference === theme ? 'primary' : 'ghost'}`}
              disabled={busy}
              onClick={() => void onTheme(theme)}
            >
              {theme[0].toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
