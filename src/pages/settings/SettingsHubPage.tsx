import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/PageHeader'

const LINKS: { to: string; title: string; desc: string; permission?: string }[] = [
  { to: '/settings/theme', title: 'Theme', desc: 'Light, dark, or system preference' },
  { to: '/settings/password', title: 'Change password', desc: 'Update your account password' },
  {
    to: '/settings/branding',
    title: 'App branding',
    desc: 'Logo, app name, and tagline',
    permission: 'settings.update',
  },
  {
    to: '/settings/currency',
    title: 'Currency',
    desc: 'Default currency for prices and payables',
    permission: 'settings.update',
  },
  {
    to: '/settings/notifications',
    title: 'Notification sounds',
    desc: 'Item charge, unselect, and payment tones',
    permission: 'settings.update',
  },
  {
    to: '/settings/smtp',
    title: 'SMTP',
    desc: 'Outgoing email server settings',
    permission: 'settings.smtp',
  },
  {
    to: '/settings/templates',
    title: 'Email templates',
    desc: 'Edit reminder and welcome templates',
    permission: 'settings.update',
  },
]

export function SettingsHubPage() {
  const { can } = useApp()

  return (
    <section className="module-panel">
      <PageHeader
        title="Settings"
        description="Choose a section to configure your workspace."
        crumbs={[{ label: 'Settings' }]}
      />
      <div className="settings-menu">
        {LINKS.filter((l) => !l.permission || can(l.permission)).map((l) => (
          <Link key={l.to} to={l.to} className="settings-menu-item">
            <strong>{l.title}</strong>
            <span className="muted">{l.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
