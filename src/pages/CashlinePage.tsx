import { useMemo, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { formatMoney } from '../lib/currency'
import { PageHeader } from '../components/PageHeader'
import type { CashlineRow, CashlineStatus, CashlineSummary } from '../types'

const STATUS_LABEL: Record<CashlineStatus, string> = {
  clear: 'Clear',
  not_in_sheet: 'Not in sheet',
  not_received: 'Not received',
  not_in_system: 'Not in system',
}

const FILTERS: Array<CashlineStatus | 'all'> = [
  'all',
  'not_received',
  'not_in_sheet',
  'not_in_system',
  'clear',
]

export function CashlinePage() {
  const { currency, currencies } = useApp()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<CashlineRow[] | null>(null)
  const [summary, setSummary] = useState<CashlineSummary | null>(null)
  const [meta, setMeta] = useState<{
    fileName: string
    sheetCredits: number
    appPayments: number
  } | null>(null)
  const [filter, setFilter] = useState<CashlineStatus | 'all'>('all')

  const visible = useMemo(() => {
    if (!rows) return []
    if (filter === 'all') return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a statement file first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('statement', file)
      const result = await api.cashlineCompare(form)
      setRows(result.rows)
      setSummary(result.summary)
      setMeta(result.meta)
      setFilter('all')
    } catch (err) {
      setRows(null)
      setSummary(null)
      setMeta(null)
      setError(err instanceof Error ? err.message : 'Compare failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module-panel module-cashline">
      <PageHeader
        title="Cashline"
        description="Upload a bank/account statement and compare credits to app payments."
        crumbs={[{ label: 'Cashline' }]}
      />

      <form className="panel stack cashline-upload" onSubmit={(e) => void onSubmit(e)}>
        <p className="muted">
          Expected columns: <strong>Date</strong>, <strong>Amount</strong> or{' '}
          <strong>Credit</strong>, and <strong>Description / Reference</strong>. Excel
          (.xlsx) and CSV work best; PDF is best-effort text only.
        </p>
        <label className="cashline-file">
          Statement file
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="row-actions">
          <button type="submit" className="btn primary" disabled={busy || !file}>
            {busy ? 'Comparing…' : 'Compare statement'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      {summary && meta && (
        <>
          <p className="muted cashline-meta">
            {meta.fileName} · {meta.sheetCredits} sheet credits · {meta.appPayments} app
            payments (paid / pending)
          </p>
          <div className="stats-grid cashline-stats">
            <button
              type="button"
              className={`stat-card cashline-stat ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              <span className="muted">All rows</span>
              <strong>
                {summary.clear +
                  summary.not_in_sheet +
                  summary.not_received +
                  summary.not_in_system}
              </strong>
            </button>
            {(
              [
                ['not_received', summary.not_received],
                ['not_in_sheet', summary.not_in_sheet],
                ['not_in_system', summary.not_in_system],
                ['clear', summary.clear],
              ] as const
            ).map(([key, count]) => (
              <button
                key={key}
                type="button"
                className={`stat-card cashline-stat status-${key} ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}
              >
                <span className="muted">{STATUS_LABEL[key]}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>

          <div className="cashline-filters row-actions">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`btn ghost ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="panel table-wrap">
            <table className="data-table cashline-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>User</th>
                  <th>Sheet</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No rows for this filter.
                    </td>
                  </tr>
                )}
                {visible.map((r, i) => (
                  <tr key={`${r.status}-${r.paymentId ?? r.sheetRow}-${i}`}>
                    <td>
                      <span className={`cashline-badge status-${r.status}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td>{formatMoney(r.amount, currency, currencies)}</td>
                    <td>
                      {r.date
                        ? new Date(r.date).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td>
                      {r.userName ? (
                        <>
                          <div>{r.userName}</div>
                          <div className="muted">{r.userEmail}</div>
                          {r.paymentStatus && (
                            <div className="muted">App: {r.paymentStatus}</div>
                          )}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {r.sheetRow != null ? (
                        <>
                          <div>Row {r.sheetRow}</div>
                          <div className="muted">{r.sheetDescription || '—'}</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
