import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'

export function RoleCreatePage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { role } = await api.createRole({ code, name, description })
      navigate(`/roles/${role.id}/permissions`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create role')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="Create role"
        description="After creating, you can assign permissions."
        crumbs={[
          { label: 'Roles & Permissions', to: '/roles' },
          { label: 'Create' },
        ]}
      />
      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Role code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase())}
            placeholder="e.g. manager"
            pattern="[a-z0-9_]+"
            required
          />
        </label>
        <label>
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Manager"
          />
        </label>
        <label>
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional summary"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create role'}
        </button>
      </form>
    </section>
  )
}
