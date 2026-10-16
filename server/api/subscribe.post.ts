import type { SaveSubmission } from '../../shared/types'
import { normEmail, validate } from '../lib/validate'

// POST /api/subscribe: called when someone saves a forest. Emails you "New subscriber" with their address and what they built.
// Your inbox is the list (search "New subscriber"). Opt-in is stated in each email so you know who agreed to hear from you.
// Best-effort per-instance rate limit; on serverless each instance has its own counter, still enough to blunt casual abuse.
const hits = new Map<string, { n: number; t: number }>()
const WINDOW = 60 * 60 * 1000
const MAX = 12

const GOAL: Record<string, string> = { money: 'Money', yearRound: 'Year-round fruit', natives: 'Natives only', restoration: 'Ecological restoration / guests', rare: 'Rare fruit / zone pushing', timber: 'Timber' }

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.t > WINDOW) hits.set(ip, { n: 1, t: now })
  else if (++h.n > MAX) throw createError({ statusCode: 429, statusMessage: 'Too many saves. Please try again later.' })
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > WINDOW) hits.delete(k)

  const body = await readBody<SaveSubmission>(event)
  const problem = validate(body ?? {})
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })
  if (JSON.stringify(body).length > 30_000) throw createError({ statusCode: 413, statusMessage: 'That forest is too large to save.' })

  const email = normEmail(body.email)
  const s = body.site
  const optIn = !!body.marketingOptIn
  const rows: [string, string][] = [
    ['Email', email],
    ['Wants tips & updates', optIn ? 'YES, opted in' : 'No (saved a forest only)'],
    ['Forest', String(body.name ?? '').slice(0, 80) || 'My forest'],
    ['Location', `${s.label} (${s.country})`],
    ['Climate', `Zone ${s.zoneLabel} · ${s.climate}`],
    ['Land', `${(body.areaM2 / 4046.86).toFixed(2)} acres (${Math.round(body.areaM2)} m²)`],
    ['Goals', body.goals.map((g, i) => `${i + 1}. ${GOAL[g] ?? g}`).join('  ')],
    ['Design', body.designName || '—'],
    ['Fruit & plants', body.designSpecies?.length ? body.designSpecies.slice(0, 60).join(', ') : '—'],
  ]
  console.info('[subscriber]', JSON.stringify({ email, optIn, place: s.label, goals: body.goals, at: new Date().toISOString() }))
  const delivered = await notify({ subject: `🌱 New subscriber: ${email}${optIn ? ' (opted in)' : ''}`, title: 'New subscriber', rows, replyTo: email })
  return { ok: true, delivered }
})
