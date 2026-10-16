// Sends a notification to you (NUXT_LEAD_TO_EMAIL) through Resend. Returns whether it was actually delivered;
// without NUXT_RESEND_API_KEY it just returns false, and callers log the payload so nothing is lost in dev.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function notify(opts: { subject: string; title: string; rows: [string, string][]; replyTo?: string }) {
  const cfg = useRuntimeConfig()
  if (!cfg.resendApiKey || !cfg.leadToEmail) return false
  try {
    await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.resendApiKey}` },
      timeout: 10000,
      body: {
        from: cfg.leadFromEmail,
        to: [cfg.leadToEmail],
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        subject: opts.subject,
        html: `<h2>${esc(opts.title)}</h2><table cellpadding="6">${opts.rows.map(([k, v]) => `<tr><td valign="top"><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>`,
        text: opts.rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      },
    })
    return true
  } catch (e: any) {
    console.error('[mail] send failed', e?.data ?? e?.message ?? e)
    return false
  }
}
