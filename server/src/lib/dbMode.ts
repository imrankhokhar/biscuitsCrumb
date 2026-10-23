/** TeamTask-style DB pick: D1 when Cloudflare creds exist, else SQLite. */

export type DbMode = 'sqlite' | 'd1'

export type D1HttpEnv = {
  CLOUDFLARE_ACCOUNT_ID: string
  CLOUDFLARE_DATABASE_ID: string
  CLOUDFLARE_D1_TOKEN: string
}

export function getD1HttpEnv(): D1HttpEnv | null {
  if (process.env.FORCE_SQLITE === '1' || process.env.BISCUITS_FORCE_SQLITE === '1') {
    return null
  }
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    ''
  ).trim()
  const databaseId = (
    process.env.CLOUDFLARE_DATABASE_ID ||
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.CF_D1_DATABASE_ID ||
    process.env.D1_DATABASE_ID ||
    ''
  ).trim()
  const token = (
    process.env.CLOUDFLARE_D1_TOKEN ||
    process.env.CLOUDFLARE_D1_API_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    ''
  ).trim()

  if (accountId && databaseId && token) {
    return {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_DATABASE_ID: databaseId,
      CLOUDFLARE_D1_TOKEN: token,
    }
  }
  return null
}

export function resolveDbMode(): DbMode {
  return getD1HttpEnv() ? 'd1' : 'sqlite'
}
