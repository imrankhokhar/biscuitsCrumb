import type { SheetCredit } from './cashlineParse.js'

export type CashlineStatus =
  | 'clear'
  | 'not_in_sheet'
  | 'not_received'
  | 'not_in_system'

export type AppPaymentForMatch = {
  id: string
  amount: number
  status: string
  date: Date
  userName: string
  userEmail: string
  paymentMethod: string
  note: string
}

export type CashlineRow = {
  status: CashlineStatus
  amount: number
  date: string | null
  userName: string | null
  userEmail: string | null
  paymentId: string | null
  paymentStatus: string | null
  paymentMethod: string | null
  sheetRow: number | null
  sheetDescription: string | null
  note: string
}

export type CashlineSummary = {
  clear: number
  not_in_sheet: number
  not_received: number
  not_in_system: number
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function dayKey(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function withinOneDay(a: Date | null, b: Date): boolean {
  if (!a) return true // no sheet date → allow amount/identity match only
  return Math.abs(dayKey(a) - dayKey(b)) <= 86400000
}

function identityHit(desc: string, pay: AppPaymentForMatch): boolean {
  const hay = desc.toLowerCase()
  const email = pay.userEmail.trim().toLowerCase()
  const name = pay.userName.trim().toLowerCase()
  if (email && hay.includes(email)) return true
  if (name.length >= 3 && hay.includes(name)) return true
  // first + last token of name
  const parts = name.split(/\s+/).filter((p) => p.length >= 3)
  if (parts.length >= 2 && parts.every((p) => hay.includes(p))) return true
  return false
}

function isoDate(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function matchCashline(
  sheet: SheetCredit[],
  payments: AppPaymentForMatch[],
): { rows: CashlineRow[]; summary: CashlineSummary } {
  const unmatchedPays = new Map(payments.map((p) => [p.id, p]))
  const unmatchedSheet = new Map(sheet.map((s) => [s.key, s]))
  const rows: CashlineRow[] = []

  // Pass 1: identity + amount + date
  for (const credit of sheet) {
    const candidates = [...unmatchedPays.values()].filter(
      (p) =>
        round2(p.amount) === round2(credit.amount) &&
        withinOneDay(credit.date, p.date) &&
        identityHit(credit.description, p),
    )
    if (candidates.length === 1) {
      const pay = candidates[0]
      unmatchedPays.delete(pay.id)
      unmatchedSheet.delete(credit.key)
      rows.push({
        status: 'clear',
        amount: credit.amount,
        date: isoDate(credit.date) ?? isoDate(pay.date),
        userName: pay.userName,
        userEmail: pay.userEmail,
        paymentId: pay.id,
        paymentStatus: pay.status,
        paymentMethod: pay.paymentMethod || null,
        sheetRow: credit.rowIndex,
        sheetDescription: credit.description || null,
        note: 'Matched by amount, date, and payer identity in description',
      })
    }
  }

  // Pass 2: unique amount+date (no identity) among remaining
  for (const credit of [...unmatchedSheet.values()]) {
    const candidates = [...unmatchedPays.values()].filter(
      (p) =>
        round2(p.amount) === round2(credit.amount) &&
        withinOneDay(credit.date, p.date),
    )
    if (candidates.length === 1) {
      const pay = candidates[0]
      unmatchedPays.delete(pay.id)
      unmatchedSheet.delete(credit.key)
      rows.push({
        status: 'clear',
        amount: credit.amount,
        date: isoDate(credit.date) ?? isoDate(pay.date),
        userName: pay.userName,
        userEmail: pay.userEmail,
        paymentId: pay.id,
        paymentStatus: pay.status,
        paymentMethod: pay.paymentMethod || null,
        sheetRow: credit.rowIndex,
        sheetDescription: credit.description || null,
        note: 'Matched by unique amount and date',
      })
    }
  }

  for (const credit of unmatchedSheet.values()) {
    rows.push({
      status: 'not_in_system',
      amount: credit.amount,
      date: isoDate(credit.date),
      userName: null,
      userEmail: null,
      paymentId: null,
      paymentStatus: null,
      paymentMethod: null,
      sheetRow: credit.rowIndex,
      sheetDescription: credit.description || null,
      note: 'Present in statement; no matching app payment',
    })
  }

  for (const pay of unmatchedPays.values()) {
    const status: CashlineStatus =
      pay.status === 'pending' ? 'not_received' : 'not_in_sheet'
    rows.push({
      status,
      amount: pay.amount,
      date: isoDate(pay.date),
      userName: pay.userName,
      userEmail: pay.userEmail,
      paymentId: pay.id,
      paymentStatus: pay.status,
      paymentMethod: pay.paymentMethod || null,
      sheetRow: null,
      sheetDescription: null,
      note:
        status === 'not_received'
          ? 'Pending in app; not found in statement'
          : 'Paid in app; not found in statement',
    })
  }

  const summary: CashlineSummary = {
    clear: 0,
    not_in_sheet: 0,
    not_received: 0,
    not_in_system: 0,
  }
  for (const r of rows) summary[r.status] += 1

  rows.sort((a, b) => {
    const order: Record<CashlineStatus, number> = {
      not_received: 0,
      not_in_sheet: 1,
      not_in_system: 2,
      clear: 3,
    }
    return order[a.status] - order[b.status]
  })

  return { rows, summary }
}
