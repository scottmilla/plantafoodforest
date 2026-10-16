import type { Weather } from '../../shared/types'

// GET /api/weather?lat=..&lon=..: today's sky for a saved forest (the climate itself is stored with the save)
export default defineEventHandler(async (event): Promise<{ weather: Weather | null }> => {
  const q = getQuery(event)
  const lat = Number(q.lat)
  const lon = Number(q.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw createError({ statusCode: 400, statusMessage: 'lat and lon are required' })
  return { weather: await weatherFor(lat, lon) }
})
