import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'dist')
const dest = path.join(root, 'server', 'public')

if (!fs.existsSync(src)) {
  console.error('Missing dist/ — run npm run build first')
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })
fs.cpSync(src, dest, { recursive: true })
console.log(`Copied UI → server/public`)
