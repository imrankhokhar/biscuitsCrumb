import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { SettingsBack } from '../../components/SettingsBack'

export function BrandingSettingsPage() {
  const { branding, refreshBranding } = useApp()
  const navigate = useNavigate()
  const [appName, setAppName] = useState(branding.appName)
  const [tagline, setTagline] = useState(branding.tagline)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.settings().then((r) => {
      setAppName(r.settings.appName)
      setTagline(r.settings.tagline)
    })
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('appName', appName)
      form.set('tagline', tagline)
      if (logoFile) form.set('logo', logoFile)
      await api.setBranding(form)
      await refreshBranding()
      navigate('/settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="App branding" />
      <div className="page-header">
        <h1>App branding</h1>
        <p className="page-desc">Logo appears in the sidebar and browser tab.</p>
      </div>
      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          App name
          <input value={appName} onChange={(e) => setAppName(e.target.value)} required />
        </label>
        <label>
          Tagline
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} />
        </label>
        <label>
          Logo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" className="preview-img large" />}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save branding'}
        </button>
      </form>
    </section>
  )
}
