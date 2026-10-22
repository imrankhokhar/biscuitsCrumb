import nodemailer from 'nodemailer'
import { getAppSetting } from './settings.js'

export async function sendMail(opts: {
  to: string
  subject: string
  text: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await getAppSetting()
  const host = settings.smtpHost.trim()
  const user = settings.smtpUser.trim()
  const pass = settings.smtpPass.trim()
  const from = settings.smtpFrom || 'Excelorithm Vending <noreply@excelorithm.com>'

  if (!host || !user || !pass) {
    console.log('[email:dev-fallback]', { from, ...opts })
    return { ok: true }
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure,
      auth: { user, pass },
    })
    await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return { ok: false, error: message }
  }
}
