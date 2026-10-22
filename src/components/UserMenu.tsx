import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatMoney } from '../lib/currency'
import {
  IconChevron,
  IconLock,
  IconLogout,
  IconSettings,
  IconUser,
} from './Icons'

function UserAvatar({
  name,
  avatarUrl,
  large,
}: {
  name: string
  avatarUrl?: string
  large?: boolean
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || 'U'
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`user-avatar-round profile-avatar-img ${large ? 'lg' : ''}`}
      />
    )
  }
  return (
    <span className={`user-avatar-round ${large ? 'lg' : ''}`} aria-hidden>
      {initial}
    </span>
  )
}

export function UserMenu() {
  const { currentUser, logout, myPayable, currency, currencies, can } = useApp()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!currentUser) return null

  return (
    <div className="user-menu" ref={rootRef}>
      {can('items.charge') && (
        <span className="payable-pill top-due">
          Due {formatMoney(myPayable, currency, currencies)}
        </span>
      )}
      <button
        type="button"
        className="user-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <UserAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} />
        <span className="user-menu-name">{currentUser.name}</span>
        <IconChevron className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-meta">
            <UserAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} />
            <div>
              <strong>{currentUser.name}</strong>
              <span className="muted">{currentUser.email}</span>
            </div>
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <IconUser className="menu-ico" /> Profile
          </Link>
          <Link to="/settings/password" role="menuitem" onClick={() => setOpen(false)}>
            <IconLock className="menu-ico" /> Change password
          </Link>
          {can('settings.view') && (
            <Link to="/settings" role="menuitem" onClick={() => setOpen(false)}>
              <IconSettings className="menu-ico" /> Settings
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="user-menu-logout"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
          >
            <IconLogout className="menu-ico" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
