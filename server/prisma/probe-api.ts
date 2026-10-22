import 'dotenv/config'

const base = 'http://localhost:4000'

async function main() {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@excelorithm.com', password: 'admin123' }),
  })
  const loginBody = await loginRes.text()
  console.log('LOGIN', loginRes.status, loginBody.slice(0, 300))
  const cookie = loginRes.headers.getSetCookie?.()?.join('; ') ?? loginRes.headers.get('set-cookie') ?? ''

  for (const path of ['/api/settings', '/api/items', '/api/payables/me', '/api/notifications', '/api/settings/public']) {
    const r = await fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie.split(',')[0] } : {} })
    const t = await r.text()
    console.log(path, r.status, t.slice(0, 200))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
