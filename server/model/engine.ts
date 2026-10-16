import type {
  CatalogItem, Design, DesignRequest, DesignResponse, DesignSpecies, DesignStats, Feature, Goal, Overrides, Placement, PlantSpec, Site, Strata, Variety,
} from '../../shared/types'
import { SPECIES, type Species } from './species'

// "Syntropic Sage": the in-house design model. A transparent, rule-and-score model rather than a neural net:
//   1. filter the knowledge base by climate (zone, heat, chill, drought)
//   2. score every species against the ranked goals
//   3. fill each syntropic stratum with a pool of species (by score, or by harvest-calendar coverage)
//   4. lay those pools out along tree lines (or contour lines) at strata-specific spacings
//   5. project yields over time and explain the choices
// Same input → same output, so designs are reproducible and debuggable. Swap any step for a learned one later.
export const MODEL = 'syntropic-sage v0.2'

const MAX_RENDER_M2 = 20000 // ≈ 5 acres; bigger farms render a representative block and scale the stats

type Weights = Partial<Record<Goal, number>>

interface Cand {
  s: Species
  native: boolean
  marginal: boolean
  dryPenalty: number
}

interface Rect { x0: number; x1: number; z0: number; z1: number }

interface Slot {
  pool: Cand[]
  step: number
  offset: number
  side: number // metres off the line centre so neighbours in different strata don't collide
  strata: Strata | 'support'
}

const ARCH: Record<Goal, { name: string; tagline: string }> = {
  money: { name: 'Market Alley', tagline: 'Two money crops, wide tractor alleys, pollarded support trees.' },
  yearRound: { name: 'Twelve-Month Larder', tagline: 'Staggered varieties so something ripens every season.' },
  natives: { name: 'Native Tapestry', tagline: 'Only plants that belong here, woven through every stratum.' },
  restoration: { name: 'Living Watershed', tagline: 'Contour lines, a pond and swales: built for life and for guests.' },
  rare: { name: 'Edge of the Zone', tagline: 'Collector fruit and marginal hardies, stacked for a long season.' },
  timber: { name: 'Timber Succession', tagline: 'Fast support species training slow hardwoods straight and tall.' },
}

const FOOD_ROLES = ['fruit', 'berry', 'nut', 'staple'] as const
const isFood = (s: Species) => s.kg > 0 && s.ytf > 0 && s.roles.some((r) => (FOOD_ROLES as readonly string[]).includes(r))
const isSupportOnly = (s: Species) => (s.roles.includes('support') || s.pollard) && !isFood(s) && !s.roles.includes('timber')

// ─── helpers ────────────────────────────────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shift = (m: number, south: boolean) => (south ? ((m + 5) % 12) + 1 : m)
const shiftWin = (h: [number, number], south: boolean): [number, number] => [shift(h[0], south), shift(h[1], south)]
export function monthsOf(h?: [number, number]) {
  if (!h) return []
  const out: number[] = []
  for (let m = h[0], i = 0; i < 12; i++) {
    out.push(m)
    if (m === h[1]) break
    m = (m % 12) + 1
  }
  return out
}
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── 1. climate filter ──────────────────────────────────────────────────────
function candidates(site: Site, push: number): Cand[] {
  const dry = site.climate === 'arid' || site.dryMonths >= 5
  return SPECIES.flatMap((s) => {
    if (s.zMin > site.zone + push) return []
    if (site.zone > s.zMax + 0.5) return []
    if (s.chill && site.chillHours < s.chill * 0.6) return []
    if (site.climate === 'tropical' && s.chill && s.chill > 150) return []
    return [{ s, native: s.natives.includes(site.region), marginal: s.zMin > site.zone - 0.5, dryPenalty: dry && !s.dry ? 0.6 : 0 }]
  })
}

// ─── 2. goal scoring ────────────────────────────────────────────────────────
function goalScore(c: Cand, g: Goal): number {
  const s = c.s
  const food = isFood(s)
  const value = food ? Math.log1p((s.price ?? 2) * s.kg) : 0
  const has = (r: string) => (s.roles as string[]).includes(r)
  switch (g) {
    case 'money':
      return food ? value / (1 + s.ytf * 0.2) + (s.ytf <= 3 ? 0.6 : 0) - (s.rare ? 0.8 : 0) : 0
    case 'yearRound':
      return food ? 1.6 + value * 0.25 + (has('fruit') || has('berry') ? 0.6 : 0) : 0
    case 'natives':
      return c.native ? 3 : -2
    case 'restoration':
      return (c.native ? 1.6 : 0) + (has('wildlife') ? 1 : 0) + (has('flower') ? 0.6 : 0) + (has('nfix') ? 0.8 : 0) + (has('biomass') ? 0.4 : 0) + (s.invasive ? 0.3 : 0) + (food ? 0.5 : 0)
    case 'rare':
      return food ? 0.8 + (s.rare ? 1.6 : 0) + (c.marginal ? 1.8 : 0) + value * 0.15 : 0
    case 'timber':
      return (has('timber') ? 2.5 : 0) + (has('nut') ? 0.4 : 0) + (has('support') ? 0.4 : 0)
  }
}
function score(c: Cand, w: Weights) {
  let t = 0
  for (const [g, wt] of Object.entries(w) as [Goal, number][]) t += wt * goalScore(c, g)
  // marginal species are a gamble unless the person asked for zone pushing
  if (c.marginal && !(w.rare && w.rare >= 0.5)) t -= 1.2
  if (c.s.invasive && !w.restoration) t -= 1.5
  return t - c.dryPenalty
}

// ─── 3. pool selection ──────────────────────────────────────────────────────
function speciesMonths(c: Cand, south: boolean) {
  const vs = c.s.varieties?.length ? c.s.varieties.map((v) => v.harvest) : c.s.harvest ? [c.s.harvest] : []
  return new Set(vs.flatMap((h) => monthsOf(shiftWin(h, south))))
}

function pickPool(cands: Cand[], k: number, w: Weights, mode: 'score' | 'season', south: boolean, covered = new Set<number>()) {
  const ranked = cands.map((c) => ({ c, sc: score(c, w) })).filter((r) => r.sc > 0).sort((a, b) => b.sc - a.sc)
  if (mode === 'score') return ranked.slice(0, k).map((r) => r.c)
  const out: Cand[] = []
  const left = [...ranked]
  while (out.length < k && left.length) {
    let best = 0
    let bestVal = -Infinity
    left.forEach((r, i) => {
      const fresh = [...speciesMonths(r.c, south)].filter((m) => !covered.has(m)).length
      const v = r.sc * 0.5 + fresh * 0.7
      if (v > bestVal) { bestVal = v; best = i }
    })
    const [r] = left.splice(best, 1)
    out.push(r!.c)
    speciesMonths(r!.c, south).forEach((m) => covered.add(m))
  }
  return out
}

function allowedStrata(site: Site, area: number, arch: Goal): Strata[] {
  const backyard = area < 800
  const all: Strata[] = ['emergent', 'high', 'medium', 'low', 'ground']
  let s: Strata[]
  if (site.climate === 'tropical' || site.zone >= 10.5) s = all
  else if (site.zone >= 8.5) s = area >= 4000 ? all : ['high', 'medium', 'low', 'ground']
  else if (site.zone >= 6) s = area >= 8000 ? all : ['high', 'medium', 'low', 'ground']
  else s = area >= 4000 ? ['high', 'medium', 'low', 'ground'] : ['medium', 'low', 'ground']
  if ((arch === 'timber' || arch === 'natives' || arch === 'restoration') && !s.includes('emergent')) s = ['emergent', ...s]
  if (backyard) s = s.filter((x) => x !== 'emergent')
  return s
}

function chooseVarieties(s: Species, arch: Goal, south: boolean): Variety[] {
  const vs = (s.varieties ?? []).map((v) => ({ name: v.name, harvest: shiftWin(v.harvest, south) }))
  if (!vs.length) return []
  if (arch === 'money') return vs.slice(0, 1)
  if (arch === 'yearRound' || arch === 'rare') return vs.slice(0, 5)
  return vs.slice(0, 2)
}

// ─── 4. layout ──────────────────────────────────────────────────────────────
interface LayoutOut { placed: { c: Cand; x: number; z: number; strata: Slot['strata'] }[]; features: Feature[] }

function lineLayout(rect: Rect, lineSpacing: number, slots: Slot[], seed: number, curve?: { amp: number; freq: number }, avoid?: (x: number, z: number) => boolean): LayoutOut {
  const r = rng(seed)
  const placed: LayoutOut['placed'] = []
  const width = rect.x1 - rect.x0
  const nLines = Math.max(1, Math.floor(width / lineSpacing))
  const pad = (width - (nLines - 1) * lineSpacing) / 2
  const features: Feature[] = []
  for (let li = 0; li < nLines; li++) {
    const lx = rect.x0 + pad + li * lineSpacing
    const bed: [number, number][] = []
    for (let z = rect.z0 + 0.3; z <= rect.z1 - 0.3 + 1e-6; z += curve ? 2 : rect.z1 - rect.z0 - 0.6) bed.push([lx + (curve ? curve.amp * Math.sin(z * curve.freq + li * 0.35) : 0), z])
    features.push({ kind: 'bed', x: 0, z: 0, points: bed })
    for (const slot of slots) {
      if (!slot.pool.length) continue
      let k = li // rotate the pool line-to-line so neighbouring lines don't mirror each other
      for (let z = rect.z0 + 0.6 + slot.offset; z < rect.z1 - 0.6; z += slot.step) {
        const bend = curve ? curve.amp * Math.sin(z * curve.freq + li * 0.35) : 0
        const side = slot.side * (slot.strata === 'ground' ? (k % 2 ? 1 : -1) : 1)
        const x = lx + bend + side + (r() - 0.5) * 0.25
        const zz = z + (r() - 0.5) * 0.25
        if (x < rect.x0 + 0.3 || x > rect.x1 - 0.3) { k++; continue }
        if (avoid?.(x, zz)) { k++; continue }
        placed.push({ c: slot.pool[k % slot.pool.length]!, x, z: zz, strata: slot.strata })
        k++
      }
    }
  }
  return { placed, features }
}

interface Plan {
  arch: Goal
  weights: Weights
  rect: Rect
  seed: number
  ov?: Overrides // the user's fruit-picker edits for this design
}

function planBlock(p: Plan, site: Site, area: number, cands: Cand[], notes: string[]): LayoutOut & { lineSpacing: number; inRow: number; tractor: boolean; contour: boolean } {
  const { arch, weights: w, rect } = p
  const south = site.hemisphere === 'S'
  const big = area > 5000
  const natives = (w.natives ?? 0) >= 1
  const ov = p.ov ?? { add: [], remove: [] }
  const removed = new Set(ov.remove)
  // Market Alley has one slot per crop, so a removed crop is replaced by the next best; every other design just loses it
  const base = natives ? cands.filter((c) => c.native) : cands
  const pool = arch === 'money' ? base.filter((c) => !removed.has(c.s.id)) : base
  const added = cands.filter((c) => ov.add.includes(c.s.id) && !removed.has(c.s.id) && (!natives || c.native))
  const food = pool.filter((c) => isFood(c.s))
  const byStrata = (st: Strata, list = pool) => list.filter((c) => c.s.strata === st && !isSupportOnly(c.s) && !c.s.pollard && c.s.form !== 'herb')
  const strata = allowedStrata(site, area, arch)

  // support trees are judged on their job (nitrogen, biomass, taking a pollard), not on their fruit
  const supportScore = (c: Cand) => (c.s.roles.includes('nfix') ? 1.2 : 0) + (c.s.pollard ? 1 : 0) + (c.s.roles.includes('biomass') ? 0.6 : 0) + (c.native ? 0.5 + (w.natives ?? 0) : 0) - (c.s.invasive && !w.restoration ? 2 : 0) - c.dryPenalty
  const support = pool
    .filter((c) => (isSupportOnly(c.s) || (c.s.pollard && c.s.roles.includes('support'))) && (arch !== 'money' || c.s.pollard))
    .sort((a, b) => supportScore(b) - supportScore(a))
    .slice(0, arch === 'money' ? 1 : 2)
  const groundCands = pool.filter((c) => c.s.form === 'herb')
  const ground = arch === 'money'
    ? pickPool(groundCands.filter((c) => !isFood(c.s)), 1, { restoration: 1 }, 'score', south)
    : pickPool(groundCands, arch === 'timber' ? 1 : 3, { ...w, yearRound: (w.yearRound ?? 0) + 0.3, restoration: (w.restoration ?? 0) + 0.3 }, 'score', south)
  const supportNames = support.map((c) => c.s.name.toLowerCase()).join(' and ')

  // ── Market Alley: one target tree + one berry, pollarded support, wide alleys ──
  if (arch === 'money') {
    const treeC = food.filter((c) => ['medium', 'high'].includes(c.s.strata) && c.s.ytf <= 5 && c.s.form !== 'vine' && c.s.form !== 'shrub' && !c.s.pollard && c.s.succession !== 'placenta')
    const berryC = food.filter((c) => ['low', 'medium'].includes(c.s.strata) && c.s.ytf <= 3 && c.s.roles.includes('berry'))
    const tree = pickPool(treeC, 1, w, 'score', south)
    const berry = pickPool(berryC.filter((c) => c.s.id !== tree[0]?.s.id), 1, w, 'score', south)
    const known = (arr: Cand[], c: Cand) => arr.some((x) => x.s.id === c.s.id)
    for (const c of added) {
      if (known(tree, c) || known(berry, c) || known(ground, c)) continue
      if (c.s.form === 'herb' || c.s.strata === 'ground') ground.push(c)
      else if (c.s.strata === 'low' || c.s.form === 'shrub' || c.s.form === 'vine') berry.push(c)
      else tree.push(c)
    }
    const tw = tree[0]?.s.w ?? 4
    const treeStep = Math.max(4, tw * 1.1)
    const lineSpacing = Math.min(12, Math.max(8, tw + 4.5))
    const slots: Slot[] = [
      { pool: tree, step: treeStep, offset: 0, side: 0, strata: tree[0]?.s.strata ?? 'medium' },
      { pool: berry, step: 1.25, offset: 0.625, side: 0.35, strata: 'low' },
      { pool: support, step: treeStep * 2, offset: treeStep / 2, side: -0.3, strata: 'support' },
      { pool: ground, step: big ? 3 : 2, offset: 1, side: 0.9, strata: 'ground' },
    ]
    if (tree[0] && berry[0]) notes.push(`Target crops: ${tree[0].s.name} (first harvest ~year ${tree[0].s.ytf}) carried by ${berry[0].s.name} from year ${berry[0].s.ytf}.`)
    notes.push(`Lines ${lineSpacing.toFixed(0)} m apart so a compact tractor and mower fit down every alley.`)
    if (support[0]) notes.push(`${support[0].s.name} is pollarded between the crop trees: nitrogen and mulch without shading the money.`)
    return { ...lineLayout(rect, lineSpacing, slots, p.seed), lineSpacing, inRow: treeStep, tractor: true, contour: false }
  }

  // ── Syntropic consortium lines for every other archetype ──
  const k = arch === 'yearRound' || arch === 'rare' ? { emergent: 2, high: 4, medium: 6, low: 5 } : arch === 'natives' ? { emergent: 3, high: 3, medium: 4, low: 4 } : arch === 'timber' ? { emergent: 3, high: 2, medium: 2, low: 2 } : { emergent: 2, high: 3, medium: 4, low: 4 }
  const mode = arch === 'yearRound' || arch === 'rare' ? 'season' : 'score'
  const timberW: Weights = arch === 'timber' ? { ...w, timber: 2 } : w
  const covered = new Set<number>()
  const pools: Partial<Record<Strata, Cand[]>> = {}
  for (const st of ['low', 'medium', 'high', 'emergent'] as Strata[]) {
    if (!strata.includes(st)) continue
    const list = byStrata(st)
    pools[st] = pickPool(arch === 'timber' && (st === 'emergent' || st === 'high') ? list : list, k[st as keyof typeof k], st === 'emergent' || st === 'high' ? timberW : w, mode, south, covered)
  }
  // make sure an early-bearing crop is in the mix so the system pays something back in years 1–2
  if (arch !== 'timber') {
    const early = pickPool(food.filter((c) => c.s.ytf <= 2 && strata.includes(c.s.strata) && c.s.form !== 'herb' && !Object.values(pools).flat().some((p) => p!.s.id === c.s.id)), 1, w, 'score', south)
    if (early[0] && !Object.values(pools).flat().some((p) => p!.s.ytf <= 2)) (pools[early[0].s.strata] ??= []).push(early[0])
  }

  // fruit-picker edits: removals just drop the species (no backfill); additions slot into the stratum they belong to
  const dropRemoved = (arr: Cand[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (removed.has(arr[i]!.s.id)) arr.splice(i, 1)
  }
  for (const list of Object.values(pools)) dropRemoved(list!)
  dropRemoved(ground)
  const order: Strata[] = ['emergent', 'high', 'medium', 'low']
  const open = order.filter((x) => strata.includes(x))
  for (const c of added) {
    if (Object.values(pools).some((l) => l!.some((x) => x.s.id === c.s.id)) || ground.some((x) => x.s.id === c.s.id)) continue
    if (c.s.form === 'herb' || c.s.strata === 'ground') { ground.push(c); continue }
    const at = open.includes(c.s.strata) ? c.s.strata : (open.find((x) => order.indexOf(x) >= order.indexOf(c.s.strata)) ?? open[open.length - 1] ?? 'medium')
    ;(pools[at] ??= []).push(c)
  }

  const mult = { yearRound: 0.8, rare: 0.85, natives: 1, restoration: 1.1, timber: 1.3 }[arch]
  const lineSpacing = { yearRound: 4.5, rare: 4.5, natives: 5, restoration: 6, timber: 6 }[arch] * (big ? 1.15 : 1)
  const slots: Slot[] = [
    { pool: pools.emergent ?? [], step: 16 * mult, offset: 8 * mult, side: 0, strata: 'emergent' },
    { pool: pools.high ?? [], step: 8 * mult, offset: 4 * mult, side: 0, strata: 'high' },
    { pool: pools.medium ?? [], step: 4 * mult, offset: 2 * mult, side: 0.3, strata: 'medium' },
    { pool: pools.low ?? [], step: 2 * mult, offset: 1 * mult, side: -0.45, strata: 'low' },
    { pool: support, step: 4 * mult, offset: 0.4, side: 0.55, strata: 'support' },
    { pool: ground, step: big ? 2 : 1, offset: 0.5, side: 0.95, strata: 'ground' },
  ]

  let out: LayoutOut
  let contour = false
  if (arch === 'restoration') {
    contour = true
    const w0 = rect.x1 - rect.x0
    const d0 = rect.z1 - rect.z0
    const pondR = Math.max(3, Math.min(16, Math.sqrt(w0 * d0) * 0.11))
    const pond = { x: rect.x0 + w0 * 0.25, z: rect.z0 + d0 * 0.28 }
    const pathPts: [number, number][] = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      return [rect.x0 + w0 * (0.1 + 0.8 * t), rect.z0 + d0 * (0.85 - 0.6 * t) + Math.sin(t * 7) * d0 * 0.07]
    })
    const nearPath = (x: number, z: number) => pathPts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.6)
    const curve = { amp: Math.min(6, lineSpacing * 0.8), freq: 0.09 }
    out = lineLayout(rect, lineSpacing, slots, p.seed, curve, (x, z) => Math.hypot(x - pond.x, z - pond.z) < pondR + 2.2 || nearPath(x, z))
    out.features.push({ kind: 'pond', x: pond.x, z: pond.z, r: pondR }, { kind: 'path', x: 0, z: 0, points: pathPts })
    // swales sit just upslope of every other line, following the same contour
    const nLines = Math.max(1, Math.floor(w0 / lineSpacing))
    const pad = (w0 - (nLines - 1) * lineSpacing) / 2
    for (let li = 0; li < nLines; li += 2) {
      const lx = rect.x0 + pad + li * lineSpacing - lineSpacing * 0.45
      const pts: [number, number][] = []
      for (let z = rect.z0 + 1; z <= rect.z1 - 1; z += 2) pts.push([lx + curve.amp * Math.sin(z * curve.freq + li * 0.35), z])
      out.features.push({ kind: 'swale', x: 0, z: 0, points: pts })
    }
    notes.push(`Tree lines bend along the contour with swales just upslope, so rain is slowed, spread and sunk into the soil.`)
    notes.push(`A ${Math.round(pondR * 2)} m pond anchors the water cycle and the wildlife; a winding guest path threads through.`)
    if (support.some((c) => c.s.invasive)) notes.push(`Includes vigorous pioneer${support.filter((c) => c.s.invasive).length > 1 ? 's' : ''} that rebuild soil fast. Check local invasive-species rules first.`)
  } else {
    out = lineLayout(rect, lineSpacing, slots, p.seed)
  }

  const used = strata.filter((s) => s === 'ground' ? ground.length : (pools[s]?.length ?? 0) > 0)
  const lat = Math.abs(site.lat)
  notes.push(`${used.length} strata stacked at ${lat.toFixed(0)}° from the equator${used.length < 5 ? '. Closer to the tropics a line can carry more layers.' : '. In the tropics every layer is in play.'}`)
  if (supportNames) notes.push(`Support species (${supportNames}) are pruned hard to feed the soil and signal the fruit trees to grow.`)
  if (arch === 'natives') {
    const n = new Set(out.placed.map((p) => p.c.s.id)).size
    notes.push(`${n} species native to your region. Nuts, fruit, timber and flowers in one tapestry.`)
    if (n < 6) notes.push('Our native list for your region is still thin, so a designer will widen it with local nursery stock.')
  }
  if (arch === 'rare') {
    const marg = [...new Set(out.placed.filter((p) => p.c.marginal && isFood(p.c.s)).map((p) => p.c.s.name))]
    if (marg.length) notes.push(`Zone-pushers: ${marg.slice(0, 5).join(', ')}. Site them on south-facing walls, by water or in the lee of evergreens.`)
  }
  if (arch === 'timber') {
    const tim = [...new Set(out.placed.filter((p) => p.c.s.roles.includes('timber') && !p.c.s.pollard).map((p) => p.c.s.name))]
    notes.push(`Hardwoods (${tim.slice(0, 4).join(', ')}) are trained straight by fast neighbours; first thinning around year 8, sawlogs from year 25–40.`)
  }
  return { ...out, lineSpacing, inRow: 2 * mult, tractor: false, contour }
}

// ─── 5. stats ───────────────────────────────────────────────────────────────
export function yieldAt(s: Pick<PlantSpec, 'yearsToFruit' | 'yieldKg' | 'lifespanYears'>, year: number) {
  if (!s.yearsToFruit || !s.yieldKg || year < s.yearsToFruit || year > s.lifespanYears + 0.5) return 0
  return s.yieldKg * Math.min(1, (year - s.yearsToFruit + 1) / (s.yearsToFruit + 2))
}

function stats(species: DesignSpecies[], plants: Placement[], scale: number, lineSpacing: number, inRow: number): DesignStats {
  const strataMix: Record<Strata, number> = { emergent: 0, high: 0, medium: 0, low: 0, ground: 0 }
  const counts = species.map(() => 0)
  for (const p of plants) counts[p.s]!++
  species.forEach((s, i) => (strataMix[s.strata] += Math.round(counts[i]! * scale)))
  const harvestMonths = Array.from({ length: 12 }, () => 0)
  for (const s of species) {
    if (!s.yieldKg || !s.yearsToFruit) continue
    const ms = new Set(s.varieties.length ? s.varieties.flatMap((v) => monthsOf(v.harvest)) : monthsOf(s.harvest))
    ms.forEach((m) => harvestMonths[m - 1]!++)
  }
  const yielding = species.filter((s) => s.yieldKg && s.yearsToFruit)
  const yieldByYear = [1, 2, 3, 4, 5, 7, 10, 15, 20].map((year) => {
    let kg = 0
    let revenue = 0
    species.forEach((s, i) => {
      const y = yieldAt(s, year) * counts[i]! * scale
      kg += y
      revenue += y * (s.pricePerKg ?? 0) * 0.6 // assume ~60% is sold at that price
    })
    return { year, kg: Math.round(kg), revenue: Math.round(revenue) }
  })
  const trees = species.reduce((n, s, i) => n + (s.form === 'herb' ? 0 : counts[i]!), 0)
  return {
    plantCount: Math.round(plants.length * scale),
    treeCount: Math.round(trees * scale),
    speciesCount: species.length,
    varietyCount: species.reduce((n, s) => n + Math.max(1, s.varieties.length), 0),
    strataMix,
    harvestMonths,
    firstHarvestYear: yielding.length ? Math.min(...yielding.map((s) => s.yearsToFruit)) : 0,
    yieldByYear,
    lineSpacingM: Math.round(lineSpacing * 10) / 10,
    inRowM: Math.round(inRow * 10) / 10,
  }
}

function toSpec(c: Cand, site: Site, varieties: Variety[]): PlantSpec {
  const s = c.s
  const south = site.hemisphere === 'S'
  const vh = varieties.length ? varieties.map((v) => v.harvest) : null
  return {
    id: s.id, name: s.name, latin: s.latin, emoji: s.emoji, strata: s.strata, succession: s.succession, form: s.form, roles: s.roles,
    heightM: s.h, widthM: s.w, deciduous: s.dec, leaf: s.leaf, fruit: s.fruit,
    yearsToFruit: s.ytf, yieldKg: s.kg,
    harvest: vh ? [vh[0]![0], vh[vh.length - 1]![1]] : s.harvest ? shiftWin(s.harvest, south) : undefined,
    lifespanYears: s.life, pricePerKg: s.price, native: c.native, invasive: s.invasive, marginal: c.marginal, pollard: s.pollard, note: s.note,
  }
}

// ─── public entry point ─────────────────────────────────────────────────────
export function design(req: DesignRequest): DesignResponse {
  const { site } = req
  const goals = [...new Set(req.goals)].slice(0, 2)
  if (!goals.length) goals.push('yearRound')
  const area = Math.max(50, req.areaM2)
  const rendered = Math.min(area, MAX_RENDER_M2)
  const scale = area / rendered
  const width = Math.sqrt(rendered * 1.4)
  const depth = rendered / width
  const full: Rect = { x0: -width / 2, x1: width / 2, z0: -depth / 2, z1: depth / 2 }
  const seedBase = Math.round(Math.abs(site.lat * 1000 + site.lon * 7)) + goals.join('').length * 31

  const [g1, g2] = goals as [Goal, Goal | undefined]
  const variants: { id: string; blocks: Plan[]; name: string; tagline: string; arch: Goal }[] = []
  const w1: Weights = { [g1]: 1, ...(g2 ? { [g2]: 0.5 } : {}) }
  variants.push({ id: 'a', arch: g1, name: ARCH[g1].name, tagline: ARCH[g1].tagline, blocks: [{ arch: g1, weights: w1, rect: full, seed: seedBase + 1 }] })
  if (g2) {
    const w2: Weights = { [g2]: 1, [g1]: 0.6 }
    variants.push({ id: 'b', arch: g2, name: ARCH[g2].name, tagline: ARCH[g2].tagline, blocks: [{ arch: g2, weights: w2, rect: full, seed: seedBase + 2 }] })
    if (rendered >= 1800) {
      // a mosaic: each goal gets its own half of the land, with a path between
      const mid = 0
      variants.push({
        id: 'c', arch: g1, name: `${ARCH[g1].name} + ${ARCH[g2].name}`,
        tagline: 'Split the land: each goal gets its own half, joined by a walking path.',
        blocks: [
          { arch: g1, weights: w1, rect: { ...full, x1: mid - 1.5 }, seed: seedBase + 3 },
          { arch: g2, weights: w2, rect: { ...full, x0: mid + 1.5 }, seed: seedBase + 4 },
        ],
      })
    }
  } else {
    const alt: Goal = g1 === 'yearRound' ? 'natives' : 'yearRound'
    variants.push({ id: 'b', arch: alt, name: ARCH[alt].name, tagline: ARCH[alt].tagline, blocks: [{ arch: alt, weights: { [alt]: 1, [g1]: 0.6 }, rect: full, seed: seedBase + 2 }] })
  }

  const designs: Design[] = variants.map((v) => {
    const notes: string[] = [`${site.label}: USDA zone ${site.zoneLabel}, ${site.climate}, ~${Math.round(site.precipMm)} mm rain, ${site.frostFreeDays} frost-free days.`]
    const species: DesignSpecies[] = []
    const index = new Map<string, number>()
    const plants: Placement[] = []
    const features: Feature[] = []
    let lineSpacing = 0
    let inRow = 0
    let tractor = false
    let contour = false
    for (const b of v.blocks) {
      const push = (b.weights.rare ?? 0) >= 0.5 ? 1 : 0
      const cands = candidates(site, push)
      const out = planBlock({ ...b, ov: req.overrides?.[v.id] }, site, rendered * ((b.rect.x1 - b.rect.x0) / width), cands, notes)
      lineSpacing = Math.max(lineSpacing, out.lineSpacing)
      inRow = inRow || out.inRow
      tractor ||= out.tractor
      contour ||= out.contour
      features.push(...out.features)
      for (const pl of out.placed) {
        let si = index.get(pl.c.s.id)
        if (si === undefined) {
          const vars = chooseVarieties(pl.c.s, b.arch, site.hemisphere === 'S')
          si = species.length
          index.set(pl.c.s.id, si)
          species.push({ ...toSpec(pl.c, site, vars), varieties: vars, count: 0 })
        }
        const sp = species[si]!
        sp.count++
        plants.push({ s: si, v: sp.varieties.length ? sp.count % sp.varieties.length : undefined, x: Math.round(pl.x * 100) / 100, z: Math.round(pl.z * 100) / 100 })
      }
    }
    if (v.blocks.length > 1) {
      features.push({ kind: 'path', x: 0, z: 0, points: [[0, full.z0], [0, full.z1]] })
      notes.splice(1, 0, `Left half: ${ARCH[v.blocks[0]!.arch].name}. Right half: ${ARCH[v.blocks[1]!.arch].name}.`)
    }
    if (tractor) features.push({ kind: 'shed', x: full.x0 - 4, z: full.z1 - 4 })
    const st = stats(species, plants, scale, lineSpacing, inRow)
    const covered = st.harvestMonths.filter((n) => n > 0).length
    if (covered) {
      const first = st.harvestMonths.findIndex((n) => n > 0)
      notes.push(`Something to harvest in ${covered} of 12 months${covered < 12 ? `, starting ${MONTH[first]}` : ''}. First harvest in year ${st.firstHarvestYear}.`)
    }
    if (scale > 1.01) notes.push(`Showing a representative ${(rendered / 10000).toFixed(1)} ha block; totals are scaled to your full ${(area / 10000).toFixed(1)} ha.`)
    return {
      id: v.id, archetype: v.arch, name: v.name, tagline: v.tagline, rationale: [...new Set(notes)],
      species, plants, features, plot: { width, depth, scale }, layout: contour ? 'contour' : 'rows', tractor, stats: st,
    }
  })
  return { model: MODEL, designs, catalog: catalogFor(site, w1) }
}

// Every food plant that can really grow at the site (no zone-pushing past the user's zone), best matches for their goals first.
export function catalogFor(site: Site, weights: Weights): CatalogItem[] {
  const south = site.hemisphere === 'S'
  const ranked = candidates(site, 0)
    .filter((c) => isFood(c.s) && c.s.roles.some((r) => r === 'fruit' || r === 'berry' || r === 'nut'))
    .map((c) => ({ c, sc: score(c, weights) }))
    .sort((a, b) => b.sc - a.sc)
  return ranked.map(({ c, sc }, i) => ({
    id: c.s.id, name: c.s.name, latin: c.s.latin, emoji: c.s.emoji, strata: c.s.strata, roles: c.s.roles, native: c.native, marginal: c.marginal,
    yearsToFruit: c.s.ytf, yieldKg: c.s.kg, harvest: c.s.harvest ? shiftWin(c.s.harvest, south) : undefined, pricePerKg: c.s.price,
    fruit: c.s.fruit, leaf: c.s.leaf, recommended: sc > 0 && i < 30, note: c.s.note,
  }))
}
