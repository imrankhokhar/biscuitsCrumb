import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { ConfirmProvider } from './components/ConfirmModal'
import { Layout } from './components/Layout'
import { DocumentMeta } from './components/DocumentMeta'
import { RequireAuth } from './components/RequireAuth'
import { RequirePermission } from './components/RequirePermission'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { ItemsGridPage } from './pages/ItemsGridPage'
import { PayablesPage } from './pages/PayablesPage'
import { ManageItemsPage } from './pages/ManageItemsPage'
import { EmailPage } from './pages/EmailPage'
import { RolesPage } from './pages/RolesPage'
import { RoleCreatePage } from './pages/RoleCreatePage'
import { RolePermissionsPage } from './pages/RolePermissionsPage'
import { UsersPage } from './pages/UsersPage'
import { UserFormPage } from './pages/UserFormPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsHubPage } from './pages/settings/SettingsHubPage'
import { ThemeSettingsPage } from './pages/settings/ThemeSettingsPage'
import { PasswordSettingsPage } from './pages/settings/PasswordSettingsPage'
import { BrandingSettingsPage } from './pages/settings/BrandingSettingsPage'
import { CurrencySettingsPage } from './pages/settings/CurrencySettingsPage'
import { NotificationSettingsPage } from './pages/settings/NotificationSettingsPage'
import { SmtpSettingsPage } from './pages/settings/SmtpSettingsPage'
import { TemplatesSettingsPage } from './pages/settings/TemplatesSettingsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { AccountabilityPage } from './pages/AccountabilityPage'
import { CashlinePage } from './pages/CashlinePage'

function BootGate({ children }: { children: ReactNode }) {
  const { bootstrapping } = useApp()
  if (bootstrapping) {
    return (
      <div className="auth-page auth-loading">
        <p className="muted">Loading…</p>
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
      <BrowserRouter>
        <DocumentMeta />
        <BootGate>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route
                index
                element={
                  <RequirePermission code="items.view">
                    <ItemsGridPage />
                  </RequirePermission>
                }
              />
              <Route
                path="payables"
                element={
                  <RequirePermission code="payables.view">
                    <PayablesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="accountability"
                element={
                  <RequirePermission code="accountability.view">
                    <AccountabilityPage />
                  </RequirePermission>
                }
              />
              <Route
                path="cashline"
                element={
                  <RequirePermission code="cashline.view">
                    <CashlinePage />
                  </RequirePermission>
                }
              />
              <Route
                path="notifications"
                element={
                  <RequirePermission code="notifications.view">
                    <NotificationsPage />
                  </RequirePermission>
                }
              />
              <Route path="profile" element={<ProfilePage />} />
              <Route
                path="users"
                element={
                  <RequirePermission code="users.view">
                    <UsersPage />
                  </RequirePermission>
                }
              />
              <Route
                path="users/new"
                element={
                  <RequirePermission code="users.create">
                    <UserFormPage />
                  </RequirePermission>
                }
              />
              <Route
                path="users/:userId/edit"
                element={
                  <RequirePermission code="users.update">
                    <UserFormPage />
                  </RequirePermission>
                }
              />
              <Route
                path="items"
                element={
                  <RequirePermission code="items.manage">
                    <ManageItemsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="email"
                element={
                  <RequirePermission code="email.view">
                    <EmailPage />
                  </RequirePermission>
                }
              />
              <Route
                path="roles"
                element={
                  <RequirePermission code="roles.view">
                    <RolesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="roles/new"
                element={
                  <RequirePermission code="roles.manage">
                    <RoleCreatePage />
                  </RequirePermission>
                }
              />
              <Route
                path="roles/:roleId/permissions"
                element={
                  <RequirePermission code="roles.view">
                    <RolePermissionsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings"
                element={
                  <RequirePermission code="settings.view">
                    <SettingsHubPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/theme"
                element={
                  <RequirePermission code="settings.view">
                    <ThemeSettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/password"
                element={
                  <RequirePermission code="settings.view">
                    <PasswordSettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/branding"
                element={
                  <RequirePermission code="settings.update">
                    <BrandingSettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/currency"
                element={
                  <RequirePermission code="settings.update">
                    <CurrencySettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/notifications"
                element={
                  <RequirePermission code="settings.update">
                    <NotificationSettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/smtp"
                element={
                  <RequirePermission code="settings.smtp">
                    <SmtpSettingsPage />
                  </RequirePermission>
                }
              />
              <Route
                path="settings/templates"
                element={
                  <RequirePermission code="settings.update">
                    <TemplatesSettingsPage />
                  </RequirePermission>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BootGate>
      </BrowserRouter>
      </ConfirmProvider>
    </AppProvider>
  )
}
