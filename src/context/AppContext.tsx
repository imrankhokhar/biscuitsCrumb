import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/api'
import { applyThemePreference } from '../lib/theme'
import type {
  Branding,
  CurrencyOption,
  Item,
  NotifySoundKind,
  PendingPayment,
  ThemePreference,
  User,
} from '../types'

interface AppContextValue {
  bootstrapping: boolean
  currentUser: User | null
  items: Item[]
  currency: string
  currencies: CurrencyOption[]
  branding: Branding
  notificationSoundEnabled: boolean
  notificationSoundUrl: string
  paymentSoundUrl: string
  unselectSoundUrl: string
  myPayable: number
  pendingPayment: PendingPayment | null
  pendingPayments: PendingPayment[]
  pendingTotal: number
  payableDueNow: number
  unreadNotifications: number
  can: (code: string) => boolean
  playNotifySound: (kind?: NotifySoundKind) => void
  refreshItems: () => Promise<void>
  refreshPayable: () => Promise<void>
  refreshBranding: () => Promise<void>
  refreshUnreadNotifications: () => Promise<void>
  login: (email: string, password: string) => Promise<string | null>
  signup: (name: string, email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  addItemCharge: (itemId: string) => Promise<string>
  undoItemCharge: (chargeId: string) => Promise<void>
  selfPay: (amount: number, method: string, receipt: File) => Promise<void>
  addItem: (form: FormData) => Promise<void>
  updateItem: (id: string, form: FormData) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  setCurrency: (code: string) => Promise<void>
  setTheme: (theme: ThemePreference) => Promise<void>
  updateProfile: (form: FormData) => Promise<void>
}

const defaultBranding: Branding = {
  appName: 'Excelorithm',
  tagline: 'Vending Machine',
  logoUrl: '',
}

const AppContext = createContext<AppContextValue | null>(null)

function beep(freq: number, duration = 0.12) {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = freq
  gain.gain.value = 0.05
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [currency, setCurrencyState] = useState('USD')
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([])
  const [branding, setBranding] = useState<Branding>(defaultBranding)
  const [notificationSoundEnabled, setSoundEnabled] = useState(true)
  const [notificationSoundUrl, setSoundUrl] = useState('')
  const [paymentSoundUrl, setPaymentSoundUrl] = useState('')
  const [unselectSoundUrl, setUnselectSoundUrl] = useState('')
  const [myPayable, setMyPayable] = useState(0)
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null)
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [payableDueNow, setPayableDueNow] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const lastUnreadRef = useRef(0)

  function applyPayableState(r: {
    amount: number
    pendingTotal?: number
    payableDueNow?: number
    pendingPayments?: PendingPayment[]
    pendingPayment?: PendingPayment | null
  }) {
    const payments = r.pendingPayments ?? (r.pendingPayment ? [r.pendingPayment] : [])
    const total =
      r.pendingTotal ?? +payments.reduce((s, p) => s + p.amount, 0).toFixed(2)
    setMyPayable(r.amount)
    setPendingPayments(payments)
    setPendingTotal(total)
    setPendingPayment(payments[0] ?? null)
    setPayableDueNow(
      r.payableDueNow ?? Math.max(0, +(r.amount - total).toFixed(2)),
    )
  }

  const can = useCallback(
    (code: string) => Boolean(currentUser?.permissions.includes(code)),
    [currentUser],
  )

  const playNotifySound = useCallback(
    (kind: NotifySoundKind = 'item') => {
      if (!notificationSoundEnabled) return
      try {
        const url =
          kind === 'payment'
            ? paymentSoundUrl
            : kind === 'unselect'
              ? unselectSoundUrl
              : notificationSoundUrl
        if (url) {
          const audio = new Audio(url)
          void audio.play()
          return
        }
        const fallback =
          kind === 'payment' ? 660 : kind === 'unselect' ? 440 : 880
        beep(fallback, kind === 'payment' ? 0.18 : 0.12)
      } catch {
        /* ignore */
      }
    },
    [notificationSoundEnabled, notificationSoundUrl, paymentSoundUrl, unselectSoundUrl],
  )

  const refreshItems = useCallback(async () => {
    const { items: next } = await api.items()
    setItems(next)
  }, [])

  const refreshPayable = useCallback(async () => {
    applyPayableState(await api.myPayable())
  }, [])

  const refreshBranding = useCallback(async () => {
    const { branding: b } = await api.publicBranding()
    setBranding(b)
  }, [])

  const refreshUnreadNotifications = useCallback(async () => {
    if (!currentUser?.permissions.includes('notifications.view')) {
      setUnreadNotifications(0)
      return
    }
    const { unreadCount } = await api.unreadNotifications()
    if (unreadCount > lastUnreadRef.current) {
      playNotifySound('payment')
    }
    lastUnreadRef.current = unreadCount
    setUnreadNotifications(unreadCount)
  }, [currentUser, playNotifySound])

  const applySoundSettings = useCallback(
    (s: {
      notificationSoundEnabled: boolean
      notificationSoundUrl: string
      paymentSoundUrl: string
      unselectSoundUrl?: string
    }) => {
      setSoundEnabled(s.notificationSoundEnabled)
      setSoundUrl(s.notificationSoundUrl)
      setPaymentSoundUrl(s.paymentSoundUrl ?? '')
      setUnselectSoundUrl(s.unselectSoundUrl ?? '')
    },
    [],
  )

  const loadSessionData = useCallback(async (user: User) => {
    setCurrentUser(user)
    applyThemePreference(user.themePreference)
    const tasks: Promise<unknown>[] = [
      api.publicBranding().then((r) => setBranding(r.branding)),
      api.currencies().then((r) => setCurrencies(r.currencies)),
    ]
    if (user.permissions.includes('items.view')) {
      tasks.push(api.items().then((r) => setItems(r.items)))
    }
    tasks.push(
      api
        .myPayable()
        .then((r) => applyPayableState(r))
        .catch(() => {
          setMyPayable(0)
          setPendingPayment(null)
          setPendingPayments([])
          setPendingTotal(0)
          setPayableDueNow(0)
        }),
    )
    if (user.permissions.includes('settings.view')) {
      tasks.push(
        api
          .settings()
          .then((r) => {
            setCurrencyState(r.settings.currency)
            setBranding({
              appName: r.settings.appName,
              tagline: r.settings.tagline,
              logoUrl: r.settings.logoUrl,
            })
            applySoundSettings(r.settings)
          })
          .catch(() => undefined),
      )
    }
    if (user.permissions.includes('notifications.view')) {
      tasks.push(
        api
          .unreadNotifications()
          .then((r) => {
            lastUnreadRef.current = r.unreadCount
            setUnreadNotifications(r.unreadCount)
          })
          .catch(() => {
            lastUnreadRef.current = 0
            setUnreadNotifications(0)
          }),
      )
    }
    await Promise.all(tasks)
  }, [applySoundSettings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshBranding()
        const { user } = await api.me()
        if (!cancelled) await loadSessionData(user)
      } catch {
        if (!cancelled) {
          setCurrentUser(null)
          applyThemePreference('system')
        }
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadSessionData, refreshBranding])

  useEffect(() => {
    if (currentUser?.themePreference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemePreference('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [currentUser?.themePreference])

  useEffect(() => {
    if (!currentUser) return
    // 60s keeps due/unread fresh without burning DB row-reads (D1 free tier / shared SQLite)
    const id = window.setInterval(() => {
      void refreshPayable().catch(() => undefined)
      if (currentUser.permissions.includes('notifications.view')) {
        void refreshUnreadNotifications().catch(() => undefined)
      }
    }, 60_000)
    return () => window.clearInterval(id)
  }, [currentUser, refreshPayable, refreshUnreadNotifications])

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { user } = await api.login(email, password)
        await loadSessionData(user)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Login failed'
      }
    },
    [loadSessionData],
  )

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      try {
        const { user } = await api.signup(name, email, password)
        await loadSessionData(user)
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Signup failed'
      }
    },
    [loadSessionData],
  )

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setCurrentUser(null)
    setItems([])
    setMyPayable(0)
    setPendingPayment(null)
    setPendingPayments([])
    setPendingTotal(0)
    setPayableDueNow(0)
    setUnreadNotifications(0)
    lastUnreadRef.current = 0
    applyThemePreference('system')
  }, [])

  const addItemCharge = useCallback(
    async (itemId: string) => {
      const result = await api.chargeItem(itemId)
      await Promise.all([refreshPayable(), refreshItems()])
      playNotifySound('item')
      return result.chargeId
    },
    [refreshPayable, refreshItems, playNotifySound],
  )

  const undoItemCharge = useCallback(
    async (chargeId: string) => {
      await api.undoCharge(chargeId)
      await Promise.all([refreshPayable(), refreshItems()])
      playNotifySound('unselect')
    },
    [refreshPayable, refreshItems, playNotifySound],
  )

  const selfPay = useCallback(
    async (amount: number, method: string, receipt: File) => {
      applyPayableState(await api.selfPay(amount, method, receipt))
      await refreshUnreadNotifications().catch(() => undefined)
    },
    [refreshUnreadNotifications],
  )

  const addItem = useCallback(
    async (form: FormData) => {
      await api.addItem(form)
      await refreshItems()
    },
    [refreshItems],
  )

  const updateItem = useCallback(
    async (id: string, form: FormData) => {
      await api.updateItem(id, form)
      await refreshItems()
    },
    [refreshItems],
  )

  const deleteItem = useCallback(
    async (id: string) => {
      await api.deleteItem(id)
      await refreshItems()
    },
    [refreshItems],
  )

  const setCurrency = useCallback(async (code: string) => {
    const { settings } = await api.setCurrency(code)
    setCurrencyState(settings.currency)
  }, [])

  const setTheme = useCallback(async (theme: ThemePreference) => {
    const { user } = await api.setTheme(theme)
    setCurrentUser(user)
    applyThemePreference(theme)
  }, [])

  const updateProfile = useCallback(async (form: FormData) => {
    const { user } = await api.updateProfile(form)
    setCurrentUser(user)
  }, [])

  const value = useMemo(
    () => ({
      bootstrapping,
      currentUser,
      items,
      currency,
      currencies,
      branding,
      notificationSoundEnabled,
      notificationSoundUrl,
      paymentSoundUrl,
      unselectSoundUrl,
      myPayable,
      pendingPayment,
      pendingPayments,
      pendingTotal,
      payableDueNow,
      unreadNotifications,
      can,
      playNotifySound,
      refreshItems,
      refreshPayable,
      refreshBranding,
      refreshUnreadNotifications,
      login,
      signup,
      logout,
      addItemCharge,
      undoItemCharge,
      selfPay,
      addItem,
      updateItem,
      deleteItem,
      setCurrency,
      setTheme,
      updateProfile,
    }),
    [
      bootstrapping,
      currentUser,
      items,
      currency,
      currencies,
      branding,
      notificationSoundEnabled,
      notificationSoundUrl,
      paymentSoundUrl,
      unselectSoundUrl,
      myPayable,
      pendingPayment,
      pendingPayments,
      pendingTotal,
      payableDueNow,
      unreadNotifications,
      can,
      playNotifySound,
      refreshItems,
      refreshPayable,
      refreshBranding,
      refreshUnreadNotifications,
      login,
      signup,
      logout,
      addItemCharge,
      undoItemCharge,
      selfPay,
      addItem,
      updateItem,
      deleteItem,
      setCurrency,
      setTheme,
      updateProfile,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
