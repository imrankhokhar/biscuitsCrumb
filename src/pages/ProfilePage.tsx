import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { PageHeader } from '../components/PageHeader'

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function ProfilePage() {
  const { currentUser, branding, updateProfile } = useApp()
  const initial = useMemo(
    () => splitName(currentUser?.name ?? ''),
    [currentUser?.name],
  )
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setFirstName(initial.firstName)
    setLastName(initial.lastName)
  }, [initial.firstName, initial.lastName])

  useEffect(() => {
    if (!avatarFile) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(avatarFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [avatarFile])

  if (!currentUser) return null

  const displaySrc = preview || currentUser.avatarUrl || ''
  const initialLetter = (firstName || currentUser.name).slice(0, 1).toUpperCase() || 'U'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const form = new FormData()
      form.set('firstName', firstName.trim())
      form.set('lastName', lastName.trim())
      if (avatarFile) form.set('avatar', avatarFile)
      await updateProfile(form)
      setAvatarFile(null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module-surface module-profile">
      <PageHeader
        title="Profile"
        description="Update your name and profile photo."
        crumbs={[{ label: 'Profile' }]}
      />

      <form className="panel profile-card stack" onSubmit={(e) => void onSubmit(e)}>
        <div className="profile-hero">
          <label className="profile-avatar-edit">
            {displaySrc ? (
              <img src={displaySrc} alt="" className="user-avatar-round lg profile-avatar-img" />
            ) : (
              <span className="user-avatar-round lg" aria-hidden>
                {initialLetter}
              </span>
            )}
            <span className="profile-avatar-hint">Change photo</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div>
            <h2>
              {[firstName, lastName].filter(Boolean).join(' ') || currentUser.name}
            </h2>
            <p className="muted">{currentUser.email}</p>
            <span className="role-tag">{currentUser.role}</span>
          </div>
        </div>

        <div className="profile-name-grid">
          <label>
            First name
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              minLength={1}
              maxLength={40}
              autoComplete="given-name"
              placeholder="First name"
            />
          </label>
          <label>
            Last name
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={40}
              autoComplete="family-name"
              placeholder="Last name"
            />
          </label>
        </div>

        <dl className="profile-dl">
          <div>
            <dt>Workspace</dt>
            <dd>
              {branding.appName}
              {branding.tagline ? ` — ${branding.tagline}` : ''}
            </dd>
          </div>
        </dl>

        {error && <p className="error">{error}</p>}
        {saved && !error && <p className="muted">Profile saved.</p>}

        <div className="row-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          <Link to="/settings/password" className="btn secondary">
            Change password
          </Link>
          <Link to="/settings/theme" className="btn ghost">
            Theme settings
          </Link>
        </div>
      </form>
    </section>
  )
}
