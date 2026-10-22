import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../prisma.js'

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

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const COOKIE = 'evm_token'

export function signToken(user: AuthUser): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET missing')
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '7d' })
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Set COOKIE_SECURE=true when serving over HTTPS
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, cookieOpts())
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, cookieOpts())
}

// Short in-memory cache — cuts permission-tree reads on every polled request
const authCache = new Map<string, { user: AuthUser; exp: number }>()
const AUTH_CACHE_MS = 45_000

export function bustAuthCache(userId?: string) {
  if (userId) authCache.delete(userId)
  else authCache.clear()
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const hit = authCache.get(userId)
  if (hit && hit.exp > Date.now()) return hit.user

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] as string | undefined
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET missing')
    const payload = jwt.verify(token, secret) as { sub: string }
    const user = await loadAuthUser(payload.sub)
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

export function requirePermission(...codes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const ok = codes.some((c) => req.user!.permissions.includes(c))
    if (!ok) {
      res.status(403).json({ error: 'Permission denied' })
      return
    }
    next()
  }
}

/** @deprecated prefer requirePermission — kept for quick admin checks */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' })
    return
  }
  next()
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
