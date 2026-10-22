import { useEffect } from 'react'
import { useApp } from '../context/AppContext'

export function DocumentMeta() {
  const { branding } = useApp()

  useEffect(() => {
    document.title = branding.tagline
      ? `${branding.appName} — ${branding.tagline}`
      : branding.appName

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    if (branding.logoUrl) {
      link.href = branding.logoUrl
      link.type = branding.logoUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
    }
  }, [branding])

  return null
}
