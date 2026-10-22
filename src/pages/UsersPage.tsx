import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PageHeader } from '../components/PageHeader'
import { IconEdit, IconTrash } from '../components/Icons'
import { useConfirm } from '../components/ConfirmModal'
import type { ManagedUser } from '../types'

export function UsersPage() {
  const { can } = useApp()
  const confirm = useConfirm()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { users: list } = await api.users()
    setUsers(list)
  }

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [])

  async function toggleActive(user: ManagedUser) {
    try {
      await api.updateUser(user.id, { isActive: !user.isActive })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status')
    }
  }

  async function remove(user: ManagedUser) {
    const ok = await confirm({
      title: 'Delete user',
      message: `Delete "${user.name}"? Their payable history linked to this account will also be removed.`,
      confirmLabel: 'Delete user',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.deleteUser(user.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <section className="module-panel">
      <PageHeader
        title="Users"
        description="Manage accounts, roles, and active status."
        crumbs={[{ label: 'Users' }]}
        actions={
          can('users.create') ? (
            <Link to="/users/new" className="btn primary">
              Create user
            </Link>
          ) : null
        }
      />

      {error && <p className="error">{error}</p>}

      {users.length === 0 ? (
        <p className="empty">No users yet. Create the first account to get started.</p>
      ) : (
        <div className="card-grid">
          {users.map((user) => (
            <article key={user.id} className="entity-card user-entity">
              <div className="entity-card-head">
                <div className="user-card-identity">
                  <span className="avatar">{user.name.slice(0, 1)}</span>
                  <div className="entity-card-copy">
                    <h2>{user.name}</h2>
                    <p className="muted">{user.email}</p>
                  </div>
                </div>
                <div className="card-actions">
                  {can('users.update') && (
                    <Link
                      to={`/users/${user.id}/edit`}
                      className="icon-btn"
                      title="Edit user"
                      aria-label={`Edit ${user.name}`}
                    >
                      <IconEdit className="ico" />
                    </Link>
                  )}
                  {can('users.delete') && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Delete user"
                      aria-label={`Delete ${user.name}`}
                      onClick={() => void remove(user)}
                    >
                      <IconTrash className="ico" />
                    </button>
                  )}
                </div>
              </div>
              <div className="entity-card-footer">
                <span className="role-tag">{user.roleName}</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={user.isActive}
                    disabled={!can('users.update')}
                    onChange={() => void toggleActive(user)}
                  />
                  <span>{user.isActive ? 'Active' : 'Inactive'}</span>
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
