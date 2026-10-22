const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = { ...(init?.headers ?? {}) }
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (!isForm) {
    ;(headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string' ? data.error : res.statusText || 'Request failed'
    throw new Error(msg)
  }
  return data as T
}

export const api = {
  me: () => request<{ user: import('../types').User }>('/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: import('../types').User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (name: string, email: string, password: string) =>
    request<{ user: import('../types').User }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  setTheme: (theme: import('../types').ThemePreference) =>
    request<{ user: import('../types').User }>('/auth/theme', {
      method: 'PUT',
      body: JSON.stringify({ theme }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  updateProfile: (form: FormData) =>
    request<{ user: import('../types').User }>('/auth/profile', {
      method: 'PUT',
      body: form,
    }),
  publicBranding: () =>
    request<{ branding: import('../types').Branding }>('/settings/public'),
  items: () => request<{ items: import('../types').Item[] }>('/items'),
  addItem: (form: FormData) =>
    request<{ item: import('../types').Item }>('/items', { method: 'POST', body: form }),
  updateItem: (id: string, form: FormData) =>
    request<{ item: import('../types').Item }>(`/items/${id}`, { method: 'PUT', body: form }),
  deleteItem: (id: string) =>
    request<{ ok: true }>(`/items/${id}`, { method: 'DELETE' }),
  chargeItem: (id: string) =>
    request<{
      payable: {
        userId: string
        amount: number
        totalCharged: number
        totalPaid: number
      }
      chargeId: string
      item: import('../types').Item
    }>(`/items/${id}/charge`, { method: 'POST' }),
  openCharges: () =>
    request<{
      charges: {
        id: string
        itemId: string
        amount: number
        itemTitle: string
        createdAt: string
      }[]
    }>('/items/charges/open'),
  undoCharge: (chargeId: string) =>
    request<{
      payable: {
        userId: string
        amount: number
        totalCharged: number
        totalPaid: number
      }
      item: import('../types').Item
      itemTitle: string
    }>(`/items/charges/${chargeId}/undo`, { method: 'POST' }),
  myPayable: () =>
    request<{
      amount: number
      totalCharged: number
      totalPaid: number
      pendingTotal?: number
      payableDueNow?: number
      pendingPayments?: import('../types').PendingPayment[]
      pendingPayment?: import('../types').PendingPayment | null
    }>('/payables/me'),
  payables: () =>
    request<{ payables: import('../types').PayableRow[] }>('/payables'),
  pay: (userId: string, amount: number, note: string) =>
    request<{ amount: number; totalCharged: number; totalPaid: number }>(
      `/payables/${userId}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({ amount, note }),
      },
    ),
  markPaid: (userId: string) =>
    request<{ amount: number; totalCharged: number; totalPaid: number }>(
      `/payables/${userId}/mark-paid`,
      { method: 'POST' },
    ),
  softDeletePayable: (userId: string) =>
    request<{ ok: true }>(`/payables/${userId}`, { method: 'DELETE' }),
  acceptPayment: (paymentId: string, status: 'paid' = 'paid') =>
    request<{ amount: number; totalCharged: number; totalPaid: number }>(
      `/payables/payments/${paymentId}/accept`,
      { method: 'POST', body: JSON.stringify({ status }) },
    ),
  rejectPayment: (paymentId: string, reason: string, status: 'rejected' = 'rejected') =>
    request<{ amount: number; totalCharged: number; totalPaid: number }>(
      `/payables/payments/${paymentId}/reject`,
      { method: 'POST', body: JSON.stringify({ status, reason }) },
    ),
  selfPay: (amount: number, method: string, receipt: File) => {
    const form = new FormData()
    form.set('amount', String(amount))
    form.set('method', method)
    form.set('receipt', receipt)
    return request<{
      amount: number
      totalCharged: number
      totalPaid: number
      pendingTotal?: number
      payableDueNow?: number
      pendingPayments?: import('../types').PendingPayment[]
      pendingPayment?: import('../types').PendingPayment | null
    }>('/payables/me/pay', { method: 'POST', body: form })
  },
  notifications: () =>
    request<{ notifications: import('../types').AppNotification[] }>('/notifications'),
  unreadNotifications: () => request<{ unreadCount: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ ok: true }>('/notifications/read-all', { method: 'POST' }),
  settings: () =>
    request<{ settings: import('../types').AppSettings }>('/settings'),
  currencies: () =>
    request<{ currencies: import('../types').CurrencyOption[] }>('/settings/currencies'),
  setCurrency: (currency: string) =>
    request<{ settings: import('../types').AppSettings }>('/settings/currency', {
      method: 'PUT',
      body: JSON.stringify({ currency }),
    }),
  setSmtp: (body: {
    host: string
    port: number
    secure: boolean
    user: string
    pass?: string
    from: string
  }) =>
    request<{ settings: import('../types').AppSettings }>('/settings/smtp', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  setBranding: (form: FormData) =>
    request<{ settings: import('../types').AppSettings }>('/settings/branding', {
      method: 'PUT',
      body: form,
    }),
  setNotifications: (form: FormData) =>
    request<{ settings: import('../types').AppSettings }>('/settings/notifications', {
      method: 'PUT',
      body: form,
    }),
  templates: () =>
    request<{ templates: import('../types').EmailTemplate[] }>('/settings/templates'),
  updateTemplate: (
    id: string,
    body: { name: string; subject: string; body: string },
  ) =>
    request<{ template: import('../types').EmailTemplate }>(`/settings/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  createTemplate: (body: {
    code: string
    name: string
    subject: string
    body: string
  }) =>
    request<{ template: import('../types').EmailTemplate }>('/settings/templates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  emailUsers: () =>
    request<{ users: import('../types').EmailUser[] }>('/email/users'),
  emailLogs: () =>
    request<{ emails: import('../types').EmailLog[] }>('/email/logs'),
  sendEmail: (toUserId: string, subject: string, body: string) =>
    request<{ email: import('../types').EmailLog }>('/email/send', {
      method: 'POST',
      body: JSON.stringify({ toUserId, subject, body }),
    }),
  roles: () => request<{ roles: import('../types').RoleRow[] }>('/roles'),
  createRole: (body: { code: string; name: string; description?: string }) =>
    request<{ role: import('../types').RoleRow }>('/roles', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteRole: (roleId: string) =>
    request<{ ok: true }>(`/roles/${roleId}`, { method: 'DELETE' }),
  permissions: () =>
    request<{ permissions: import('../types').PermissionRow[] }>('/roles/permissions'),
  setRolePermissions: (roleId: string, permissionCodes: string[]) =>
    request<{ role: { id: string; permissionCodes: string[] } }>(
      `/roles/${roleId}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissionCodes }),
      },
    ),
  users: () => request<{ users: import('../types').ManagedUser[] }>('/users'),
  userRoles: () =>
    request<{ roles: { id: string; code: string; name: string }[] }>('/users/roles'),
  createUser: (body: {
    name: string
    email: string
    password: string
    roleId: string
    isActive?: boolean
  }) =>
    request<{ user: import('../types').ManagedUser }>('/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateUser: (
    id: string,
    body: {
      name?: string
      email?: string
      password?: string
      roleId?: string
      isActive?: boolean
    },
  ) =>
    request<{ user: import('../types').ManagedUser }>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteUser: (id: string) =>
    request<{ ok: true }>(`/users/${id}`, { method: 'DELETE' }),
  accountability: () =>
    request<{
      summary: import('../types').AccountabilitySummary
      items: import('../types').AccountabilityItemRow[]
    }>('/accountability'),
  cashlineCompare: (form: FormData) =>
    request<{
      rows: import('../types').CashlineRow[]
      summary: import('../types').CashlineSummary
      meta: { fileName: string; sheetCredits: number; appPayments: number }
    }>('/cashline/compare', { method: 'POST', body: form }),
}
