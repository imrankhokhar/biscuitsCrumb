import type { ThemePreference } from '../types'

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemePreference(pref: ThemePreference) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
  document.documentElement.setAttribute('data-theme-pref', pref)
}
