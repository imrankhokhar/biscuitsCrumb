# Excelorithm Vending Machine

React + Express/Prisma (SQLite). Permission-based menus, image upload, SMTP & theme in Settings.

## Run

```bash
npm install
npm run setup:server   # once

npm run dev:server     # API :4000
npm run dev            # UI  :5173
```

## Accounts

- Admin: `admin@excelorithm.com` / `admin123`
- Users: Sign up at `/signup`

## What’s new

1. **Right-side menu** — links shown only if the role has that permission  
2. **Roles & Permissions** — `Permission` + `RolePermission` tables; assign per menu/action  
3. **Item images** — upload from device (stored under `server/uploads`)  
4. **SMTP in Settings** — saved on `Setting` table; used by Email  
5. **Light/Dark theme** — per-user `themePreference` in Settings  

## Permission codes (examples)

`items.view`, `items.charge`, `items.manage`, `items.create`, `items.update`, `items.delete`,  
`payables.view`, `payables.pay`, `email.view`, `email.send`,  
`settings.view`, `settings.update`, `settings.smtp`, `roles.view`, `roles.manage`
