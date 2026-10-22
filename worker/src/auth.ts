import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { AppEnv } from './env.js'
import type { PrismaClient } from './prisma.js'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: string
  roleId: string
  themePreference: string
  avatarUrl: string
  permissions: string[]
}

const COOKIE = 'evm_token'
const WEEK_S = 7 * 24 * 60 * 60

type Ctx = Context<AppEnv>

function cookieOpts(c: Ctx) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: c.env.COOKIE_SECURE === 'true',
    path: '/',
  }
}

function secretOf(c: Ctx) {
  if (!c.env.JWT_SECRET) throw new Error('JWT_SECRET missing')
  return c.env.JWT_SECRET
}

// HS256, payload { sub, role, exp } — same shape as the Express `jsonwebtoken` tokens, so sessions survive a cut-over.
export async function setAuthCookie(c: Ctx, user: AuthUser) {
  const token = await sign(
    { sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + WEEK_S },
    secretOf(c),
  )
  setCookie(c, COOKIE, token, { ...cookieOpts(c), maxAge: WEEK_S })
}

export function clearAuthCookie(c: Ctx) {
  deleteCookie(c, COOKIE, cookieOpts(c))
}

// ponytail: per-isolate cache (45s). bustAuthCache only clears the isolate that handled the write, so a
// permission/role change can take up to 45s to reach other isolates. Upgrade path: drop the cache or use KV.
const authCache = new Map<string, { user: AuthUser; exp: number }>()
const AUTH_CACHE_MS = 45_000

export function bustAuthCache(userId?: string) {
  if (userId) authCache.delete(userId)
  else authCache.clear()
}

export async function loadAuthUser(prisma: PrismaClient, userId: string): Promise<AuthUser | null> {
  const hit = authCache.get(userId)
  if (hit && hit.exp > Date.now()) return hit.user

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  if (!user || !user.isActive) {
    authCache.delete(userId)
    return null
  }
  const authUser: AuthUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.code,
    roleId: user.roleId,
    themePreference: user.themePreference,
    avatarUrl: user.avatarUrl || '',
    permissions: user.role.permissions.map((rp) => rp.permission.code),
  }
  authCache.set(userId, { user: authUser, exp: Date.now() + AUTH_CACHE_MS })
  return authUser
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const payload = await verify(token, secretOf(c), 'HS256')
    const user = await loadAuthUser(c.get('prisma'), String(payload.sub))
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    c.set('user', user)
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}

export function requirePermission(...codes: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    if (!codes.some((code) => user.permissions.includes(code))) {
      return c.json({ error: 'Permission denied' }, 403)
    }
    await next()
  }
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as 'admin' | 'user',
    themePreference: user.themePreference as 'light' | 'dark' | 'system',
    avatarUrl: user.avatarUrl || '',
    permissions: user.permissions,
  }
}
