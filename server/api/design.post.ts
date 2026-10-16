import type { DesignRequest, Goal, OverrideMap } from '../../shared/types'
import { design } from '../model/engine'

// POST /api/design: the in-house model's endpoint. Body: { site, areaM2, goals: [goal1, goal2] }
const GOALS: Goal[] = ['money', 'yearRound', 'natives', 'restoration', 'rare', 'timber']

export default defineEventHandler(async (event) => {
  const body = await readBody<DesignRequest>(event)
  if (!body?.site || typeof body.site.zone !== 'number') throw createError({ statusCode: 400, statusMessage: 'site is required' })
  const goals = (body.goals ?? []).filter((g) => GOALS.includes(g)).slice(0, 2)
  const areaM2 = Math.min(Math.max(Number(body.areaM2) || 400, 50), 4_000_000)
  // only plain id strings, a handful per design
  const overrides: OverrideMap = {}
  for (const [k, v] of Object.entries(body.overrides ?? {}).slice(0, 3)) {
    const ids = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && x.length < 40).slice(0, 80) : [])
    overrides[k] = { add: ids(v?.add), remove: ids(v?.remove) }
  }
  return design({ site: body.site, areaM2, goals, overrides })
})
