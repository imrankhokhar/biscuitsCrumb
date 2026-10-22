import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { formatMoney } from '../lib/currency'
import { PageHeader } from '../components/PageHeader'
import { useConfirm } from '../components/ConfirmModal'
import type { PayableRow, PaymentStatus, PendingPayment } from '../types'

type ReviewMode = 'accept' | 'reject' | null

function rowPending(row: PayableRow): PendingPayment[] {
  return row.pendingPayments ?? (row.pendingPayment ? [row.pendingPayment] : [])
}

/** One table row per pending payment request; users without pending keep a single balance row. */
function flattenPayableRows(payables: PayableRow[]): PayableRow[] {
  const flat: PayableRow[] = []
  for (const user of payables) {
    const pending = rowPending(user)
    if (pending.length > 0) {
      for (const req of pending) {
        flat.push({
          ...user,
          rowKey: req.id,
          requestAmount: req.amount,
          pendingPayment: req,
          pendingPayments: [req],
          paymentMethod: req.paymentMethod,
          receiptUrl: req.receiptUrl ?? user.receiptUrl,
          paymentStatus: 'pending',
        })
      }
    } else {
      flat.push({ ...user, rowKey: user.userId })
    }
  }
  return flat.sort((a, b) => {
    const ap = a.pendingPayment ? 1 : 0
    const bp = b.pendingPayment ? 1 : 0
    if (bp !== ap) return bp - ap
    if (a.name !== b.name) return a.name.localeCompare(b.name)
    return (b.requestAmount ?? b.amount) - (a.requestAmount ?? a.amount)
  })
}

export function PayablesPage() {
  const { currency, currencies, can } = useApp()
  const confirm = useConfirm()
  const [rows, setRows] = useState<PayableRow[]>([])
  const [userCards, setUserCards] = useState<PayableRow[]>([])
  const [selected, setSelected] = useState<PayableRow | null>(null)
  const [receiptView, setReceiptView] = useState<string | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewMode, setReviewMode] = useState<ReviewMode>(null)
  const [reviewRow, setReviewRow] = useState<PayableRow | null>(null)
  const [reviewPayment, setReviewPayment] = useState<PendingPayment | null>(null)
  const [reviewStatus, setReviewStatus] = useState<PaymentStatus>('paid')
  const [rejectReason, setRejectReason] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const { payables } = await api.payables()
      setUserCards(
        [...payables].sort((a, b) => {
          const ap = rowPending(a).length
          const bp = rowPending(b).length
          if (bp !== ap) return bp - ap
          return b.amount - a.amount
        }),
      )
      setRows(flattenPayableRows(payables))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openUser(row: PayableRow) {
    setSelected(row)
    setPaidAmount('')
    setNote('')
    setError(null)
  }

  function close() {
    setSelected(null)
  }

  function openReview(row: PayableRow, payment: PendingPayment, mode: 'accept' | 'reject') {
    setReviewRow(row)
    setReviewPayment(payment)
    setReviewMode(mode)
    setReviewStatus(mode === 'accept' ? 'paid' : 'rejected')
    setRejectReason('')
    setReviewError(null)
  }

  function closeReview() {
    if (reviewBusy) return
    setReviewMode(null)
    setReviewRow(null)
    setReviewPayment(null)
    setReviewError(null)
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault()
    if (!reviewRow || !reviewPayment || !reviewMode) return
    setReviewBusy(true)
    setReviewError(null)
    try {
      if (reviewMode === 'accept') {
        if (reviewStatus !== 'paid') {
          setReviewError('Select paid to accept this payment.')
          return
        }
        await api.acceptPayment(reviewPayment.id, 'paid')
      } else {
        if (reviewStatus !== 'rejected') {
          setReviewError('Select rejected to reject this payment.')
          return
        }
        const reason = rejectReason.trim()
        if (!reason) {
          setReviewError('Please add a rejection reason.')
          return
        }
        await api.rejectPayment(reviewPayment.id, reason, 'rejected')
      }
      closeReview()
      if (selected?.userId === reviewRow.userId) setSelected(null)
      await load()
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not update payment')
    } finally {
      setReviewBusy(false)
    }
  }

  async function onPartial(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    const amount = Number(paidAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    try {
      const result = await api.pay(selected.userId, amount, note)
      setSelected({
        ...selected,
        amount: result.amount,
        totalCharged: result.totalCharged,
        totalPaid: result.totalPaid,
      })
      setPaidAmount('')
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    }
  }

  async function onFull() {
    if (!selected) return
    try {
      const result = await api.markPaid(selected.userId)
      setSelected({
        ...selected,
        amount: result.amount,
        totalCharged: result.totalCharged,
        totalPaid: result.totalPaid,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark paid')
    }
  }

  async function onSoftDelete(row: PayableRow) {
    const ok = await confirm({
      title: 'Delete payable entry',
      message: `Soft-delete payable for "${row.name}"? It will be hidden from the list and excluded from accountability. Your name will be stored as who deleted it.`,
      confirmLabel: 'Delete entry',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.softDeletePayable(row.userId)
      if (selected?.userId === row.userId) setSelected(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const due = selected?.amount ?? 0
  const totalPayable = selected?.totalCharged ?? due
  const totalPaid = selected?.totalPaid ?? 0

  return (
    <section className="module-panel">
      <PageHeader
        title="Payables"
        description="Cards overview plus a detailed list with remaining balances."
        crumbs={[{ label: 'Payables' }]}
      />

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="user-grid">
            {userCards.map((row) => {
              const pendingCount = rowPending(row).length
              return (
                <button
                  key={row.userId}
                  type="button"
                  className="user-card"
                  onClick={() => openUser(row)}
                >
                  <span className="avatar">{row.name.slice(0, 1)}</span>
                  <div>
                    <strong>{row.name}</strong>
                    <span className="muted">{row.email}</span>
                    {pendingCount > 0 && (
                      <span className="pay-status pending">
                        {pendingCount} pending
                      </span>
                    )}
                  </div>
                  <span className={`due ${row.amount > 0 ? 'owed' : 'clear'}`}>
                    {formatMoney(row.amount, currency, currencies)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="panel">
            <h2>Payable list</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Payable (total charged)</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Payment app</th>
                    <th>Receipt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const charged = row.totalCharged ?? row.amount
                    const paid = row.totalPaid ?? 0
                    const remaining = row.amount
                    const showBoth = paid > 0 || remaining !== charged
                    const req = row.pendingPayment
                    const status = req
                      ? 'pending'
                      : row.paymentStatus || (remaining > 0 ? 'due' : 'paid')
                    return (
                      <tr
                        key={row.rowKey ?? row.userId}
                        className={req ? 'row-pending' : undefined}
                      >
                        <td>
                          <strong>{row.name}</strong>
                          <div className="muted">{row.email}</div>
                        </td>
                        <td>{formatMoney(charged, currency, currencies)}</td>
                        <td>{formatMoney(paid, currency, currencies)}</td>
                        <td>
                          <span className={remaining > 0 ? 'owed' : 'clear'}>
                            {formatMoney(remaining, currency, currencies)}
                          </span>
                          {showBoth && remaining > 0 && (
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              Remaining of {formatMoney(charged, currency, currencies)}
                            </div>
                          )}
                        </td>
                        <td>
                          {req ? (
                            <strong>
                              {formatMoney(row.requestAmount ?? req.amount, currency, currencies)}
                            </strong>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={`pay-status ${status}`}>{status}</span>
                        </td>
                        <td>{row.paymentMethod || '—'}</td>
                        <td>
                          {row.receiptUrl ? (
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => setReceiptView(row.receiptUrl!)}
                            >
                              View
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="row-actions">
                          {can('payables.pay') && req && (
                            <>
                              <button
                                type="button"
                                className="btn primary"
                                onClick={() => openReview(row, req, 'accept')}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                onClick={() => openReview(row, req, 'reject')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() =>
                              openUser(userCards.find((u) => u.userId === row.userId) ?? row)
                            }
                          >
                            Payable
                          </button>
                          {can('payables.pay') && !req && (
                            <button
                              type="button"
                              className="btn danger"
                              onClick={() => void onSoftDelete(row)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={close} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-labelledby="pay-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="pay-title">{selected.name}</h2>
                <p className="muted">{selected.email}</p>
              </div>
              <button type="button" className="btn ghost sm" onClick={close}>
                Close
              </button>
            </div>

            <p className="due-line">
              Payable (total):{' '}
              <strong>{formatMoney(totalPayable, currency, currencies)}</strong>
            </p>
            <p className="due-line">
              Paid so far: <strong>{formatMoney(totalPaid, currency, currencies)}</strong>
            </p>
            <p className="due-line">
              Remaining:{' '}
              <strong>{formatMoney(due, currency, currencies)}</strong>
            </p>
            {rowPending(selected).map((p) => (
              <p key={p.id} className="due-line">
                Pending request:{' '}
                <strong>{formatMoney(p.amount, currency, currencies)}</strong>{' '}
                <span className="pay-status pending">pending</span>
                {p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
              </p>
            ))}
            {selected.paymentMethod && rowPending(selected).length === 0 && (
              <p className="due-line">
                Last payment app: <strong>{selected.paymentMethod}</strong>
              </p>
            )}
            {selected.receiptUrl && (
              <p className="due-line">
                Receipt:{' '}
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setReceiptView(selected.receiptUrl!)}
                >
                  View
                </button>
              </p>
            )}
            {error && <p className="error">{error}</p>}

            {can('payables.pay') &&
              rowPending(selected).map((p) => (
                <div key={p.id} className="modal-footer" style={{ marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => openReview(selected, p, 'accept')}
                  >
                    Accept {formatMoney(p.amount, currency, currencies)}
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => openReview(selected, p, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              ))}

            {can('payables.pay') && (
              <form className="stack payables-modal-form" onSubmit={(e) => void onPartial(e)}>
                <div className="modal-footer modal-footer-stack">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={due <= 0 || rowPending(selected).length > 0}
                    onClick={() => void onFull()}
                  >
                    Mark fully paid
                  </button>
                </div>
                <label>
                  Paid amount ({currency})
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder="e.g. 5.00"
                    required
                    disabled={rowPending(selected).length > 0}
                  />
                </label>
                <label>
                  Note (optional)
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Cash / transfer / etc."
                    disabled={rowPending(selected).length > 0}
                  />
                </label>
                {paidAmount && Number(paidAmount) > 0 && (
                  <p className="muted">
                    Remaining after payment:{' '}
                    <strong>
                      {formatMoney(
                        Math.max(0, due - Number(paidAmount)),
                        currency,
                        currencies,
                      )}
                    </strong>
                  </p>
                )}
                <div className="modal-footer">
                  <button
                    type="submit"
                    className="btn secondary"
                    disabled={due <= 0 || rowPending(selected).length > 0}
                  >
                    Apply paid amount
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {reviewMode && reviewRow && reviewPayment && (
        <div className="modal-backdrop" onClick={closeReview} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-labelledby="review-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="review-title">
                  {reviewMode === 'accept' ? 'Accept payment' : 'Reject payment'}
                </h2>
                <p className="muted">
                  {reviewRow.name} ·{' '}
                  {formatMoney(reviewPayment.amount, currency, currencies)} via{' '}
                  {reviewPayment.paymentMethod}
                </p>
              </div>
              <button type="button" className="btn ghost sm" onClick={closeReview} disabled={reviewBusy}>
                Close
              </button>
            </div>

            <form className="stack" onSubmit={(e) => void submitReview(e)}>
              <label>
                Status
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as PaymentStatus)}
                  disabled={reviewBusy}
                >
                  {reviewMode === 'accept' ? (
                    <>
                      <option value="pending">pending</option>
                      <option value="paid">paid</option>
                    </>
                  ) : (
                    <>
                      <option value="pending">pending</option>
                      <option value="rejected">rejected</option>
                    </>
                  )}
                </select>
              </label>

              {reviewMode === 'reject' && (
                <label>
                  Reason
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why is this payment being rejected?"
                    rows={3}
                    required
                    disabled={reviewBusy}
                  />
                </label>
              )}

              {reviewMode === 'accept' && (
                <p className="muted">
                  Changing status to paid will apply{' '}
                  {formatMoney(reviewPayment.amount, currency, currencies)} to the
                  balance. Remaining due will update on both sides.
                </p>
              )}

              {reviewError && <p className="error">{reviewError}</p>}

              <div className="modal-footer">
                <button type="button" className="btn ghost" onClick={closeReview} disabled={reviewBusy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${reviewMode === 'accept' ? 'primary' : 'danger'}`}
                  disabled={reviewBusy}
                >
                  {reviewBusy
                    ? 'Saving…'
                    : reviewMode === 'accept'
                      ? 'Continue'
                      : 'Reject request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiptView && (
        <ReceiptLightbox src={receiptView} onClose={() => setReceiptView(null)} />
      )}
    </section>
  )
}

function ReceiptLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    setError(null)
    setBlobUrl(null)

    if (!src.startsWith('/api/')) {
      setBlobUrl(src)
      return
    }

    void fetch(src, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load receipt')
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load encrypted receipt')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  return (
    <div className="modal-backdrop receipt-lightbox" role="presentation" onClick={onClose}>
      <div
        className="modal receipt-modal"
        role="dialog"
        aria-label="Payment receipt"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Payment receipt</h2>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {!error && !blobUrl && <p className="muted">Loading receipt…</p>}
        {blobUrl && <img src={blobUrl} alt="Payment receipt" className="receipt-full" />}
      </div>
    </div>
  )
}
