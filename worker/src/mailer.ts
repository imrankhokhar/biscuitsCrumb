import type { PrismaClient } from './prisma.js'
import { getAppSetting } from './util.js'

/**
 * Same interface as server/src/lib/mailer.ts. Workers can't open raw SMTP/TCP connections through nodemailer,
 * so when SMTP is configured we return a clear error (the email log row is stored as `failed`).
 * Unconfigured SMTP keeps the dev fallback (log + ok).
 * ponytail: to really send from the Worker, swap the body of the `if` for a fetch() to an HTTP mail API
 * (Resend/Postmark/SES/Mailgun) — the signature and callers stay the same.
 */
export async function sendMail(
  prisma: PrismaClient,
  opts: { to: string; subject: string; text: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await getAppSetting(prisma)
  const from = settings.smtpFrom || 'Excelorithm Vending <noreply@excelorithm.com>'

  if (!settings.smtpHost.trim() || !settings.smtpUser.trim() || !settings.smtpPass.trim()) {
    console.log('[email:dev-fallback]', { from, ...opts })
    return { ok: true }
  }
  return {
    ok: false,
    error:
      'SMTP is not available on Cloudflare Workers (no raw TCP via nodemailer). Clear the SMTP settings for log-only mode, or wire an HTTP mail API in worker/src/mailer.ts.',
  }
}
