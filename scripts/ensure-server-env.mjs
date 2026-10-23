import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')
const envPath = path.join(serverDir, '.env')
const examplePath = path.join(serverDir, '.env.example')

const defaults = `PORT=4000
NODE_ENV=development
JWT_SECRET=change-me-to-a-long-random-string
FORCE_SQLITE=1
DATABASE_URL="file:./dev.db"
CLIENT_ORIGIN=true
COOKIE_SECURE=false
`

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath)
    console.log('Created server/.env from .env.example')
  } else {
    fs.writeFileSync(envPath, defaults, 'utf8')
    console.log('Created server/.env with SQLite defaults')
  }
}

let text = fs.readFileSync(envPath, 'utf8')
if (!/^\s*DATABASE_URL\s*=/m.test(text)) {
  text += `\nDATABASE_URL="file:./dev.db"\n`
  fs.writeFileSync(envPath, text, 'utf8')
  console.log('Added DATABASE_URL to server/.env')
}
if (!/^\s*FORCE_SQLITE\s*=/m.test(text)) {
  text = fs.readFileSync(envPath, 'utf8')
  text += `\nFORCE_SQLITE=1\n`
  fs.writeFileSync(envPath, text, 'utf8')
}
