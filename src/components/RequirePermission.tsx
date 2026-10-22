import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export function RequirePermission({
  code,
  children,
}: {
  code: string
  children: ReactNode
}) {
  const { currentUser, can } = useApp()
  if (!currentUser) return <Navigate to="/login" replace />
  if (!can(code)) return <Navigate to="/" replace />
  return <>{children}</>
}
