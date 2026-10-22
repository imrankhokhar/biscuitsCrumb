import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export function LoginPage() {
  const { currentUser, login, branding } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (currentUser) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await login(email, password))
    setBusy(false)
  }

  return (
    <div className="auth-page auth-page-centered">
      <div className="auth-atmosphere" aria-hidden>
        <span className="auth-orb auth-orb-a" />
        <span className="auth-orb auth-orb-b" />
        <span className="auth-orb auth-orb-c" />
        <span className="auth-grain" />
      </div>

      <div className="auth-center">
        <header className="auth-hero">
          <div className="auth-logo-wrap auth-logo-hero">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.appName} className="auth-logo" />
            ) : (
              <div className="auth-logo-fallback" aria-hidden>
                {branding.appName.slice(0, 1)}
              </div>
            )}
          </div>
          <h1 className="auth-brand-name">{branding.appName}</h1>
          <p className="auth-brand-tag">{branding.tagline || 'Management System'}</p>
        </header>

        <div className="auth-form-card auth-form-card-solo">
          <header className="auth-card-head">
            <h2>Sign in</h2>
            <p className="auth-form-lead">
              Welcome back. Use your email and password to continue.
            </p>
          </header>

          <form onSubmit={onSubmit} className="stack auth-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn primary auth-submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch muted">
            New here? <Link to="/signup">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
