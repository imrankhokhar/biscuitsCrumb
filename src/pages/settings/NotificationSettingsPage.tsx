import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useApp } from '../../context/AppContext'
import { SettingsBack } from '../../components/SettingsBack'

export function NotificationSettingsPage() {
  const { playNotifySound } = useApp()
  const navigate = useNavigate()
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [itemSoundFile, setItemSoundFile] = useState<File | null>(null)
  const [paymentSoundFile, setPaymentSoundFile] = useState<File | null>(null)
  const [unselectSoundFile, setUnselectSoundFile] = useState<File | null>(null)
  const [itemSoundUrl, setItemSoundUrl] = useState('')
  const [paymentSoundUrl, setPaymentSoundUrl] = useState('')
  const [unselectSoundUrl, setUnselectSoundUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.settings().then((r) => {
      setSoundEnabled(r.settings.notificationSoundEnabled)
      setItemSoundUrl(r.settings.notificationSoundUrl)
      setPaymentSoundUrl(r.settings.paymentSoundUrl)
      setUnselectSoundUrl(r.settings.unselectSoundUrl ?? '')
    })
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('enabled', String(soundEnabled))
      if (itemSoundFile) form.set('sound', itemSoundFile)
      if (paymentSoundFile) form.set('paymentSound', paymentSoundFile)
      if (unselectSoundFile) form.set('unselectSound', unselectSoundFile)
      await api.setNotifications(form)
      navigate('/settings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SettingsBack current="Notification sounds" />
      <div className="page-header">
        <h1>Notification sounds</h1>
        <p className="page-desc">
          Separate tones for item charge, unselect, and payment received alerts.
        </p>
      </div>
      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label className="perm-row">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
          />
          <span>Enable notification sounds</span>
        </label>

        <label>
          Item charge sound
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setItemSoundFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {itemSoundUrl && <p className="muted">Current: {itemSoundUrl}</p>}
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={() => playNotifySound('item')}>
            Test item sound
          </button>
        </div>

        <label>
          Item unselect sound
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setUnselectSoundFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {unselectSoundUrl && <p className="muted">Current: {unselectSoundUrl}</p>}
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={() => playNotifySound('unselect')}>
            Test unselect sound
          </button>
        </div>

        <label>
          Payment received sound
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setPaymentSoundFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {paymentSoundUrl && <p className="muted">Current: {paymentSoundUrl}</p>}
        <div className="row-actions">
          <button type="button" className="btn ghost" onClick={() => playNotifySound('payment')}>
            Test payment sound
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="row-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
