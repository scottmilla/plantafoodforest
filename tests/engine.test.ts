import { describe, expect, it } from 'vitest'
import { design } from '../server/model/engine'
import { usdaZone, zoneLabel, regionFor } from '../server/model/climate'
import type { Site } from '../shared/types'

const maryland: Site = {
  label: 'Hebron, MD', country: 'US', lat: 38.42, lon: -75.69, region: 'na-east', zone: 7.5, zoneLabel: '7b', climate: 'temperate',
  minTempC: -14, meanTempC: 13.5, precipMm: 1150, frostFreeDays: 230, chillHours: 1100, dryMonths: 0, hemisphere: 'N',
}
const nicaragua: Site = {
  label: 'Matagalpa, NI', country: 'NI', lat: 12.9, lon: -85.9, region: 'mesoamerica', zone: 12, zoneLabel: '12a', climate: 'tropical',
  minTempC: 14, meanTempC: 22, precipMm: 1400, frostFreeDays: 365, chillHours: 0, dryMonths: 5, hemisphere: 'N',
}
const vermont: Site = { ...maryland, label: 'Burlington, VT', lat: 44.5, lon: -73.2, zone: 4.5, zoneLabel: '4b', climate: 'cold', chillHours: 1500, frostFreeDays: 150 }

describe('climate helpers', () => {
  it('maps extreme minimums to USDA zones', () => {
    expect(zoneLabel(usdaZone(-12.2))).toBe('8a') // 10 °F
    expect(zoneLabel(usdaZone(-15))).toBe('7b') // 5 °F
    expect(zoneLabel(usdaZone(-28.9))).toBe('4b') // -20 °F
  })
  it('places sites in native regions', () => {
    expect(regionFor(38.4, -75.7, 'US')).toBe('na-east')
    expect(regionFor(12.9, -85.9, 'NI')).toBe('mesoamerica')
    expect(regionFor(45.5, -122.6, 'US')).toBe('na-west')
  })
})

describe('design model', () => {
  it('money → orchard-like: two target crops, pollarded support, wide alleys, a tractor', () => {
    const { designs } = design({ site: maryland, areaM2: 4000, goals: ['money', 'yearRound'] })
    const a = designs[0]!
    expect(a.archetype).toBe('money')
    expect(a.tractor).toBe(true)
    const crops = a.species.filter((s) => s.yieldKg > 0 && s.strata !== 'ground')
    expect(crops.length).toBeLessThanOrEqual(2)
    expect(a.species.some((s) => s.pollard)).toBe(true)
    expect(a.stats.lineSpacingM).toBeGreaterThanOrEqual(8)
    // money first: the second design is the season-long one, and it's denser
    const b = designs[1]!
    expect(b.stats.lineSpacingM).toBeLessThan(a.stats.lineSpacingM)
    expect(b.species.length).toBeGreaterThan(a.species.length)
  })

  it('year-round stretches the harvest calendar', () => {
    const { designs } = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'] })
    const months = designs[0]!.stats.harvestMonths.filter((n) => n > 0).length
    expect(months).toBeGreaterThanOrEqual(6)
    expect(designs[0]!.stats.firstHarvestYear).toBeLessThanOrEqual(2)
  })

  it('natives only uses native species', () => {
    const { designs } = design({ site: maryland, areaM2: 4000, goals: ['natives', 'yearRound'] })
    expect(designs[0]!.species.every((s) => s.native)).toBe(true)
    expect(designs[0]!.species.length).toBeGreaterThan(5)
  })

  it('restoration adds a pond, swales and contour lines', () => {
    const { designs } = design({ site: maryland, areaM2: 4000, goals: ['restoration', 'natives'] })
    const d = designs[0]!
    expect(d.layout).toBe('contour')
    expect(d.features.some((f) => f.kind === 'pond')).toBe(true)
    expect(d.features.some((f) => f.kind === 'swale')).toBe(true)
  })

  it('zone pushing reaches past the zone (e.g. citrus hybrids, olives in 7b)', () => {
    const { designs } = design({ site: maryland, areaM2: 4000, goals: ['rare', 'yearRound'] })
    const d = designs[0]!
    expect(d.species.some((s) => s.marginal)).toBe(true)
  })

  it('tropics stack all five strata', () => {
    const { designs } = design({ site: nicaragua, areaM2: 4000, goals: ['yearRound', 'natives'] })
    const mix = designs[0]!.stats.strataMix
    expect(Object.values(mix).every((n) => n > 0)).toBe(true)
  })

  it('cold climates stack fewer strata', () => {
    const { designs } = design({ site: vermont, areaM2: 2000, goals: ['yearRound', 'money'] })
    // pollarded support trees sit in the emergent stratum by design; no crop tree should
    expect(designs[0]!.species.filter((s) => s.strata === 'emergent' && !s.pollard)).toEqual([])
  })

  it('returns 2–3 designs and scales big farms', () => {
    const r = design({ site: maryland, areaM2: 40000, goals: ['timber', 'restoration'] })
    expect(r.designs.length).toBe(3)
    expect(r.designs[0]!.plot.scale).toBeGreaterThan(1.9)
    const small = design({ site: maryland, areaM2: 400, goals: ['yearRound', 'rare'] })
    expect(small.designs.length).toBe(2)
  })
})

describe('fruit picker', () => {
  const ids = (d: { species: { id: string }[] }) => d.species.map((x) => x.id)

  it('the catalog only offers fruit that can grow at the site', () => {
    const { catalog } = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'] })
    const have = catalog.map((c) => c.id)
    expect(have).toContain('apple')
    expect(have).toContain('pawpaw')
    for (const tropical of ['mango', 'jackfruit', 'cacao', 'coconut', 'avocado', 'banana']) expect(have).not.toContain(tropical)
    const t = design({ site: nicaragua, areaM2: 4000, goals: ['yearRound', 'money'] }).catalog.map((c) => c.id)
    expect(t).toContain('mango')
    expect(t).not.toContain('apple')
    expect(t).not.toContain('blueberry')
  })

  it('removing a fruit takes it out of the design', () => {
    const base = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'] }).designs[0]!
    expect(ids(base)).toContain('apple')
    const r = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'], overrides: { a: { add: [], remove: ['apple'] } } }).designs[0]!
    expect(ids(r)).not.toContain('apple')
    expect(r.species.length).toBe(base.species.length - 1)
  })

  it('adding a fruit plants it', () => {
    const base = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'] }).designs[0]!
    const extra = ['quince', 'pawpaw', 'american-persimmon', 'serviceberry'].find((id) => !ids(base).includes(id))!
    const r = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'], overrides: { a: { add: [extra], remove: [] } } }).designs[0]!
    expect(ids(r)).toContain(extra)
    expect(r.plants.some((p) => r.species[p.s]!.id === extra)).toBe(true)
  })

  it('works in the money design: removing the target crop swaps in another, adding joins the alley', () => {
    const base = design({ site: maryland, areaM2: 4000, goals: ['money', 'yearRound'] }).designs[0]!
    const crop = base.species.find((s) => s.strata !== 'ground' && s.yieldKg > 0 && !s.pollard)!.id
    const r = design({ site: maryland, areaM2: 4000, goals: ['money', 'yearRound'], overrides: { a: { add: ['pawpaw'], remove: [crop] } } }).designs[0]!
    expect(ids(r)).not.toContain(crop)
    expect(ids(r)).toContain('pawpaw')
  })

  it('natives designs ignore non-native additions', () => {
    const r = design({ site: maryland, areaM2: 4000, goals: ['natives', 'yearRound'], overrides: { a: { add: ['fig'], remove: [] } } }).designs[0]!
    expect(r.species.every((s) => s.native)).toBe(true)
  })
})

describe('herb & shrub layer', () => {
  const herbsOf = (d: { species: { roles: string[]; id: string }[] }) => d.species.filter((x) => x.roles.includes('herb'))
  const sites = { maryland, nicaragua, vermont }

  it('every design, in every climate, includes herbs', () => {
    for (const [name, site] of Object.entries(sites)) {
      for (const goals of [['money', 'yearRound'], ['yearRound', 'natives'], ['natives', 'restoration'], ['restoration', 'rare'], ['rare', 'timber'], ['timber', 'money']] as const) {
        for (const d of design({ site, areaM2: 4000, goals: [...goals] }).designs) {
          expect(herbsOf(d).length, `${name} ${goals.join('+')} ${d.name}`).toBeGreaterThanOrEqual(2)
          expect(d.plants.some((p) => d.species[p.s]!.roles.includes('herb'))).toBe(true)
        }
      }
    }
  })

  it('the money design keeps a small market-herb row; family designs get a fuller kitchen', () => {
    const [money, larder] = design({ site: maryland, areaM2: 4000, goals: ['money', 'yearRound'] }).designs
    expect(herbsOf(money!).length).toBe(2)
    expect(herbsOf(larder!).length).toBeGreaterThanOrEqual(4)
    // a family kitchen leans on culinary herbs
    expect(herbsOf(larder!).map((h) => h.id)).toEqual(expect.arrayContaining(['thyme']))
  })

  it('natives designs use only native herbs', () => {
    for (const d of design({ site: maryland, areaM2: 4000, goals: ['natives', 'restoration'] }).designs.slice(0, 2)) {
      expect(herbsOf(d).every((h) => (d.species.find((x) => x.id === h.id) as any).native)).toBe(true)
    }
  })

  it('only offers herbs that can grow at the site', () => {
    const cold = design({ site: vermont, areaM2: 2000, goals: ['yearRound', 'money'] }).catalog.filter((c) => c.kind === 'herb').map((c) => c.id)
    expect(cold).toContain('chives')
    for (const tropical of ['tulsi', 'culantro', 'stevia', 'curry-leaf', 'roselle', 'aloe', 'rosemary']) expect(cold).not.toContain(tropical)
    const hot = design({ site: nicaragua, areaM2: 2000, goals: ['yearRound', 'money'] }).catalog.filter((c) => c.kind === 'herb').map((c) => c.id)
    expect(hot).toContain('tulsi')
    expect(hot).not.toContain('goldenseal')
  })

  it('herbs can be removed and added in the picker', () => {
    const base = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'] })
    const d0 = base.designs[0]!
    const gone = herbsOf(d0)[0]!.id
    const extra = base.catalog.find((c) => c.kind === 'herb' && !herbsOf(d0).some((h) => h.id === c.id))!.id
    const d1 = design({ site: maryland, areaM2: 4000, goals: ['yearRound', 'money'], overrides: { a: { add: [extra], remove: [gone] } } }).designs[0]!
    expect(herbsOf(d1).map((h) => h.id)).not.toContain(gone)
    expect(herbsOf(d1).map((h) => h.id)).toContain(extra)
  })

  it('herbs do not count as fruit in the harvest calendar or first-harvest year', () => {
    const d = design({ site: maryland, areaM2: 4000, goals: ['natives', 'timber'] }).designs[0]!
    const fruitOnly = d.species.filter((x) => x.yieldKg > 0 && x.yearsToFruit > 0 && !x.roles.includes('herb'))
    expect(d.stats.firstHarvestYear).toBe(Math.min(...fruitOnly.map((x) => x.yearsToFruit)))
  })
})

