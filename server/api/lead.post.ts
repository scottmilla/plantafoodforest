import type { Lead } from '../../shared/types'

// POST /api/lead: "Meet with a food forest designer".
// Emails the lead to you (see server/utils/mail.ts); always logs it too.
// Later: match leads to designers by region, size and goals (everything needed is already in the payload).

const GOAL_LABEL: Record<string, string> = {
  money: 'Money', yearRound: 'Year-round fruit', natives: 'Natives only', restoration: 'Ecological restoration / guests', rare: 'Rare fruit / zone pushing', timber: 'Timber',
}

export default defineEventHandler(async (event) => {
  const lead = await readBody<Lead>(event)
  const email = String(lead?.email ?? '').trim()
  if (!lead?.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw createError({ statusCode: 400, statusMessage: 'Name and a valid email are required' })

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

  const delivered = await notify({
    subject: `🌳 New food forest lead: ${lead.name}${s ? ` (${s.label}, zone ${s.zoneLabel})` : ''}`,
    title: 'New food forest lead',
    rows,
    replyTo: email,
  })
  return { ok: true, delivered }
})
