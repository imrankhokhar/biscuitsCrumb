import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PageHeader } from '../components/PageHeader'
import type { PermissionRow, RoleRow } from '../types'

export function RolePermissionsPage() {
  const { roleId } = useParams()
  const navigate = useNavigate()
  const { can } = useApp()
  const [role, setRole] = useState<RoleRow | null>(null)
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [r, p] = await Promise.all([api.roles(), api.permissions()])
      setPermissions(p.permissions)
      const found = r.roles.find((x) => x.id === roleId) ?? null
      setRole(found)
      setSelectedCodes(found?.permissionCodes ?? [])
    })()
  }, [roleId])

  const byModule = useMemo(() => {
    const map = new Map<string, PermissionRow[]>()
    for (const p of permissions) {
      const list = map.get(p.module) ?? []
      list.push(p)
      map.set(p.module, list)
    }
    return [...map.entries()]
  }, [permissions])

  function toggle(code: string) {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  async function save() {
    if (!role) return
    setBusy(true)
    setError(null)
    try {
      await api.setRolePermissions(role.id, selectedCodes)
      navigate('/roles')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!role) {
    return (
      <section>
        <p className="muted">Loading role…</p>
      </section>
    )
  }

  return (
    <section>
      <PageHeader
        title={`${role.name} permissions`}
        description={`${role.code} · assign menu and action permissions`}
        crumbs={[
          { label: 'Roles & Permissions', to: '/roles' },
          { label: role.name },
        ]}
      />

      <div className="panel stack">
        {byModule.map(([module, list]) => (
          <div key={module} className="perm-module">
            <h3>{module}</h3>
            {list.map((p) => (
              <label key={p.id} className="perm-row">
                <input
                  type="checkbox"
                  checked={selectedCodes.includes(p.code)}
                  disabled={!can('roles.manage')}
                  onChange={() => toggle(p.code)}
                />
                <span>
                  <strong>{p.name}</strong>
                  <span className="muted">
                    {p.code} — {p.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        {can('roles.manage') && (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save permissions'}
          </button>
        )}
      </div>
    </section>
  )
}
