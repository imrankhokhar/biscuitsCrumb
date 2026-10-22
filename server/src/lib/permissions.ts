export const PERMISSIONS = [
  {
    code: 'items.view',
    name: 'View items grid',
    module: 'Items',
    description: 'See the main item catalog',
  },
  {
    code: 'items.charge',
    name: 'Charge item to payable',
    module: 'Items',
    description: 'Click an item to add its price to payable',
  },
  {
    code: 'items.manage',
    name: 'Manage items menu',
    module: 'Manage Items',
    description: 'Open Manage Items section',
  },
  {
    code: 'items.create',
    name: 'Create item',
    module: 'Manage Items',
    description: 'Add a new catalog item',
  },
  {
    code: 'items.update',
    name: 'Update item',
    module: 'Manage Items',
    description: 'Edit an existing item',
  },
  {
    code: 'items.delete',
    name: 'Delete item',
    module: 'Manage Items',
    description: 'Deactivate / remove an item',
  },
  {
    code: 'accountability.view',
    name: 'View accountability',
    module: 'Accountability',
    description: 'See profit, cost, and receivables summary',
  },
  {
    code: 'cashline.view',
    name: 'View Cashline',
    module: 'Cashline',
    description: 'Compare bank statement uploads to app payments',
  },
  {
    code: 'payables.view',
    name: 'View payables',
    module: 'Payables',
    description: 'Open Payables section',
  },
  {
    code: 'payables.pay',
    name: 'Record payments',
    module: 'Payables',
    description: 'Mark paid or apply partial payment',
  },
  {
    code: 'users.view',
    name: 'View users',
    module: 'Users',
    description: 'Open Users section',
  },
  {
    code: 'users.create',
    name: 'Create users',
    module: 'Users',
    description: 'Add new users',
  },
  {
    code: 'users.update',
    name: 'Update users',
    module: 'Users',
    description: 'Edit users and toggle active',
  },
  {
    code: 'users.delete',
    name: 'Delete users',
    module: 'Users',
    description: 'Delete user accounts',
  },
  {
    code: 'notifications.view',
    name: 'View notifications',
    module: 'Notifications',
    description: 'Open Notifications section',
  },
  {
    code: 'email.view',
    name: 'View email module',
    module: 'Email',
    description: 'Open Email section',
  },
  {
    code: 'email.send',
    name: 'Send email',
    module: 'Email',
    description: 'Send emails to users',
  },
  {
    code: 'settings.view',
    name: 'View settings',
    module: 'Settings',
    description: 'Open Settings section',
  },
  {
    code: 'settings.update',
    name: 'Update settings',
    module: 'Settings',
    description: 'Change branding, currency, sound, templates',
  },
  {
    code: 'settings.smtp',
    name: 'Manage SMTP',
    module: 'Settings',
    description: 'Configure SMTP credentials',
  },
  {
    code: 'roles.view',
    name: 'View roles & permissions',
    module: 'Roles & Permissions',
    description: 'Open Roles & Permissions section',
  },
  {
    code: 'roles.manage',
    name: 'Manage role permissions',
    module: 'Roles & Permissions',
    description: 'Assign permissions to roles',
  },
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]['code']

export const ADMIN_PERMISSIONS = PERMISSIONS.map((p) => p.code)

export const USER_PERMISSIONS: PermissionCode[] = [
  'items.view',
  'items.charge',
  'notifications.view',
  'settings.view',
]
