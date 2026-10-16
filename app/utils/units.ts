// Land is measured differently around the world; we store m² and display in the local unit.
export type AreaUnit = 'acre' | 'ha' | 'mz' | 'm2'

export const UNITS: Record<AreaUnit, { m2: number; label: string; short: string }> = {
  acre: { m2: 4046.86, label: 'acres', short: 'ac' },
  ha: { m2: 10000, label: 'hectares', short: 'ha' },
  mz: { m2: 6987, label: 'manzanas', short: 'mz' }, // Central American manzana ≈ 0.7 ha
  m2: { m2: 1, label: 'm²', short: 'm²' },
}

const ACRE_COUNTRIES = ['US', 'LR', 'MM', 'GB', 'PR']
const MANZANA_COUNTRIES = ['NI', 'HN', 'SV', 'GT', 'CR']

export function localUnits(country: string): AreaUnit[] {
  const cc = country.toUpperCase()
  if (MANZANA_COUNTRIES.includes(cc)) return ['mz', 'ha', 'acre']
  if (ACRE_COUNTRIES.includes(cc)) return ['acre', 'ha', 'mz']
  return ['ha', 'acre', 'mz']
}

export function fmtArea(m2: number, unit: AreaUnit) {
  const v = m2 / UNITS[unit].m2
  const n = v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100
  return `${n} ${UNITS[unit].short}`
}

// The land buckets from the survey, stored as m² ranges with a representative value.
export const LAND = [
  { id: 'backyard', title: 'Small backyard', min: 0, max: 1000, value: 450, emoji: '🏡' },
  { id: 'small', title: '', min: 1012, max: 4047, value: 2400, emoji: '🌳' },
  { id: 'mid', title: '', min: 4047, max: 20234, value: 10000, emoji: '🌲' },
  { id: 'large', title: '', min: 20234, max: 0, value: 40000, emoji: '⛰️' },
] as const

export function landLabel(b: (typeof LAND)[number], unit: AreaUnit) {
  if (b.id === 'backyard') return `Small backyard (under ${fmtArea(1000, unit === 'acre' ? 'acre' : unit)})`
  if (b.max === 0) return `${fmtArea(b.min, unit)}+`
  return `${fmtArea(b.min, unit).split(' ')[0]} – ${fmtArea(b.max, unit)}`
}

export const usesImperial = (country: string) => ['US', 'LR', 'MM'].includes(country.toUpperCase())
export const fmtTemp = (c: number, imperial: boolean) => (imperial ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`)
export const fmtMass = (kg: number, imperial: boolean) => {
  const v = imperial ? kg * 2.20462 : kg
  const u = imperial ? 'lb' : 'kg'
  return v >= 10000 ? `${Math.round(v / 1000).toLocaleString()}k ${u}` : `${Math.round(v).toLocaleString()} ${u}`
}
export const fmtLen = (m: number, imperial: boolean) => (imperial ? `${Math.round(m * 3.281)} ft` : `${Math.round(m * 10) / 10} m`)
export const fmtMoney = (usd: number) => '$' + (usd >= 10000 ? Math.round(usd / 1000) + 'k' : Math.round(usd).toLocaleString())
export const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtWindow = (h?: [number, number]) => (h ? (h[0] === h[1] ? MONTH_NAMES[h[0] - 1] : `${MONTH_NAMES[h[0] - 1]}–${MONTH_NAMES[h[1] - 1]}`) : '—')
