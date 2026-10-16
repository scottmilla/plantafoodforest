import type { PlaceResult, Site, Weather } from '../../shared/types'
import { climateClass, estimateClimate, regionFor, summarise, usdaZone, zoneLabel, type ClimateSummary } from '../model/climate'

// GET /api/place?q=20640&country=US
// Postal code (or town name) → location → 10-year climate summary + right-now weather.

interface Geo { lat: number; lon: number; label: string; country: string }

const UA = { 'User-Agent': 'plantafoodforest/0.1 (food forest design survey)' }

async function zippopotam(q: string, cc: string): Promise<Geo | null> {
  try {
    const r = await $fetch<any>(`https://api.zippopotam.us/${cc.toLowerCase()}/${encodeURIComponent(q.replace(/\s+/g, cc === 'US' ? '' : ' '))}`, { timeout: 6000 })
    const p = r?.places?.[0]
    if (!p) return null
    const region = p['state abbreviation'] || p.state
    return { lat: +p.latitude, lon: +p.longitude, label: `${p['place name']}${region ? ', ' + region : ''}`, country: (r['country abbreviation'] || cc).toUpperCase() }
  } catch {
    return null
  }
}

async function nominatim(q: string, cc: string): Promise<Geo | null> {
  const params = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '1' })
  if (cc) params.set('countrycodes', cc.toLowerCase())
  // try as a postal code first, then as free text (most of Central America barely uses postcodes)
  // free-text search only for names: a mistyped number would otherwise match something random
  const attempts: [string, string][] = /[a-z]/i.test(q) ? [['postalcode', q], ['q', q]] : [['postalcode', q]]
  for (const [k, v] of attempts) {
    try {
      const p = new URLSearchParams(params)
      p.set(k, v)
      const [hit] = await $fetch<any[]>(`https://nominatim.openstreetmap.org/search?${p}`, { headers: UA, timeout: 8000 })
      const norm = (x: string) => String(x ?? '').replace(/[\s-]/g, '').toLowerCase()
      if (hit && k === 'postalcode' && !norm(hit.address?.postcode).startsWith(norm(q).slice(0, 4))) continue // fuzzy non-match
      if (hit) {
        const a = hit.address ?? {}
        const town = a.city || a.town || a.village || a.municipality || a.county || hit.name
        const region = a.state || a.region || ''
        return { lat: +hit.lat, lon: +hit.lon, label: [...new Set([town, region].filter(Boolean))].join(', ') || hit.display_name, country: String(a.country_code || cc).toUpperCase() }
      }
    } catch { /* fall through */ }
  }
  return null
}

async function archive(lat: number, lon: number, years: number, timeout: number) {
  const end = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 11, 31))
  const start = new Date(Date.UTC(end.getUTCFullYear() - (years - 1), 0, 1))
  const d = (x: Date) => x.toISOString().slice(0, 10)
  const r = await $fetch<any>('https://archive-api.open-meteo.com/v1/archive', {
    query: { latitude: lat, longitude: lon, start_date: d(start), end_date: d(end), daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum', timezone: 'auto' },
    timeout,
  })
  return summarise({ time: r.daily.time, tmin: r.daily.temperature_2m_min, tmax: r.daily.temperature_2m_max, precip: r.daily.precipitation_sum }, lat)
}

// 10 years of history → 3 years → (if the archive is down) a rough latitude estimate, so the funnel never dead-ends
const climateFor = defineCachedFunction(
  async (lat: number, lon: number): Promise<ClimateSummary & { estimated?: boolean }> => {
    try {
      return await archive(lat, lon, 10, 12000)
    } catch {
      try {
        return await archive(lat, lon, 3, 8000)
      } catch {
        return { ...estimateClimate(lat), estimated: true }
      }
    }
  },
  {
    maxAge: 60 * 60 * 24 * 30, name: 'climate', getKey: (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`,
    // never cache a guess for a month
    validate: (entry: any) => !entry?.value?.estimated,
  } as any,
)

export default defineEventHandler(async (event): Promise<PlaceResult> => {
  const { q = '', country = 'US' } = getQuery(event) as { q?: string; country?: string }
  const query = String(q).trim().slice(0, 80)
  const cc = String(country).trim().slice(0, 2).toUpperCase()
  if (!query) throw createError({ statusCode: 400, statusMessage: 'Enter a postal code or town' })

  // US ZIPs are authoritative in zippopotam; OSM has stray bogus US postcodes, so don't fall back for those
  const numeric = /^\d[\d\s-]*$/.test(query)
  const geo = (/\d/.test(query) ? await zippopotam(query, cc) : null) ?? (cc === 'US' && numeric ? null : await nominatim(query, cc))
  if (!geo) throw createError({ statusCode: 404, statusMessage: `We couldn't find "${query}". Try a nearby town name.` })

  const [c, weather] = await Promise.all([climateFor(geo.lat, geo.lon), weatherFor(geo.lat, geo.lon)])
  const zone = usdaZone(c.minTempC)
  const site: Site = {
    label: geo.label, country: geo.country, lat: geo.lat, lon: geo.lon,
    region: regionFor(geo.lat, geo.lon, geo.country),
    zone, zoneLabel: zoneLabel(zone), climate: climateClass(c, zone),
    minTempC: Math.round(c.minTempC * 10) / 10, meanTempC: Math.round(c.meanTempC * 10) / 10, precipMm: Math.round(c.precipMm),
    frostFreeDays: c.frostFreeDays, chillHours: c.chillHours, dryMonths: c.dryMonths, hemisphere: geo.lat < 0 ? 'S' : 'N',
    ...(c.estimated ? { estimated: true } : {}),
  }
  return { site, weather }
})
