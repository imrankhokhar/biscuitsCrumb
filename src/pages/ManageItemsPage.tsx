import { useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import { formatMoney, getCurrency } from '../lib/currency'
import { PageHeader } from '../components/PageHeader'
import { useConfirm } from '../components/ConfirmModal'
import type { Item } from '../types'

const empty = {
  title: '',
  description: '',
  price: '',
  buyingPrice: '',
  quantity: '',
  image: null as File | null,
}

export function ManageItemsPage() {
  const { items, currency, currencies, addItem, updateItem, deleteItem, can } = useApp()
  const confirm = useConfirm()
  const symbol = getCurrency(currency, currencies).symbol
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<Item | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const showBuy = can('items.manage') || can('items.create') || can('items.update')

  function reset() {
    setForm(empty)
    setEditing(null)
    setError(null)
  }

  function startEdit(item: Item) {
    setEditing(item)
    setForm({
      title: item.title,
      description: item.description ?? '',
      price: String(item.price),
      buyingPrice: String(item.buyingPrice ?? 0),
      quantity: String(item.quantity ?? 0),
      image: null,
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const price = Number(form.price)
    const buyingPrice = Number(form.buyingPrice)
    const quantity = Number(form.quantity)
    if (!form.title.trim() || !Number.isFinite(price) || price < 0) return
    if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
      setError('Enter a valid buying price')
      return
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Enter a valid quantity')
      return
    }
    if (!editing && !form.image) {
      setError('Please choose an image from your device')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = new FormData()
      data.set('title', form.title)
      data.set('description', form.description)
      data.set('price', String(price))
      data.set('buyingPrice', String(buyingPrice))
      data.set('quantity', String(quantity))
      if (form.image) data.set('image', form.image)
      if (editing) await updateItem(editing.id, data)
      else await addItem(data)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="module-panel">
      <PageHeader
        title="Manage Items"
        description={`Upload images from your device. Prices use Settings currency (${currency} · ${symbol}).`}
        crumbs={[{ label: 'Manage Items' }]}
      />

      {(can('items.create') || (editing && can('items.update'))) && (
        <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
          <h2>{editing ? 'Edit item' : 'Add item'}</h2>
          <label>
            Title
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </label>
          <label>
            Description
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="0"
              step="1"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              required
            />
          </label>
          <label>
            Buying price ({currency})
            <div className="price-row">
              <span className="currency-badge">{symbol}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.buyingPrice}
                onChange={(e) => setForm((f) => ({ ...f, buyingPrice: e.target.value }))}
                required
              />
            </div>
          </label>
          <label>
            Selling price ({currency})
            <div className="price-row">
              <span className="currency-badge">{symbol}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                required
              />
            </div>
          </label>
          <label>
            Image {editing ? '(optional — leave empty to keep current)' : '(required)'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setForm((f) => ({ ...f, image: e.target.files?.[0] ?? null }))
              }
              required={!editing}
            />
          </label>
          {editing && (
            <img className="preview-img" src={editing.imageUrl} alt={editing.title} />
          )}
          {form.image && <p className="muted">Selected: {form.image.name}</p>}
          {error && <p className="error">{error}</p>}
          <div className="row-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {editing ? 'Save changes' : 'Add item'}
            </button>
            {editing && (
              <button type="button" className="btn ghost" onClick={reset}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              {showBuy && <th>Buy</th>}
              <th>Sell</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="table-item">
                    <img src={item.imageUrl} alt="" />
                    <span>{item.title}</span>
                  </div>
                </td>
                <td>
                  <span className={item.quantity <= 4 ? 'owed' : undefined}>{item.quantity}</span>
                </td>
                {showBuy && (
                  <td>
                    {item.buyingPrice != null
                      ? formatMoney(item.buyingPrice, currency, currencies)
                      : '—'}
                  </td>
                )}
                <td>{formatMoney(item.price, currency, currencies)}</td>
                <td className="row-actions">
                  {can('items.update') && (
                    <button type="button" className="btn ghost" onClick={() => startEdit(item)}>
                      Edit
                    </button>
                  )}
                  {can('items.delete') && (
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => {
                        void (async () => {
                          const ok = await confirm({
                            title: 'Delete item',
                            message: `Delete "${item.title}"? It will be hidden from the catalog.`,
                            confirmLabel: 'Delete item',
                            tone: 'danger',
                          })
                          if (ok) await deleteItem(item.id)
                        })()
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
