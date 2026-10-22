import { useEffect, useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { UserMenu } from './UserMenu'
import {
  IconBell,
  IconBox,
  IconChart,
  IconGrid,
  IconMail,
  IconSettings,
  IconShield,
  IconUsers,
  IconWallet,
} from './Icons'

const MENU: {
  to: string
  label: string
  end?: boolean
  permission: string
  Icon: ComponentType<{ className?: string }>
  badgeKey?: 'notifications'
}[] = [
  { to: '/', label: 'Items', end: true, permission: 'items.view', Icon: IconGrid },
  { to: '/items', label: 'Manage Items', permission: 'items.manage', Icon: IconBox },
  { to: '/payables', label: 'Payables', permission: 'payables.view', Icon: IconWallet },
  {
    to: '/accountability',
    label: 'Accountability',
    permission: 'accountability.view',
    Icon: IconChart,
  },
  {
    to: '/cashline',
    label: 'Cashline',
    permission: 'cashline.view',
    Icon: IconWallet,
  },
  {
    to: '/notifications',
    label: 'Notifications',
    permission: 'notifications.view',
    Icon: IconBell,
    badgeKey: 'notifications',
  },
  { to: '/users', label: 'Users', permission: 'users.view', Icon: IconUsers },
  { to: '/email', label: 'Email', permission: 'email.view', Icon: IconMail },
  { to: '/roles', label: 'Roles & Permissions', permission: 'roles.view', Icon: IconShield },
  { to: '/settings', label: 'Settings', permission: 'settings.view', Icon: IconSettings },
]

export function Layout() {
  const { currentUser, can, branding, unreadNotifications } = useApp()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [navOpen])

  if (!currentUser) return null

  const links = MENU.filter((m) => can(m.permission))
  const moduleClass = moduleSurfaceClass(location.pathname)

  return (
    <div className={`app-shell with-left-nav ${navOpen ? 'nav-open' : ''}`}>
      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside id="app-side-nav" className="side-nav" aria-label="Main navigation">
        <div className="side-brand logo-only">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.appName} className="side-logo" />
          ) : (
            <div className="side-logo placeholder" aria-hidden>
              {branding.appName.slice(0, 1)}
            </div>
          )}
        </div>
        <nav className="side-nav-links">
          {links.map((m) => {
            const badge =
              m.badgeKey === 'notifications' && unreadNotifications > 0
                ? unreadNotifications > 99
                  ? '99+'
                  : String(unreadNotifications)
                : null
            return (
              <NavLink key={m.to} to={m.to} end={m.end}>
                <m.Icon className="nav-ico" />
                <span>{m.label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className="content-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={navOpen}
              aria-controls="app-side-nav"
              onClick={() => setNavOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
              <span className="sr-only">Menu</span>
            </button>
            <div className="brand-block">
              <span className="brand">{branding.appName}</span>
              <span className="brand-sub">{branding.tagline}</span>
            </div>
          </div>
          <UserMenu />
        </header>
        <main className={`main ${moduleClass}`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function moduleSurfaceClass(path: string): string {
  if (path === '/' || path.startsWith('/items')) return 'surface-items'
  if (path.startsWith('/payables')) return 'surface-payables'
  if (path.startsWith('/accountability')) return 'surface-accountability'
  if (path.startsWith('/cashline')) return 'surface-cashline'
  if (path.startsWith('/notifications')) return 'surface-notifications'
  if (path.startsWith('/users')) return 'surface-users'
  if (path.startsWith('/email')) return 'surface-email'
  if (path.startsWith('/roles')) return 'surface-roles'
  if (path.startsWith('/settings') || path.startsWith('/profile')) return 'surface-settings'
  return 'surface-default'
}
