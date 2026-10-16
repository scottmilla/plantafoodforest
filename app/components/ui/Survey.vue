<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Goal } from '#shared/types'
import { fmtArea, LAND, landLabel, UNITS, type AreaUnit } from '~/utils/units'

const s = useSurvey()

// ── Q1: where ───────────────────────────────────────────────────────────────
const COUNTRIES: [string, string][] = [
  ['US', 'United States'], ['CA', 'Canada'], ['MX', 'México'], ['GT', 'Guatemala'], ['BZ', 'Belize'], ['SV', 'El Salvador'], ['HN', 'Honduras'],
  ['NI', 'Nicaragua'], ['CR', 'Costa Rica'], ['PA', 'Panamá'], ['CO', 'Colombia'], ['EC', 'Ecuador'], ['PE', 'Perú'], ['BR', 'Brasil'],
  ['AR', 'Argentina'], ['CL', 'Chile'], ['PR', 'Puerto Rico'], ['DO', 'República Dominicana'], ['GB', 'United Kingdom'], ['IE', 'Ireland'],
  ['FR', 'France'], ['ES', 'España'], ['PT', 'Portugal'], ['IT', 'Italia'], ['DE', 'Deutschland'], ['NL', 'Nederland'], ['CH', 'Schweiz'],
  ['AT', 'Österreich'], ['GR', 'Ελλάδα'], ['ZA', 'South Africa'], ['KE', 'Kenya'], ['IN', 'India'], ['TH', 'Thailand'], ['PH', 'Philippines'],
  ['JP', 'Japan'], ['AU', 'Australia'], ['NZ', 'New Zealand'],
]
const guess = (navigator.language.split('-')[1] ?? 'US').toUpperCase()
const country = ref(COUNTRIES.some(([c]) => c === guess) ? guess : 'US')
const q = ref('')
const placeholder = computed(() => (country.value === 'US' ? 'ZIP code, e.g. 21830' : 'Postal code or town'))
function submitWhere() {
  if (q.value.trim()) s.locate(q.value.trim(), country.value)
}

// ── Q2: how much land ───────────────────────────────────────────────────────
const bucket = ref<string | null>(null)
const exact = ref<number | null>(null)
function nextUnit() {
  const u = s.units.value
  s.unit.value = u[(u.indexOf(s.unit.value) + 1) % u.length]!
}
function pickLand(b: (typeof LAND)[number]) {
  bucket.value = b.id
  exact.value = null
  s.setLand(b.value)
}
function setExact() {
  if (!exact.value || exact.value <= 0) return
  bucket.value = null
  s.setLand(exact.value * UNITS[s.unit.value as AreaUnit].m2)
}

// ── Q3: goals ───────────────────────────────────────────────────────────────
const GOALS: { id: Goal; emoji: string; title: string; sub: string }[] = [
  { id: 'money', emoji: '💰', title: 'Money', sub: 'Production from season 2 on, at all costs' },
  { id: 'yearRound', emoji: '🧺', title: 'Year-round fruit', sub: 'For me, my family and my table' },
  { id: 'natives', emoji: '🪶', title: 'Natives only', sub: 'Plants that belong to this land' },
  { id: 'restoration', emoji: '🦋', title: 'Ecological restoration', sub: 'Water, wildlife and space for guests' },
  { id: 'rare', emoji: '🍋', title: 'Rare fruit & zone pushing', sub: 'Collector varieties at the edge of my zone' },
  { id: 'timber', emoji: '🪵', title: 'Timber', sub: 'Fast support trees nursing fine hardwoods' },
]
const rank = (g: Goal) => s.goals.value.indexOf(g) + 1
</script>

<template>
  <Transition name="fade">
    <!-- Q1 -->
    <div v-if="s.stage.value === 'intro'" key="intro" class="title">
      <p class="eyebrow">✦ a syntropic food forest, designed for your land ✦</p>
      <h1>Plant a Food Forest</h1>
      <form class="card survey-card q1" @submit.prevent="submitWhere">
        <p class="step">1 of 3</p>
        <h2>Where will your forest grow?</h2>
        <p class="lede">We'll read ten years of your sky, find your hardiness zone and paint today's weather.</p>
        <div class="row">
          <select v-model="country" aria-label="Country" class="field country">
            <option v-for="[c, n] in COUNTRIES" :key="c" :value="c">{{ n }}</option>
          </select>
          <input v-model="q" class="field grow" :placeholder="placeholder" aria-label="Postal code or town" autocomplete="postal-code" autofocus>
        </div>
        <p v-if="s.error.value" class="err">{{ s.error.value }}</p>
        <button class="btn btn-primary big wide" :disabled="!q.trim() || s.loading.value">
          {{ s.loading.value ? 'Reading the climate…' : 'Step into my climate →' }}
        </button>
        <button v-if="s.saves.value.length" type="button" class="linkish" @click="s.ui.saves = true">📂 Open a saved forest ({{ s.saves.value.length }})</button>
      </form>
    </div>

    <!-- Q2 -->
    <aside v-else-if="s.stage.value === 'land'" key="land" class="survey-dock">
      <div class="card survey-card">
        <p class="step">2 of 3</p>
        <h2>How much land do you want to plant?</h2>
        <div class="unit-row">
          <span class="lede">Measured in</span>
          <button class="chip" @click="nextUnit">{{ UNITS[s.unit.value].label }} ⇄</button>
        </div>
        <div class="options">
          <button v-for="b in LAND" :key="b.id" class="option" :class="{ on: bucket === b.id }" @click="pickLand(b)">
            <span class="opt-emoji">{{ b.emoji }}</span>
            <span>{{ landLabel(b, s.unit.value) }}</span>
          </button>
        </div>
        <form class="row exact" @submit.prevent="setExact">
          <span class="lede">or exactly</span>
          <input v-model.number="exact" class="field" type="number" min="0" step="any" :placeholder="UNITS[s.unit.value].short" aria-label="Exact area">
          <button class="chip" :disabled="!exact">Set</button>
        </form>
        <p v-if="s.areaM2.value" class="lede">Staked out: <b>{{ fmtArea(s.areaM2.value, s.unit.value) }}</b><template v-if="s.areaM2.value > 20000"> (showing a 2 ha block of it)</template></p>
        <button class="btn btn-primary wide" :disabled="!s.areaM2.value" @click="s.stage.value = 'goals'">That's my land →</button>
      </div>
    </aside>

    <!-- Q3 -->
    <aside v-else-if="s.stage.value === 'goals' || s.stage.value === 'designing'" key="goals" class="survey-dock">
      <div class="card survey-card">
        <p class="step">3 of 3</p>
        <h2>What are your two most important goals?</h2>
        <p class="lede">Tap them in order of importance.</p>
        <div class="options goals">
          <button v-for="g in GOALS" :key="g.id" class="option goal" :class="{ on: rank(g.id) > 0 }" :disabled="s.stage.value === 'designing'" @click="s.toggleGoal(g.id)">
            <span class="opt-emoji">{{ g.emoji }}</span>
            <span class="goal-text"><b>{{ g.title }}</b><small>{{ g.sub }}</small></span>
            <span v-if="rank(g.id)" class="rank">{{ rank(g.id) }}</span>
          </button>
        </div>
        <p v-if="s.error.value" class="err">{{ s.error.value }}</p>
        <div class="row">
          <button class="chip" :disabled="s.stage.value === 'designing'" @click="s.stage.value = 'land'">← Land</button>
          <button class="btn btn-primary grow" :disabled="s.goals.value.length < 2 || s.stage.value === 'designing'" @click="s.generate()">
            {{ s.stage.value === 'designing' ? 'Listening to the land…' : 'Design my forest ✦' }}
          </button>
        </div>
      </div>
    </aside>
  </Transition>
</template>
