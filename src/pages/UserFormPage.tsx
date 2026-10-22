import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'

export function UserFormPage() {
  const { userId } = useParams()
  const isEdit = Boolean(userId)
  const navigate = useNavigate()
  const [roles, setRoles] = useState<{ id: string; code: string; name: string }[]>([])
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roleId: '',
    isActive: true,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const r = await api.userRoles()
      setRoles(r.roles)
      const defaultRole = r.roles.find((x) => x.code === 'user')?.id || r.roles[0]?.id || ''
      if (isEdit && userId) {
        const { users } = await api.users()
        const user = users.find((u) => u.id === userId)
        if (user) {
          setForm({
            name: user.name,
            email: user.email,
            password: '',
            roleId: user.roleId,
            isActive: user.isActive,
          })
          return
        }
      }
      setForm((f) => ({ ...f, roleId: defaultRole }))
    })()
  }, [isEdit, userId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (isEdit && userId) {
        await api.updateUser(userId, {
          name: form.name,
          email: form.email,
          roleId: form.roleId,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        })
      } else {
        await api.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          roleId: form.roleId,
          isActive: form.isActive,
        })
      }
      navigate('/users')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <PageHeader
        title={isEdit ? 'Edit user' : 'Create user'}
        description={isEdit ? 'Update account details.' : 'Add a new account with a role.'}
        crumbs={[
          { label: 'Users', to: '/users' },
          { label: isEdit ? 'Edit' : 'Create' },
        ]}
      />
      <form className="panel stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Full name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="Full name"
          />
        </label>
        <label>
          Email address
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            placeholder="user@company.com"
          />
        </label>
        <label>
          Password {isEdit ? '(leave blank to keep current)' : ''}
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required={!isEdit}
            minLength={6}
            placeholder={isEdit ? '••••••••' : 'At least 6 characters'}
          />
        </label>
        <label>
          Role
          <select
            value={form.roleId}
            onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
            required
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </label>
        <label className="perm-row">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          <span>Active account</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save user' : 'Create user'}
        </button>
      </form>
    </section>
  )
}
