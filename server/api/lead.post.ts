import type { Lead } from '../../shared/types'

// POST /api/lead: "Meet with a food forest designer".
// Emails the lead through Resend when NUXT_RESEND_API_KEY + NUXT_LEAD_TO_EMAIL are set; always logs it too.
// Later: match leads to designers by region, size and goals (everything needed is already in the payload).

const GOAL_LABEL: Record<string, string> = {
  money: 'Money', yearRound: 'Year-round fruit', natives: 'Natives only', restoration: 'Ecological restoration / guests', rare: 'Rare fruit / zone pushing', timber: 'Timber',
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export default defineEventHandler(async (event) => {
  const lead = await readBody<Lead>(event)
  const email = String(lead?.email ?? '').trim()
  if (!lead?.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'Name and a valid email are required' })

  const cfg = useRuntimeConfig()
  const acres = lead.areaM2 ? (lead.areaM2 / 4046.86).toFixed(2) : '?'
  const s = lead.site
  const rows: [string, string][] = [
    ['Name', lead.name], ['Email', email], ['Phone', lead.phone || '—'],
    ['Location', s ? `${s.label} (${s.country}) · ${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}` : '—'],
    ['Climate', s ? `Zone ${s.zoneLabel} · ${s.climate} · ${s.precipMm} mm/yr · ${s.frostFreeDays} frost-free days` : '—'],
    ['Land', `${acres} acres (${Math.round(lead.areaM2 ?? 0)} m²)`],
    ['Goals', lead.goals.map((g, i) => `${i + 1}. ${GOAL_LABEL[g] ?? g}`).join('  ')],
    ['Liked design', lead.designName || '—'],
    ['Fruit & plants', lead.designSpecies?.length ? lead.designSpecies.join(', ') : '—'],
    ['Message', lead.message || '—'],
  ]
  console.info('[lead]', JSON.stringify({ ...lead, at: new Date().toISOString() }))

  if (!cfg.resendApiKey || !cfg.leadToEmail) return { ok: true, delivered: false }
  try {
    await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.resendApiKey}` },
      body: {
        from: cfg.leadFromEmail,
        to: [cfg.leadToEmail],
        reply_to: email,
        subject: `🌳 New food forest lead: ${lead.name}${s ? ` (${s.label}, zone ${s.zoneLabel})` : ''}`,
        html: `<h2>New food forest lead</h2><table cellpadding="6">${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>`,
        text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      },
    })
    return { ok: true, delivered: true }
  } catch (e: any) {
    console.error('[lead] email failed', e?.data ?? e)
    return { ok: true, delivered: false }
  }
})
