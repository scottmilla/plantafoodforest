<script setup lang="ts">
import { computed } from 'vue'
import { fmtLen, fmtMass, fmtMoney, MONTHS } from '~/utils/units'
import { yieldAt } from '~/utils/growth'

const s = useSurvey()
const d = computed(() => s.design.value)
const maxMonth = computed(() => Math.max(1, ...(d.value?.stats.harvestMonths ?? [1])))
const curve = computed(() => d.value?.stats.yieldByYear ?? [])
const maxKg = computed(() => Math.max(1, ...curve.value.map((y) => y.kg)))
const strata = computed(() => {
  const m = d.value?.stats.strataMix
  if (!m) return []
  const tot = Object.values(m).reduce((a, b) => a + b, 0) || 1
  return (['emergent', 'high', 'medium', 'low', 'ground'] as const).map((k) => ({ k, n: m[k], pct: (m[k] / tot) * 100 }))
})
const STRATA_COLOR = { emergent: '#5b4a9a', high: '#3f7fa8', medium: '#4fb852', low: '#ffcf4a', ground: '#ff9f7a' }
// this year's totals follow the slider
const thisYear = computed(() => {
  if (!d.value) return { kg: 0, usd: 0 }
  let kg = 0
  let usd = 0
  for (const sp of d.value.species) {
    const y = yieldAt(sp, s.year.value) * sp.count * d.value.plot.scale
    kg += y
    usd += y * (sp.pricePerKg ?? 0) * 0.6
  }
  return { kg, usd }
})
const species = computed(() => [...(d.value?.species ?? [])].sort((a, b) => b.count - a.count))
// the fruit, nut and berry plants are what people come for, so they lead the panel
const fruitTrees = computed(() => species.value.filter((sp) => sp.yieldKg > 0 && sp.form !== 'herb' && !sp.roles.includes('herb') && sp.roles.some((r) => r === 'fruit' || r === 'berry' || r === 'nut')))
const herbLayer = computed(() => species.value.filter((sp) => sp.roles.includes('herb')))
const mature = computed(() => curve.value.find((y) => y.year === 10) ?? curve.value[curve.value.length - 1])
</script>

<template>
  <Transition name="slide-r">
    <aside v-if="d && s.ui.system && s.stage.value === 'explore' && s.selected.value === null" class="system card">
      <button class="close" aria-label="Close" @click="s.ui.system = false">✕</button>
      <p class="type">Design {{ 'ABC'[s.active.value] }} · {{ s.model.value }}</p>
      <h2>{{ d.name }}</h2>
      <p class="tag">{{ d.tagline }}</p>

      <div class="money">
        <p class="money-label">Year {{ s.year.value }} harvest value</p>
        <p class="money-num">{{ fmtMoney(thisYear.usd) }}<small>/yr gross</small></p>
        <p class="money-sub">{{ fmtMass(thisYear.kg, s.imperial.value) }} of food<template v-if="mature && mature.year > s.year.value"> · growing to <b>{{ fmtMoney(mature.revenue) }}/yr</b> by year {{ mature.year }}</template></p>
      </div>

      <h3>Fruit trees planted</h3>
      <ul class="fruit-strip">
        <li v-for="sp in fruitTrees" :key="sp.id" :style="{ '--accent': sp.fruit ?? sp.leaf }" :title="sp.varieties.map((v) => v.name).join(', ')">
          <span class="fe">{{ sp.emoji }}</span>
          <span class="fn">{{ sp.name }}<small v-if="sp.varieties.length > 1">{{ sp.varieties.length }} varieties</small></span>
          <b>×{{ Math.round(sp.count * d.plot.scale).toLocaleString() }}</b>
        </li>
      </ul>

      <template v-if="herbLayer.length">
        <h3>Herb &amp; shrub layer</h3>
        <ul class="fruit-strip herb-strip">
          <li v-for="sp in herbLayer" :key="sp.id" :style="{ '--accent': sp.fruit ?? sp.leaf }">
            <span class="fe">{{ sp.emoji }}</span>
            <span class="fn">{{ sp.name }}</span>
            <b>×{{ Math.round(sp.count * d.plot.scale).toLocaleString() }}</b>
          </li>
        </ul>
      </template>

      <div class="stat-row">
        <div><b>{{ d.stats.plantCount.toLocaleString() }}</b><small>plants</small></div>
        <div><b>{{ d.stats.speciesCount }}</b><small>species</small></div>
        <div><b>{{ d.stats.varietyCount }}</b><small>varieties</small></div>
        <div><b>{{ fmtLen(d.stats.lineSpacingM, s.imperial.value) }}</b><small>between lines</small></div>
      </div>

      <h3>Harvest value by year</h3>
      <div class="bars yield" role="img" aria-label="Harvest value by year">
        <div v-for="y in curve" :key="y.year" class="bar-col" :class="{ now: y.year <= s.year.value }" :title="`Year ${y.year}: ${fmtMoney(y.revenue)} · ${fmtMass(y.kg, s.imperial.value)}`">
          <i :style="{ height: Math.max(3, (y.kg / maxKg) * 100) + '%' }" />
          <small>{{ y.year }}</small>
        </div>
      </div>

      <h3>Harvest calendar</h3>
      <div class="bars months" role="img" aria-label="Species in harvest by month">
        <div v-for="(n, i) in d.stats.harvestMonths" :key="i" class="bar-col" :class="{ now: i + 1 === s.env.value.month }" :title="`${n} species`">
          <i :style="{ height: Math.max(n ? 10 : 2, (n / maxMonth) * 100) + '%' }" />
          <small>{{ MONTHS[i] }}</small>
        </div>
      </div>

      <h3>Strata</h3>
      <div class="strata">
        <i v-for="st in strata" :key="st.k" :style="{ width: st.pct + '%', background: STRATA_COLOR[st.k] }" :title="`${st.k}: ${st.n}`" />
      </div>
      <p class="legend"><span v-for="st in strata" :key="st.k"><i :style="{ background: STRATA_COLOR[st.k] }" />{{ st.k }}</span></p>

      <h3>Why this design</h3>
      <ul class="why">
        <li v-for="(r, i) in d.rationale" :key="i">{{ r }}</li>
      </ul>

      <h3>Plant list</h3>
      <ul class="plist">
        <li v-for="sp in species" :key="sp.id">
          <span>{{ sp.emoji }} {{ sp.name }}<small v-if="sp.native"> 🪶</small><small v-if="sp.marginal"> 🌡️</small></span>
          <b>{{ Math.round(sp.count * d.plot.scale).toLocaleString() }}</b>
        </li>
      </ul>
      <p class="fine">Estimates for comparing designs, not promises. Yields assume good care; revenue assumes ~60% sold at retail-ish prices.</p>
    </aside>
  </Transition>
</template>
