import type { CurrencyOption } from '../types'

/** Fallback only until currencies load from DB */
export const FALLBACK_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
]

export function getCurrency(
  code: string,
  list: CurrencyOption[] = FALLBACK_CURRENCIES,
): CurrencyOption {
  return list.find((c) => c.code === code) ?? list[0] ?? FALLBACK_CURRENCIES[0]
}

export function formatMoney(amount: number, code: string, list?: CurrencyOption[]): string {
  const { symbol } = getCurrency(code, list)
  const value = Number.isFinite(amount) ? amount : 0
  const fixed = code === 'JPY' ? Math.round(value).toString() : value.toFixed(2)
  return `${symbol} ${fixed}`
}
