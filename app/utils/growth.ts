import type { PlantSpec } from '#shared/types'

// How big a plant is in a given year of the system (0..1 of mature size). Placenta crops are gone
// once their life is done: succession in action as the year slider moves.
// Share of a species' plants thinned out by a given year: support (secondary) trees are cut back as the
// canopy closes and the long-term (climax) trees then self-thin, so the stand gets sparser and taller.
export function thinnedShare(sp: Pick<PlantSpec, 'succession'>, year: number) {
  const ramp = (from: number, to: number, max: number) => max * Math.min(1, Math.max(0, (year - from) / (to - from)))
  return sp.succession === 'secondary' ? ramp(2, 10, 0.9) : sp.succession === 'climax' ? ramp(5, 20, 0.5) : 0
}

// `rank` (0..1, stable per plant) decides which individuals are thinned first.
export function plantGrowth(sp: Pick<PlantSpec, 'form' | 'heightM' | 'strata' | 'pollard' | 'succession' | 'lifespanYears'>, year: number, rank = 1) {
  if (sp.succession !== 'climax' && year > sp.lifespanYears + 0.5) return 0
  if (rank < thinnedShare(sp, year)) return 0
  const mature =
    sp.form === 'herb' ? 1
      : sp.form === 'shrub' ? 3
        : sp.form === 'palm' ? (sp.heightM > 8 ? 12 : 1.5)
          : sp.pollard ? 3
            : sp.strata === 'emergent' ? 20
              : sp.strata === 'high' ? 10
                : 6
  return Math.min(1, Math.max(0.12, 0.12 + 0.88 * Math.pow(Math.min(1, year / mature), 0.8)))
}

export function monthsIn(h?: [number, number]) {
  if (!h) return [] as number[]
  const out: number[] = []
  for (let m = h[0], i = 0; i < 12; i++) {
    out.push(m)
    if (m === h[1]) break
    m = (m % 12) + 1
  }
  return out
}

export function yieldAt(sp: Pick<PlantSpec, 'yearsToFruit' | 'yieldKg' | 'lifespanYears'>, year: number) {
  if (!sp.yearsToFruit || !sp.yieldKg || year < sp.yearsToFruit || year > sp.lifespanYears + 0.5) return 0
  return sp.yieldKg * Math.min(1, (year - sp.yearsToFruit + 1) / (sp.yearsToFruit + 2))
}
