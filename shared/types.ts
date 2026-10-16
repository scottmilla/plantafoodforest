// Contract shared by the app and the in-house design model (server/model).
// Anything the 3D scene or HUD needs from a design travels in these shapes.

export type Goal = 'money' | 'yearRound' | 'natives' | 'restoration' | 'rare' | 'timber'

export type Region =
  | 'na-east' | 'na-west' | 'na-southwest' | 'mesoamerica' | 'caribbean'
  | 'sa-tropical' | 'sa-temperate' | 'europe' | 'mediterranean' | 'africa'
  | 'asia-east' | 'asia-south' | 'oceania'

export type ClimateClass = 'tropical' | 'subtropical' | 'mediterranean' | 'arid' | 'temperate' | 'cold'

export interface Site {
  label: string // "Indian Head, MD"
  country: string // ISO-2, upper case
  lat: number
  lon: number
  region: Region
  zone: number // USDA zone, half zones as .5 (7.5 = 7b)
  zoneLabel: string // "7b"
  climate: ClimateClass
  minTempC: number // mean annual extreme minimum
  meanTempC: number
  precipMm: number
  frostFreeDays: number
  chillHours: number
  dryMonths: number // months with < 40 mm
  hemisphere: 'N' | 'S'
  estimated?: boolean // climate guessed from latitude because the archive was unreachable
}

export interface Weather {
  tempC: number
  code: number // WMO weather code
  isDay: boolean
  cloud: number
  wind: number
  localTime: string // ISO, at the site
  utcOffsetSeconds: number
  sunrise: string
  sunset: string
}

export interface PlaceResult {
  site: Site
  weather: Weather | null
}

export type Strata = 'emergent' | 'high' | 'medium' | 'low' | 'ground'
export type Succession = 'placenta' | 'secondary' | 'climax'
export type Form = 'round' | 'spreading' | 'columnar' | 'conifer' | 'palm' | 'shrub' | 'pollard' | 'vine' | 'herb'
export type Role = 'fruit' | 'berry' | 'nut' | 'timber' | 'support' | 'nfix' | 'biomass' | 'flower' | 'staple' | 'wildlife' | 'medicinal'

export interface PlantSpec {
  id: string
  name: string
  latin: string
  emoji: string
  strata: Strata
  succession: Succession
  form: Form
  roles: Role[]
  heightM: number
  widthM: number
  deciduous: boolean
  leaf: string
  fruit?: string
  yearsToFruit: number // 0 = not grown for a harvest
  yieldKg: number // mature, per plant per year
  harvest?: [number, number] // months 1–12 at the site (already hemisphere-shifted)
  lifespanYears: number
  pricePerKg?: number
  native: boolean // native to the site's region
  invasive?: boolean
  marginal?: boolean // right at the edge of the site's zone
  pollard?: boolean
  note?: string
}

export interface Placement {
  s: number // index into Design.species
  v?: number // index into that species' varieties
  x: number // metres, plot centred on 0,0
  z: number
}

export interface Variety {
  name: string
  harvest: [number, number]
}

export interface DesignSpecies extends PlantSpec {
  varieties: Variety[]
  count: number // in the rendered block
}

export interface Feature {
  kind: 'pond' | 'swale' | 'path' | 'shed' | 'bed'
  x: number
  z: number
  r?: number // pond radius
  points?: [number, number][] // swale/path polyline
}

export interface DesignStats {
  plantCount: number // scaled to the full area
  treeCount: number
  speciesCount: number
  varietyCount: number
  strataMix: Record<Strata, number>
  harvestMonths: number[] // 12 entries, how many species are harvestable in each month
  firstHarvestYear: number
  yieldByYear: { year: number; kg: number; revenue: number }[]
  lineSpacingM: number
  inRowM: number
}

export interface Design {
  id: string
  archetype: Goal
  name: string
  tagline: string
  rationale: string[]
  species: DesignSpecies[]
  plants: Placement[]
  features: Feature[]
  plot: { width: number; depth: number; scale: number } // rendered metres; scale = full area / rendered area
  layout: 'rows' | 'contour'
  tractor: boolean
  stats: DesignStats
}

// Per-design tweaks from the fruit picker: species ids the user added or took out.
export interface Overrides { add: string[]; remove: string[] }
export type OverrideMap = Record<string, Overrides> // keyed by design id ('a' | 'b' | 'c')

export interface DesignRequest {
  site: Site
  areaM2: number
  goals: Goal[] // ranked, length 1–2
  overrides?: OverrideMap
}

// A food plant that can actually grow at the site (zone, chill, heat), offered in the fruit picker.
export interface CatalogItem {
  id: string
  name: string
  latin: string
  emoji: string
  strata: Strata
  roles: Role[]
  native: boolean
  marginal: boolean
  yearsToFruit: number
  yieldKg: number
  harvest?: [number, number] // site-local months
  pricePerKg?: number
  fruit?: string
  leaf: string
  recommended: boolean // ranks in the model's top picks for the user's goals
  note?: string
}

export interface DesignResponse {
  model: string // model name + version
  designs: Design[]
  catalog: CatalogItem[]
}

export interface Lead {
  name: string
  email: string
  phone?: string
  message?: string
  site: Site | null
  areaM2: number | null
  goals: Goal[]
  designId?: string
  designName?: string
  designSpecies?: string[] // what's actually planted in the design they liked, after their edits
}
