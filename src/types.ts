export type Role = 'admin' | 'user'
export type ThemePreference = 'light' | 'dark' | 'system'

export interface CurrencyOption {
  id?: string
  code: string
  name: string
  label?: string
  symbol: string
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  themePreference: ThemePreference
  avatarUrl?: string
  permissions: string[]
}

export interface ManagedUser {
  id: string
  name: string
  email: string
  isActive: boolean
  roleId: string
  roleCode: string
  roleName: string
  createdAt: string
  updatedAt: string
}

export interface Item {
  id: string
  title: string
  description?: string
  price: number
  sellingPrice?: number
  buyingPrice?: number
  quantity: number
  imageUrl: string
  isActive?: boolean
  currencyCode?: string
  currencySymbol?: string
  createdAt: string
  updatedAt?: string
}

export interface AccountabilitySummary {
  totalRevenue: number
  totalCost: number
  grossProfit: number
  receivables: number
  totalCollected: number
  inventoryCostValue: number
  inventorySellValue: number
  unitsSold: number
}

export interface AccountabilityItemRow {
  itemId: string
  title: string
  quantity: number
  buyingPrice: number
  sellingPrice: number
  soldQty: number
  revenue: number
  cost: number
  profit: number
  stockCostValue: number
  stockSellValue: number
}

export type PaymentStatus = 'pending' | 'paid' | 'rejected'

export interface PendingPayment {
  id: string
  amount: number
  paymentMethod: string
  receiptUrl?: string | null
  status: PaymentStatus
  note?: string
  createdAt: string
}

export interface PayableRow {
  userId: string
  name: string
  email: string
  amount: number
  totalCharged?: number
  totalPaid?: number
  currencyCode?: string | null
  updatedAt: string | null
  paymentMethod?: string | null
  receiptUrl?: string | null
  paymentStatus?: PaymentStatus | null
  pendingPayment?: PendingPayment | null
  pendingPayments?: PendingPayment[]
  /** Unique key when listing one row per payment request */
  rowKey?: string
  /** Amount of this specific pending request (when row is request-scoped) */
  requestAmount?: number
}

export interface EmailUser {
  id: string
  name: string
  email: string
  payable: number
}

export interface EmailLog {
  id: string
  toUserId: string
  toEmail: string
  fromEmail?: string
  subject: string
  body: string
  status?: string
  sentAt: string
  createdAt?: string
}

export interface RoleRow {
  id: string
  code: string
  name: string
  description: string
  userCount: number
  permissionCodes: string[]
}

export interface PermissionRow {
  id: string
  code: string
  name: string
  description: string
  module: string
}

export interface SmtpSettings {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  hasPass: boolean
  from: string
}

export interface Branding {
  appName: string
  tagline: string
  logoUrl: string
}

export interface EmailTemplate {
  id: string
  code: string
  name: string
  subject: string
  body: string
  updatedAt?: string
}

export interface AppSettings {
  appName: string
  tagline: string
  logoUrl: string
  currency: string
  currencyId: string
  currencyName: string
  currencySymbol: string
  smtp: SmtpSettings
  notificationSoundEnabled: boolean
  notificationSoundUrl: string
  paymentSoundUrl: string
  unselectSoundUrl: string
}

export type NotifySoundKind = 'item' | 'payment' | 'unselect'

export interface AppNotification {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

export type CashlineStatus =
  | 'clear'
  | 'not_in_sheet'
  | 'not_received'
  | 'not_in_system'

export interface CashlineSummary {
  clear: number
  not_in_sheet: number
  not_received: number
  not_in_system: number
}

export interface CashlineRow {
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
