import { useEffect, useState } from 'react'
import { formatMoney } from '../lib/currency'
import type { CurrencyOption } from '../types'

const BANKING_APPS = [
  { id: 'jazzcash', label: 'JazzCash' },
  { id: 'easypaisa', label: 'EasyPaisa' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'card', label: 'Debit / Credit card' },
] as const

type Step = 'amount' | 'apps'

type Props = {
  open: boolean
  balance: number
  currency: string
  currencies: CurrencyOption[]
  onClose: () => void
  onPay: (amount: number, method: string, receipt: File) => Promise<void>
}

export function PayPayableModal({
  open,
  balance,
  currency,
  currencies,
  onClose,
  onPay,
}: Props) {
  const [step, setStep] = useState<Step>('amount')
  const [mode, setMode] = useState<'full' | 'custom'>('full')
  const [customAmount, setCustomAmount] = useState('')
  const [method, setMethod] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('amount')
    setMode('full')
    setCustomAmount(balance > 0 ? String(balance) : '')
    setMethod('')
    setReceipt(null)
    setReceiptPreview(null)
    setError(null)
    setBusy(false)
  }, [open, balance])

  useEffect(() => {
    if (!receipt) {
      setReceiptPreview(null)
      return
    }
    const url = URL.createObjectURL(receipt)
    setReceiptPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [receipt])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const payAmount =
    mode === 'full' ? balance : Math.max(0, Number.parseFloat(customAmount) || 0)
  const canConfirm = Boolean(method && receipt) && !busy

  function goPayNow() {
    setError(null)
    if (balance <= 0) {
      setError('Nothing to pay right now.')
      return
    }
    if (!(payAmount > 0)) {
      setError('Enter a valid amount.')
      return
    }
    if (payAmount > balance + 0.001) {
      setError('Amount cannot exceed your payable balance.')
      return
    }
    setStep('apps')
  }

  function selectMethod(id: string) {
    setMethod(id)
    setReceipt(null)
    setError(null)
  }

  async function confirmPay() {
    const app = BANKING_APPS.find((a) => a.id === method)
    if (!app || !receipt) return
    setBusy(true)
    setError(null)
    try {
      await onPay(payAmount, app.label, receipt)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="modal pay-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-modal-title"
      >
        <div className="modal-head">
          <h2 id="pay-modal-title">{step === 'amount' ? 'Pay your balance' : 'Choose payment app'}</h2>
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {step === 'amount' ? (
          <>
            <p className="due-line">
              Amount to pay:{' '}
              <strong>{formatMoney(balance, currency, currencies)}</strong>
            </p>

            <div className="pay-mode-row">
              <button
                type="button"
                className={`btn pay-mode-btn ${mode === 'full' ? 'primary' : 'ghost'}`}
                onClick={() => setMode('full')}
              >
                Pay full amount
              </button>
              <button
                type="button"
                className={`btn pay-mode-btn ${mode === 'custom' ? 'primary' : 'ghost'}`}
                onClick={() => setMode('custom')}
              >
                Custom amount
              </button>
            </div>

            {mode === 'custom' && (
              <label>
                Amount to pay
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  max={balance}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            )}

            {error && <p className="error">{error}</p>}

            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={goPayNow} disabled={balance <= 0}>
                Pay now
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Paying {formatMoney(payAmount, currency, currencies)} via:
            </p>
            <div className="bank-app-grid">
              {BANKING_APPS.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  className={`bank-app-btn ${method === app.id ? 'is-selected' : ''}`}
                  onClick={() => selectMethod(app.id)}
                >
                  {app.label}
                </button>
              ))}
            </div>

            {method && (
              <div className="receipt-upload">
                <label>
                  Upload payment proof (screenshot / image)
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                  />
                </label>
                {receiptPreview && (
                  <img src={receiptPreview} alt="Payment proof preview" className="receipt-preview" />
                )}
              </div>
            )}

            {error && <p className="error">{error}</p>}
            <div className="modal-footer">
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  setError(null)
                  setMethod('')
                  setReceipt(null)
                  setStep('amount')
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!canConfirm}
                onClick={() => void confirmPay()}
              >
                {busy ? 'Processing…' : 'Confirm payment'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
