import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { api } from '../lib/api'
import { formatMoney } from '../lib/currency'
import { PayPayableModal } from '../components/PayPayableModal'
import { useConfirm } from '../components/ConfirmModal'

function chargesToPicked(
  charges: { id: string; itemId: string }[],
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const c of charges) {
    next[c.itemId] = [...(next[c.itemId] ?? []), c.id]
  }
  return next
}

/** Oldest charges that cover pending totals are locked (cannot unselect). */
function lockedChargeIdSet(
  charges: { id: string; amount: number }[],
  pendingTotal: number,
): Set<string> {
  const locked = new Set<string>()
  let remaining = pendingTotal
  for (const c of charges) {
    if (remaining <= 0) break
    locked.add(c.id)
    remaining = +(remaining - c.amount).toFixed(2)
  }
  return locked
}

export function ItemsGridPage() {
  const {
    items,
    addItemCharge,
    undoItemCharge,
    myPayable,
    pendingTotal,
    payableDueNow,
    currency,
    currencies,
    can,
    selfPay,
    currentUser,
    branding,
  } = useApp()
  const hasPendingPayment = pendingTotal > 0
  const confirm = useConfirm()
  const [toast, setToast] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [lockedChargeIds, setLockedChargeIds] = useState<Set<string>>(() => new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const canCharge = can('items.charge')
  const firstName = currentUser?.name?.trim().split(/\s+/)[0] || 'there'
  const selectedTotal = Object.values(picked).reduce((n, ids) => n + ids.length, 0)

  const restorePicked = useCallback(async () => {
    if (!canCharge) {
      setPicked({})
      setLockedChargeIds(new Set())
      return
    }
    try {
      const { charges } = await api.openCharges()
      setPicked(chargesToPicked(charges))
      setLockedChargeIds(lockedChargeIdSet(charges, pendingTotal))
    } catch {
      /* keep current local selection */
    }
  }, [canCharge, pendingTotal])

  useEffect(() => {
    void restorePicked()
    // intentionally omit myPayable — poll updates must not re-fetch full open-charge history
  }, [restorePicked, currentUser?.id, pendingTotal])

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  function showToast(message: string, ms = 2200) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), ms)
  }

  async function addOne(itemId: string, title: string, price: number, quantity: number) {
    if (!canCharge) {
      showToast('You do not have permission to charge items.')
      return
    }
    if (busyId) return
    if (quantity <= 0) {
      showToast(`${title} is out of stock`)
      return
    }

    setBusyId(itemId)
    try {
      await addItemCharge(itemId)
      await restorePicked()
      showToast(`Added ${title} (${formatMoney(price, currency, currencies)})`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add item')
    } finally {
      setBusyId(null)
    }
  }

  async function removeOne(itemId: string, title: string) {
    if (!canCharge || busyId) return
    const stack = picked[itemId] ?? []
    if (stack.length === 0) return

    const chargeId = stack[stack.length - 1]
    if (lockedChargeIds.has(chargeId)) {
      showToast(
        'This item is covered by a pending payment request and cannot be unselected until admin accepts or rejects it.',
        3600,
      )
      return
    }

    setBusyId(itemId)
    try {
      await undoItemCharge(chargeId)
      await restorePicked()
      showToast(`Removed ${title} from your payable`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not unselect item')
    } finally {
      setBusyId(null)
    }
  }

  async function handlePay(amount: number, method: string, receipt: File) {
    await selfPay(amount, method, receipt)
    await restorePicked()
    showToast('Payment submitted — status pending until admin reviews.', 3200)
  }

  async function openPayable() {
    if (payableDueNow <= 0) {
      if (hasPendingPayment) {
        showToast(
          `Nothing new to pay. ${formatMoney(pendingTotal, currency, currencies)} is already pending admin review.`,
          3600,
        )
      } else {
        showToast('Select items first, or there is nothing to pay.')
      }
      return
    }

    const selectedEntries = items
      .map((item) => ({
        title: item.title,
        count: picked[item.id]?.length ?? 0,
      }))
      .filter((row) => row.count > 0)
    const selectedCount = selectedEntries.reduce((n, row) => n + row.count, 0)

    if (selectedCount > 0 && !hasPendingPayment) {
      const list = selectedEntries
        .map((row) => (row.count > 1 ? `${row.title} × ${row.count}` : row.title))
        .join(', ')
      const ok = await confirm({
        title: 'Continue with selected items?',
        message: `Do you want to continue with all selected items (${selectedCount})? ${list}.`,
        confirmLabel: 'Continue',
        cancelLabel: 'Not now',
        tone: 'default',
      })
      if (!ok) return
    }

    setPayOpen(true)
  }

  return (
    <section className="items-catalog">
      <header className="items-welcome">
        <div className="items-welcome-atmosphere" aria-hidden>
          <span className="items-orb items-orb-a" />
          <span className="items-orb items-orb-b" />
          <span className="items-welcome-grain" />
        </div>

        <div className="items-welcome-inner">
          <div className="items-welcome-copy">
            <p className="items-welcome-greet">Welcome back, {firstName}</p>
            <h1 className="items-brand-hero">{branding.appName}</h1>
            <p className="items-welcome-lead">
              {branding.tagline
                ? `${branding.tagline}. Pick what you like — your payable updates as you go.`
                : 'Pick what you like — your payable updates as you go.'}
            </p>
          </div>

          {canCharge && (
            <button
              type="button"
              className="items-payable"
              onClick={() => void openPayable()}
            >
              <span className="items-payable-label">Your payable</span>
              <strong className="items-payable-amount">
                {formatMoney(myPayable, currency, currencies)}
              </strong>
              <span className="items-payable-meta">
                {hasPendingPayment && payableDueNow > 0
                  ? `${formatMoney(pendingTotal, currency, currencies)} pending · ${formatMoney(payableDueNow, currency, currencies)} due now`
                  : hasPendingPayment
                    ? `Pending · ${formatMoney(pendingTotal, currency, currencies)}`
                    : selectedTotal > 0
                      ? `${selectedTotal} selected · Tap to pay`
                      : 'Tap to pay'}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="items-shelf">
        <div className="items-shelf-atmosphere" aria-hidden>
          <span className="items-orb items-orb-c" />
          <span className="items-orb items-orb-d" />
          <span className="items-welcome-grain" />
        </div>

        <div className="items-shelf-inner">
          <div className="items-shelf-head">
            <div className="items-shelf-titles">
              <h2>Items</h2>
              <span className="items-info" tabIndex={0} aria-label="How to use items">
                <span className="items-info-ico" aria-hidden>
                  i
                </span>
                <span className="items-info-tip" role="tooltip">
                  Tap an item to add it. Use + / − to change quantity.
                </span>
              </span>
            </div>
            <p className="items-shelf-sub">Fresh picks ready when you are</p>
          </div>

          {items.length === 0 ? (
            <p className="empty items-empty">No items yet. Admin can add them in Manage Items.</p>
          ) : (
            <div className="item-grid">
              {items.map((item, index) => {
                const out = item.quantity <= 0
                const selectedCount = picked[item.id]?.length ?? 0
                const selected = selectedCount > 0
                const busy = busyId === item.id
                return (
                  <div
                    key={item.id}
                    className={`item-card ${out && !selected ? 'is-out' : ''} ${item.quantity <= 4 && !out ? 'is-low' : ''} ${selected ? 'is-selected' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
                  >
                    <span className="item-card-shade" aria-hidden />
                    <button
                      type="button"
                      className="item-card-main"
                      disabled={(out && canCharge) || busy}
                      onClick={() => void addOne(item.id, item.title, item.price, item.quantity)}
                    >
                      <div className="item-card-media">
                        <img src={item.imageUrl} alt={item.title} loading="lazy" />
                        <span className={`item-qty-badge ${item.quantity <= 4 ? 'warn' : ''}`}>
                          Qty {item.quantity}
                        </span>
                      </div>
                      <div className="item-card-body">
                        <span className="item-title">{item.title}</span>
                        <span className="item-price">
                          {formatMoney(item.price, currency, currencies)}
                        </span>
                        {can('items.manage') && item.buyingPrice != null && (
                          <span className="muted item-buy-hint">
                            Buy {formatMoney(item.buyingPrice, currency, currencies)}
                          </span>
                        )}
                      </div>
                    </button>

                    {canCharge && (
                      <div className="item-stepper">
                        <button
                          type="button"
                          className="item-step"
                          aria-label={`Remove one ${item.title}`}
                          disabled={!selected || busy}
                          onClick={() => void removeOne(item.id, item.title)}
                          title={
                            (picked[item.id] ?? []).some((id) => lockedChargeIds.has(id))
                              ? 'Some units are locked by a pending payment'
                              : undefined
                          }
                        >
                          −
                        </button>
                        <span className="item-step-count" aria-live="polite">
                          {selectedCount}
                        </span>
                        <button
                          type="button"
                          className="item-step"
                          aria-label={`Add one ${item.title}`}
                          disabled={out || busy}
                          onClick={() => void addOne(item.id, item.title, item.price, item.quantity)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <PayPayableModal
        open={payOpen}
        balance={payableDueNow}
        currency={currency}
        currencies={currencies}
        onClose={() => setPayOpen(false)}
        onPay={handlePay}
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  )
}
