import { computed, reactive, ref, shallowRef } from 'vue'
import type { CatalogItem, Design, DesignResponse, Goal, OverrideMap, Overrides, PlaceResult, Site, Weather } from '#shared/types'
import { computeEnv } from '~/utils/env'
import { localUnits, usesImperial, type AreaUnit } from '~/utils/units'

// Shared singleton state for the whole funnel (client-only app, so module scope is safe).
export type Stage = 'intro' | 'land' | 'goals' | 'designing' | 'explore'

// A saved forest is just the user's answers + edits. Designs are regenerated from them (the model is deterministic).
export interface SavedForest {
  id: string
  name: string
  savedAt: number
  site: Site
  areaM2: number
  unit: AreaUnit
  goals: Goal[]
  overrides: OverrideMap
  active: number
  year: number
}
const SAVE_KEY = 'pff.saves.v1'
const EMAIL_KEY = 'pff.email.v1' // { email, optIn }: asked once, remembered on this device
const MAX_SAVES = 20

const stage = ref<Stage>('intro')
const place = shallowRef<PlaceResult | null>(null)
const areaM2 = ref(0)
const unit = ref<AreaUnit>('acre')
const goals = ref<Goal[]>([])
const designs = shallowRef<Design[]>([])
const catalog = shallowRef<CatalogItem[]>([])
const overrides = ref<OverrideMap>({})
const model = ref('')
const active = ref(0)
const year = ref(5)
const selected = ref<number | null>(null) // plant index in the active design
const loading = ref(false)
const regenerating = ref(false)
const error = ref('')
const saves = ref<SavedForest[]>([])
const email = ref('')
const optIn = ref(false)
const saving = ref(false)
const currentSaveId = ref<string | null>(null) // the slot Save updates, once this forest has been saved or loaded
const ui = reactive({ autoOrbit: false, system: false, fruits: false, saves: false, designer: false, birdseye: false, tractor: false, forceDay: false, mobile: false })
const input = reactive({ forward: false, back: false, left: false, right: false, rotL: false, rotR: false })
const clock = ref(Date.now())
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
let regenTimer: ReturnType<typeof setTimeout> | undefined
let regenSeq = 0

function readSaves(): SavedForest[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => x?.id && x?.site && x?.goals) : []
  } catch {
    return []
  }
}
function writeSaves(list: SavedForest[]) {
  saves.value = list
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(list))
  } catch {
    /* private mode / storage full: the list still works for this visit */
  }
}
if (typeof window !== 'undefined') {
  setInterval(() => (clock.value = Date.now()), 60_000)
  saves.value = readSaves()
  try {
    const e = JSON.parse(localStorage.getItem(EMAIL_KEY) ?? 'null')
    if (e?.email) { email.value = e.email; optIn.value = !!e.optIn }
  } catch { /* nothing remembered */ }
}

const clean = (m: OverrideMap): OverrideMap => Object.fromEntries(Object.entries(m).filter(([, v]) => v.add.length || v.remove.length))

export function useSurvey() {
  const site = computed(() => place.value?.site ?? null)
  const weather = computed(() => place.value?.weather ?? null)
  const imperial = computed(() => usesImperial(site.value?.country ?? 'US'))
  const env = computed(() => (clock.value, computeEnv(site.value, weather.value, ui.forceDay)))
  const design = computed(() => designs.value[active.value] ?? null)
  const designId = computed(() => design.value?.id ?? 'a')
  const edits = computed<Overrides>(() => overrides.value[designId.value] ?? { add: [], remove: [] })
  const edited = computed(() => edits.value.add.length + edits.value.remove.length > 0)
  const plot = computed(() => {
    if (design.value) return { width: design.value.plot.width, depth: design.value.plot.depth }
    if (!areaM2.value) return null
    const a = Math.min(areaM2.value, 20000)
    const width = Math.sqrt(a * 1.4)
    return { width, depth: a / width }
  })
  const units = computed(() => localUnits(site.value?.country ?? 'US'))

  function say(msg: string) {
    toast.value = msg
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.value = ''), 2800)
  }

  async function locate(q: string, country: string) {
    error.value = ''
    loading.value = true
    try {
      place.value = await $fetch<PlaceResult>('/api/place', { query: { q, country } })
      currentSaveId.value = null
      unit.value = localUnits(place.value.site.country)[0]!
      stage.value = 'land'
    } catch (e: any) {
      error.value = e?.data?.statusMessage || e?.statusMessage || 'Something went wrong finding that place.'
    } finally {
      loading.value = false
    }
  }

  function setLand(m2: number) {
    areaM2.value = m2
  }

  function toggleGoal(g: Goal) {
    const i = goals.value.indexOf(g)
    if (i >= 0) goals.value = goals.value.filter((x) => x !== g)
    else if (goals.value.length < 2) goals.value = [...goals.value, g]
    else goals.value = [goals.value[0]!, g]
  }

  async function request() {
    return $fetch<DesignResponse>('/api/design', {
      method: 'POST',
      body: { site: site.value, areaM2: areaM2.value, goals: goals.value, overrides: clean(overrides.value) },
    })
  }

  async function generate(opts: { keepView?: boolean } = {}) {
    if (!site.value) return
    stage.value = 'designing'
    error.value = ''
    try {
      const r = await request()
      designs.value = r.designs
      catalog.value = r.catalog
      model.value = r.model
      if (!opts.keepView) {
        active.value = 0
        year.value = 5
      }
      selected.value = null
      ui.tractor = ui.tractor && !!r.designs[active.value]?.tractor
      stage.value = 'explore'
      if (!opts.keepView) ui.system = !ui.mobile
    } catch (e: any) {
      error.value = e?.data?.statusMessage || 'The design model had trouble. Try again?'
      stage.value = 'goals'
    }
  }

  // ── fruit picker ──
  // Edits apply to the design being viewed; the model re-lays-out the forest around them (debounced so rapid taps batch).
  function editFruit(id: string, mode: 'add' | 'remove') {
    const cur = edits.value
    const other = mode === 'add' ? 'remove' : 'add'
    const next: Overrides = {
      add: [...cur.add],
      remove: [...cur.remove],
    }
    // taking back an earlier edit just undoes it
    if (next[other].includes(id)) next[other] = next[other].filter((x) => x !== id)
    else if (!next[mode].includes(id)) next[mode].push(id)
    overrides.value = { ...overrides.value, [designId.value]: next }
    scheduleRegen()
  }
  const addFruit = (id: string) => editFruit(id, 'add')
  const removeFruit = (id: string) => editFruit(id, 'remove')
  function resetFruit() {
    const { [designId.value]: _drop, ...rest } = overrides.value
    overrides.value = rest
    scheduleRegen()
  }
  function scheduleRegen() {
    regenerating.value = true
    clearTimeout(regenTimer)
    regenTimer = setTimeout(async () => {
      const seq = ++regenSeq
      try {
        const r = await request()
        if (seq !== regenSeq) return // a newer edit is already on its way
        designs.value = r.designs
        catalog.value = r.catalog
        selected.value = null
      } catch {
        say('Could not update the design. Try again?')
      } finally {
        if (seq === regenSeq) regenerating.value = false
      }
    }, 350)
  }

  function pickDesign(i: number) {
    active.value = i
    selected.value = null
    if (!designs.value[i]?.tractor) ui.tractor = false
  }

  function restart() {
    designs.value = []
    overrides.value = {}
    goals.value = []
    selected.value = null
    ui.tractor = false
    ui.birdseye = false
    ui.fruits = false
    stage.value = 'goals'
  }

  // ── saved forests ──
  function suggestName() {
    const d = design.value
    return `${site.value?.label ?? 'My forest'}${d ? ' · ' + d.name : ''}`.slice(0, 60)
  }
  // Saves locally first (so it always works), then sends the email + a snapshot to the server for the list.
  // pass `asNew` to save a copy instead of updating the slot this forest came from
  async function saveCurrent(name: string, asNew = false) {
    if (!site.value || saving.value) return
    const entry: SavedForest = {
      id: (!asNew && currentSaveId.value) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 60) || suggestName(),
      savedAt: Date.now(),
      site: site.value,
      areaM2: areaM2.value,
      unit: unit.value,
      goals: [...goals.value],
      overrides: clean(overrides.value),
      active: active.value,
      year: year.value,
    }
    writeSaves([entry, ...saves.value.filter((x) => x.id !== entry.id)].slice(0, MAX_SAVES))
    currentSaveId.value = entry.id
    email.value = email.value.trim()
    try { localStorage.setItem(EMAIL_KEY, JSON.stringify({ email: email.value, optIn: optIn.value })) } catch { /* private mode */ }
    saving.value = true
    try {
      const d = design.value
      await $fetch('/api/subscribe', {
        method: 'POST',
        body: {
          email: email.value, marketingOptIn: optIn.value, name: entry.name, site: entry.site, areaM2: entry.areaM2, goals: entry.goals, overrides: entry.overrides,
          designName: d?.name, designSpecies: d?.species.filter((x) => x.yieldKg > 0).map((x) => `${x.name} ×${Math.round(x.count * d.plot.scale)}`),
        },
      })
      say(`💾 Saved “${entry.name}”`)
    } catch (e: any) {
      // a bad email is the only thing the person can fix; anything else we absorb quietly since the local save worked
      if (e?.statusCode === 400 || e?.status === 400) error.value = e?.data?.statusMessage || 'Please check your email address.'
      else say(`💾 Saved on this device (“${entry.name}”)`)
    } finally {
      saving.value = false
    }
  }
  async function loadSave(id: string) {
    const sv = saves.value.find((x) => x.id === id)
    if (!sv) return
    ui.saves = false
    ui.fruits = false
    ui.system = false
    ui.birdseye = false
    ui.designer = false
    currentSaveId.value = sv.id
    place.value = { site: sv.site, weather: null }
    unit.value = sv.unit
    areaM2.value = sv.areaM2
    goals.value = [...sv.goals]
    overrides.value = { ...sv.overrides }
    active.value = sv.active
    year.value = sv.year
    // the climate is stored with the save; only today's sky needs a fresh look
    $fetch<{ weather: Weather | null }>('/api/weather', { query: { lat: sv.site.lat, lon: sv.site.lon } })
      .then((r) => (place.value = { site: sv.site, weather: r.weather }))
      .catch(() => {})
    await generate({ keepView: true })
    active.value = Math.min(sv.active, designs.value.length - 1)
    year.value = sv.year
  }
  function deleteSave(id: string) {
    if (currentSaveId.value === id) currentSaveId.value = null
    writeSaves(saves.value.filter((x) => x.id !== id))
  }

  return {
    stage, place, site, weather, imperial, env, areaM2, unit, units, goals, designs, catalog, overrides, edits, edited, model, active, design, designId, plot, year, selected,
    loading, regenerating, error, ui, input, toast, saves, currentSaveId, email, optIn, saving, say, locate, setLand, toggleGoal, generate, pickDesign, restart,
    addFruit, removeFruit, resetFruit, suggestName, saveCurrent, loadSave, deleteSave,
  }
}
