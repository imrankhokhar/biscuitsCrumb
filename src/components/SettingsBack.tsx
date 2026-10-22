import { Breadcrumb } from './Breadcrumb'

export function SettingsBack({ current }: { current: string }) {
  return (
    <Breadcrumb
      items={[
        { label: 'Settings', to: '/settings' },
        { label: current },
      ]}
    />
  )
}
