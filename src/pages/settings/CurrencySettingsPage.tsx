import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { getCurrency } from '../../lib/currency'
import { SettingsBack } from '../../components/SettingsBack'

export function CurrencySettingsPage() {
  const { currency, currencies, setCurrency } = useApp()
  const navigate = useNavigate()
  const current = getCurrency(currency, currencies)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onChange(code: string) {
    setBusy(true)
    setError(null)
    try {
      await setCurrency(code)
      navigate('/settings')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="Currency" />
      <div className="page-header">
        <h1>Currency</h1>
        <p className="page-desc">
          Active: <strong>{current.name}</strong> ({current.code}) · {current.symbol}
        </p>
      </div>
      <div className="panel stack">
        <label>
          Select currency
          <select
            value={currency}
            disabled={busy || currencies.length === 0}
            onChange={(e) => void onChange(e.target.value)}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.symbol})
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  )
}
