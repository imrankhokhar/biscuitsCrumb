import { matchCashline, type AppPaymentForMatch } from './cashlineMatch.js'
import type { SheetCredit } from './cashlineParse.js'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const day = (iso: string) => new Date(iso)

const sheet: SheetCredit[] = [
  {
    key: 's-1',
    rowIndex: 2,
    date: day('2026-03-10T00:00:00Z'),
    amount: 100,
    description: 'Transfer from alice@example.com',
  },
  {
    key: 's-2',
    rowIndex: 3,
    date: day('2026-03-11T00:00:00Z'),
    amount: 50,
    description: 'Unknown deposit',
  },
]

const payments: AppPaymentForMatch[] = [
  {
    id: 'p1',
    amount: 100,
    status: 'paid',
    date: day('2026-03-10T12:00:00Z'),
    userName: 'Alice Smith',
    userEmail: 'alice@example.com',
    paymentMethod: 'bank',
    note: '',
  },
  {
    id: 'p2',
    amount: 75,
    status: 'pending',
    date: day('2026-03-12T12:00:00Z'),
    userName: 'Bob',
    userEmail: 'bob@example.com',
    paymentMethod: 'jazzcash',
    note: '',
  },
  {
    id: 'p3',
    amount: 200,
    status: 'paid',
    date: day('2026-03-09T12:00:00Z'),
    userName: 'Carol',
    userEmail: 'carol@example.com',
    paymentMethod: 'bank',
    note: '',
  },
]

const { rows, summary } = matchCashline(sheet, payments)

assert(summary.clear === 1, `expected 1 clear, got ${summary.clear}`)
assert(summary.not_in_system === 1, `expected 1 not_in_system, got ${summary.not_in_system}`)
assert(summary.not_received === 1, `expected 1 not_received, got ${summary.not_received}`)
assert(summary.not_in_sheet === 1, `expected 1 not_in_sheet, got ${summary.not_in_sheet}`)
assert(
  rows.some((r) => r.status === 'clear' && r.paymentId === 'p1'),
  'alice payment should clear',
)

console.log('cashlineMatch.selfcheck: ok')
