<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CatalogItem } from '#shared/types'
import { fmtWindow } from '~/utils/units'

// See every fruit in the design, take any out, and add more: but only plants that can really grow here.
const s = useSurvey()
const d = computed(() => s.design.value)

const FOOD = ['fruit', 'berry', 'nut']
const inDesign = computed(() =>
  (d.value?.species ?? [])
    .filter((sp) => sp.yieldKg > 0 && sp.yearsToFruit > 0 && sp.roles.some((r) => FOOD.includes(r)))
    .sort((a, b) => a.yearsToFruit - b.yearsToFruit || b.count - a.count),
)
const inIds = computed(() => new Set((d.value?.species ?? []).map((sp) => sp.id)))
const scale = computed(() => d.value?.plot.scale ?? 1)

type Filter = 'all' | 'recommended' | 'native' | 'early' | 'berry' | 'nut'
const FILTERS: [Filter, string][] = [['recommended', '⭐ Recommended'], ['all', 'All'], ['native', '🪶 Native'], ['early', '⏱ Early'], ['berry', '🫐 Berries'], ['nut', '🌰 Nuts']]
const filter = ref<Filter>('recommended')
const q = ref('')

const nativesOnly = computed(() => d.value?.archetype === 'natives')
const eligible = computed(() => s.catalog.value.filter((c) => !inIds.value.has(c.id) && (!nativesOnly.value || c.native)))
const shown = computed(() => {
  const text = q.value.trim().toLowerCase()
  return eligible.value.filter((c) => {
    if (text && !(c.name.toLowerCase().includes(text) || c.latin.toLowerCase().includes(text))) return false
    if (text) return true
    switch (filter.value) {
      case 'recommended': return c.recommended
      case 'native': return c.native
      case 'early': return c.yearsToFruit <= 2
      case 'berry': return c.roles.includes('berry')
      case 'nut': return c.roles.includes('nut')
      default: return true
    }
  })
})
const wasAdded = (c: CatalogItem) => s.edits.value.add.includes(c.id)
const label = computed(() => `Design ${'ABC'[s.active.value]}`)
</script>

<template>
  <Transition name="slide-r">
    <aside v-if="d && s.ui.fruits && s.stage.value === 'explore' && s.selected.value === null" class="system fruits card">
      <button class="close" aria-label="Close" @click="s.ui.fruits = false">✕</button>
      <p class="type">{{ label }} · {{ d.name }}</p>
      <h2>Your fruits, berries &amp; nuts</h2>
      <p class="tag">Only plants that can grow in {{ s.site.value?.label }} (zone {{ s.site.value?.zoneLabel }}). Take any out, add your favourites, and the model re-plants around you.</p>

      <div class="picker-status">
        <span v-if="s.regenerating.value" class="busy">🌱 Re-planting…</span>
        <span v-else-if="s.edited.value">✏️ +{{ s.edits.value.add.length }} added · −{{ s.edits.value.remove.length }} removed</span>
        <span v-else>As recommended by the model</span>
        <button v-if="s.edited.value" class="chip tiny" @click="s.resetFruit()">↺ Reset</button>
      </div>

      <h3>In this design · {{ inDesign.length }}</h3>
      <ul class="frows">
        <li v-for="sp in inDesign" :key="sp.id" :style="{ '--accent': sp.fruit ?? sp.leaf }">
          <span class="fe">{{ sp.emoji }}</span>
          <span class="fi">
            <b>{{ sp.name }}</b>
            <small>
              <template v-if="sp.native">🪶 </template>fruit from year {{ sp.yearsToFruit }} · {{ fmtWindow(sp.harvest) }} · ×{{ Math.round(sp.count * scale).toLocaleString() }}
            </small>
          </span>
          <button class="rb minus" :aria-label="`Remove ${sp.name}`" @click="s.removeFruit(sp.id)">−</button>
        </li>
        <li v-if="!inDesign.length" class="empty">Nothing left to harvest. Add some fruit below.</li>
      </ul>

      <h3>Add from what grows here</h3>
      <input v-model="q" class="field search" type="search" placeholder="Search fruits…" aria-label="Search fruits">
      <div v-if="!q" class="filters">
        <button v-for="[f, name] in FILTERS" :key="f" class="chip tiny" :class="{ on: filter === f }" @click="filter = f">{{ name }}</button>
      </div>
      <ul class="frows">
        <li v-for="c in shown" :key="c.id" :style="{ '--accent': c.fruit ?? c.leaf }">
          <span class="fe">{{ c.emoji }}</span>
          <span class="fi">
            <b>{{ c.name }}<em v-if="c.recommended"> ⭐</em></b>
            <small>
              <template v-if="c.native">🪶 native · </template><template v-if="c.marginal">🌡️ edge of zone · </template>year {{ c.yearsToFruit }} · {{ fmtWindow(c.harvest) }}
            </small>
          </span>
          <button class="rb plus" :class="{ undo: wasAdded(c) }" :aria-label="`Add ${c.name}`" @click="s.addFruit(c.id)">+</button>
        </li>
        <li v-if="!shown.length" class="empty">{{ q ? 'Nothing by that name grows well here.' : 'You have everything in this group already.' }}</li>
      </ul>
      <p v-if="nativesOnly" class="fine">This is a natives-only design, so only native species are offered.</p>
      <p class="fine">Plants shown here suit your zone, winter chill and climate. Your designer will check them against your soil, water and microclimate.</p>
    </aside>
  </Transition>
</template>
