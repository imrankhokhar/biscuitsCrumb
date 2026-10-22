import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PageHeader } from '../components/PageHeader'
import { IconEdit, IconTrash } from '../components/Icons'
import { useConfirm } from '../components/ConfirmModal'
import type { RoleRow } from '../types'

export function RolesPage() {
  const { can } = useApp()
  const confirm = useConfirm()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const r = await api.roles()
    setRoles(r.roles)
  }

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [])

  async function remove(role: RoleRow) {
    if (role.code === 'admin' || role.code === 'user') {
      setError('System roles (admin, user) cannot be deleted.')
      return
    }
    if (role.userCount > 0) {
      setError(
        `Cannot delete "${role.name}" while ${role.userCount} user(s) are assigned. Reassign them first.`,
      )
      return
    }
    const ok = await confirm({
      title: 'Delete role',
      message: `Delete role "${role.name}"? This cannot be undone.`,
      confirmLabel: 'Delete role',
      tone: 'danger',
    })
    if (!ok) return
    setError(null)
    try {
      await api.deleteRole(role.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <section className="module-panel">
      <PageHeader
        title="Roles & Permissions"
        description="Manage roles, then edit permissions for each role."
        crumbs={[{ label: 'Roles & Permissions' }]}
        actions={
          can('roles.manage') ? (
            <Link to="/roles/new" className="btn primary">
              Create role
            </Link>
          ) : null
        }
      />

      {error && <p className="error">{error}</p>}

      <div className="card-grid">
        {roles.map((role) => {
          const locked = role.code === 'admin' || role.code === 'user'
          return (
            <article key={role.id} className="entity-card">
              <div className="entity-card-head">
                <div className="entity-card-copy">
                  <h2>{role.name}</h2>
                  <p className="muted">
                    {role.code} · {role.userCount} users · {role.permissionCodes.length} permissions
                  </p>
                  {role.description ? <p className="muted card-desc">{role.description}</p> : null}
                </div>
                {can('roles.manage') && (
                  <div className="card-actions">
                    <Link
                      to={`/roles/${role.id}/permissions`}
                      className="icon-btn"
                      title="Edit permissions"
                      aria-label={`Edit permissions for ${role.name}`}
                    >
                      <IconEdit className="ico" />
                    </Link>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title={
                        locked
                          ? 'System roles cannot be deleted'
                          : role.userCount > 0
                            ? 'Reassign users before deleting'
                            : 'Delete role'
                      }
                      aria-label={`Delete ${role.name}`}
                      disabled={locked || role.userCount > 0}
                      onClick={() => void remove(role)}
                    >
                      <IconTrash className="ico" />
                    </button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
