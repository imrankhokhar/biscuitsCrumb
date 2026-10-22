import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { formatMoney } from '../lib/currency'
import {
  exportAccountabilityExcel,
  exportAccountabilityPdf,
} from '../lib/accountabilityExport'
import { PageHeader } from '../components/PageHeader'
import type { AccountabilityItemRow, AccountabilitySummary } from '../types'

export function AccountabilityPage() {
  const { currency, currencies, branding } = useApp()
  const [summary, setSummary] = useState<AccountabilitySummary | null>(null)
  const [items, setItems] = useState<AccountabilityItemRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void api
      .accountability()
      .then((r) => {
        setSummary(r.summary)
        setItems(r.items)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function onExportExcel() {
    if (!summary) return
    void exportAccountabilityExcel({
      summary,
      items,
      currency,
      currencies,
      appName: branding.appName,
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Excel export failed')
    })
  }

  function onExportPdf() {
    if (!summary) return
    exportAccountabilityPdf({
      summary,
      items,
      currency,
      currencies,
      appName: branding.appName,
    })
  }

  return (
    <section className="module-panel">
      <PageHeader
        title="Accountability"
        description="Profit from sales minus buying cost, plus receivables and stock value."
        crumbs={[{ label: 'Accountability' }]}
        actions={
          summary ? (
            <div className="row-actions">
              <button type="button" className="btn ghost" onClick={onExportExcel}>
                Export Excel
              </button>
              <button type="button" className="btn primary" onClick={onExportPdf}>
                Export PDF
              </button>
            </div>
          ) : null
        }
      />

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {summary && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="muted">Sales revenue</span>
            <strong>{formatMoney(summary.totalRevenue, currency, currencies)}</strong>
            <span className="muted">{summary.unitsSold} units sold</span>
          </div>
          <div className="stat-card">
            <span className="muted">Cost of goods</span>
            <strong>{formatMoney(summary.totalCost, currency, currencies)}</strong>
          </div>
          <div className="stat-card accent">
            <span className="muted">Gross profit</span>
            <strong>{formatMoney(summary.grossProfit, currency, currencies)}</strong>
          </div>
          <div className="stat-card">
            <span className="muted">Receivables</span>
            <strong>{formatMoney(summary.receivables, currency, currencies)}</strong>
            <span className="muted">
              Collected {formatMoney(summary.totalCollected, currency, currencies)}
            </span>
          </div>
          <div className="stat-card">
            <span className="muted">Stock at cost</span>
            <strong>{formatMoney(summary.inventoryCostValue, currency, currencies)}</strong>
          </div>
          <div className="stat-card">
            <span className="muted">Stock at selling</span>
            <strong>{formatMoney(summary.inventorySellValue, currency, currencies)}</strong>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="panel">
          <h2>By item</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Stock</th>
                  <th>Buy</th>
                  <th>Sell</th>
                  <th>Sold</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.itemId}>
                    <td>
                      <strong>{row.title}</strong>
                    </td>
                    <td>{row.quantity}</td>
                    <td>{formatMoney(row.buyingPrice, currency, currencies)}</td>
                    <td>{formatMoney(row.sellingPrice, currency, currencies)}</td>
                    <td>{row.soldQty}</td>
                    <td>{formatMoney(row.revenue, currency, currencies)}</td>
                    <td>{formatMoney(row.cost, currency, currencies)}</td>
                    <td className={row.profit >= 0 ? 'clear' : 'owed'}>
                      {formatMoney(row.profit, currency, currencies)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
