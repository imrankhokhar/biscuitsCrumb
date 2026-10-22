import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import type { Role } from '../types'

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode
  role?: Role
}) {
  const { currentUser } = useApp()
  if (!currentUser) return <Navigate to="/login" replace />
  if (role && currentUser.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}
