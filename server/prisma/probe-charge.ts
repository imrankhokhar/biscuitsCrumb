import 'dotenv/config'

const base = 'http://localhost:4000'

async function main() {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@excelorithm.com', password: 'admin123' }),
  })
  const setCookie = loginRes.headers.getSetCookie?.() ?? []
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ')

  const items = await (await fetch(`${base}/api/items`, { headers: { Cookie: cookie } })).json()
  const item = items.items[0]
  console.log('item', item?.title)

  const chargeRes = await fetch(`${base}/api/items/${item.id}/charge`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  const chargeBody = await chargeRes.text()
  console.log('CHARGE', chargeRes.status, chargeBody.slice(0, 250))
  const chargeId = JSON.parse(chargeBody).chargeId

  const undoRes = await fetch(`${base}/api/items/charges/${chargeId}/undo`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  console.log('UNDO', undoRes.status, (await undoRes.text()).slice(0, 250))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
