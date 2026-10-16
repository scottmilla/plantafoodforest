<script setup lang="ts">
import { computed } from 'vue'
import { fmtLen, fmtMass, fmtMoney, fmtWindow } from '~/utils/units'
import { yieldAt } from '~/utils/growth'

const s = useSurvey()
const player = usePlayer()
const plant = computed(() => (s.selected.value !== null ? s.design.value?.plants[s.selected.value] ?? null : null))
const sp = computed(() => (plant.value ? s.design.value!.species[plant.value.s]! : null))
const variety = computed(() => (plant.value?.v != null ? sp.value?.varieties[plant.value.v] ?? null : null))
const scale = computed(() => s.design.value?.plot.scale ?? 1)

const STRATA = { emergent: 'Emergent', high: 'High', medium: 'Medium', low: 'Low', ground: 'Ground' } as const
const SUCC = { placenta: 'Placenta (first years)', secondary: 'Secondary (5–40 yrs)', climax: 'Climax (long-lived)' } as const
const ROLE: Record<string, string> = { fruit: 'fruit', berry: 'berries', nut: 'nuts', timber: 'timber', support: 'support', nfix: 'nitrogen-fixer', biomass: 'biomass', flower: 'flowers', staple: 'staple food', wildlife: 'wildlife', medicinal: 'medicine', herb: 'herb' }

const nowYield = computed(() => (sp.value ? yieldAt(sp.value, s.year.value) : 0))
function close() {
  s.selected.value = null
  player.focus = null
}
</script>

<template>
  <Transition name="pop">
    <div v-if="sp && plant" class="scrim" @click.self="close">
      <article class="card plant" :style="{ '--accent': sp.fruit ?? sp.leaf }">
        <button class="close" aria-label="Close" @pointerup.stop.prevent="close" @click="close">✕</button>
        <header>
          <div class="badge">{{ sp.emoji }}</div>
          <div>
            <p class="type">{{ STRATA[sp.strata] }} stratum · {{ sp.roles.map((r) => ROLE[r]).join(', ') }}</p>
            <h2>{{ sp.name }}</h2>
            <p class="tag"><i>{{ sp.latin }}</i><template v-if="variety"> · ‘{{ variety.name }}’</template></p>
          </div>
        </header>
        <div class="pills">
          <span v-if="sp.native" class="pill good">🪶 Native here</span>
          <span v-if="sp.marginal" class="pill warm">🌡️ Zone-pusher</span>
          <span v-if="sp.pollard" class="pill">✂️ Pollarded</span>
          <span v-if="sp.invasive" class="pill bad">⚠️ Check local rules</span>
          <span class="pill">{{ SUCC[sp.succession] }}</span>
        </div>
        <p v-if="sp.note" class="desc">{{ sp.note }}</p>
        <dl class="facts">
          <div v-if="sp.yieldKg"><dt>First harvest</dt><dd>Year {{ sp.yearsToFruit }}</dd></div>
          <div v-if="sp.yieldKg"><dt>Mature yield</dt><dd>{{ fmtMass(sp.yieldKg, s.imperial.value) }} / plant</dd></div>
          <div v-if="sp.yieldKg"><dt>Harvest</dt><dd>{{ fmtWindow(variety?.harvest ?? sp.harvest) }}</dd></div>
          <div v-if="sp.yieldKg"><dt>In year {{ s.year.value }}</dt><dd>{{ nowYield ? fmtMass(nowYield, s.imperial.value) : 'growing…' }}</dd></div>
          <div><dt>Mature size</dt><dd>{{ fmtLen(sp.heightM, s.imperial.value) }} × {{ fmtLen(sp.widthM, s.imperial.value) }}</dd></div>
          <div><dt>In this design</dt><dd>{{ Math.round(sp.count * scale).toLocaleString() }} plants</dd></div>
          <div v-if="sp.yieldKg && sp.pricePerKg"><dt>All of them, mature</dt><dd>{{ fmtMass(sp.yieldKg * sp.count * scale, s.imperial.value) }} ≈ {{ fmtMoney(sp.yieldKg * sp.count * scale * sp.pricePerKg * 0.6) }}</dd></div>
          <div v-if="sp.varieties.length > 1" class="wide"><dt>Varieties staggered</dt><dd>{{ sp.varieties.map((v) => `${v.name} (${fmtWindow(v.harvest)})`).join(' · ') }}</dd></div>
        </dl>
        <p class="fine">Rough planning numbers. Your designer will tune them to your soil, water and market.</p>
      </article>
    </div>
  </Transition>
</template>
