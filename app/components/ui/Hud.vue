<script setup lang="ts">
import { computed } from 'vue'
import { fmtArea, fmtTemp } from '~/utils/units'

const s = useSurvey()
const clock = computed(() => {
  const h = s.env.value.hour
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`
})
// the tropics keep time by rain, not by leaf fall
const seasonText = computed(() => {
  const e = s.env.value
  if (e.lush) {
    const south = (s.site.value?.lat ?? 0) < 0
    const wet = south ? e.month >= 11 || e.month <= 4 : e.month >= 5 && e.month <= 10
    return wet ? '🌧️ rainy season' : '☀️ dry season'
  }
  return { spring: '🌸', summer: '🌻', autumn: '🍂', winter: '❄️' }[e.season] + ' ' + e.season
})
const climateName = computed(() => ({ tropical: 'Tropical', subtropical: 'Subtropical', mediterranean: 'Mediterranean', arid: 'Arid', temperate: 'Temperate', cold: 'Cold temperate' })[s.site.value?.climate ?? 'temperate'])
const night = computed(() => s.env.value.day < 0.2)
</script>

<template>
  <div class="hud">
    <!-- climate HUD -->
    <Transition name="slide">
      <section v-if="s.site.value" class="climate" :class="{ compact: s.ui.mobile && s.stage.value === 'explore' }">
        <p class="place">📍 {{ s.site.value.label }}</p>
        <p class="zone"><b>Zone {{ s.site.value.zoneLabel }}</b> · {{ climateName }}<small v-if="s.site.value.estimated" title="Climate archive unreachable; estimated from latitude"> (estimated)</small></p>
        <p class="now">
          {{ s.ui.forceDay ? '☀️' : s.env.value.icon }}
          <template v-if="s.weather.value && !s.ui.forceDay">{{ fmtTemp(s.weather.value.tempC, s.imperial.value) }} · {{ s.env.value.label }}</template>
          <template v-else>Daylight preview</template>
        </p>
        <p class="meta">{{ clock }} · <span class="season">{{ seasonText }}</span></p>
        <p class="meta hide-compact">{{ s.imperial.value ? Math.round(s.site.value.precipMm / 25.4) + ' in' : s.site.value.precipMm + ' mm' }} rain · {{ s.site.value.frostFreeDays }} frost-free days</p>
        <p v-if="s.areaM2.value" class="meta hide-compact">🌱 {{ fmtArea(s.areaM2.value, s.unit.value) }}</p>
        <button v-if="night || s.ui.forceDay" class="chip tiny" @click="s.ui.forceDay = !s.ui.forceDay">{{ s.ui.forceDay ? '🌙 Back to live sky' : '☀️ See it by day' }}</button>
      </section>
    </Transition>

    <!-- design toggle -->
    <nav v-if="s.stage.value === 'explore'" class="tabs" aria-label="Farm designs">
      <button v-for="(d, i) in s.designs.value" :key="d.id" class="tab" :class="{ on: i === s.active.value }" @click="s.pickDesign(i)">
        <small>Design {{ 'ABC'[i] }}</small>{{ d.name }}
      </button>
    </nav>

    <!-- tools -->
    <div v-if="s.stage.value === 'explore'" class="tools">
      <button class="chip" :class="{ on: s.ui.system }" @click="s.ui.system = !s.ui.system; s.ui.fruits = false">📊 System</button>
      <button class="chip" :class="{ on: s.ui.fruits }" @click="s.ui.fruits = !s.ui.fruits; s.ui.system = false">🍎 Fruits<b v-if="s.edited.value" class="dot" /></button>
      <button class="chip" :class="{ on: s.ui.birdseye }" @click="s.ui.birdseye = !s.ui.birdseye; s.selected.value = null">🦅 Bird's-eye</button>
      <button v-if="s.design.value?.tractor" class="chip" :class="{ on: s.ui.tractor }" @click="s.ui.tractor = !s.ui.tractor">🚜 {{ s.ui.tractor ? 'Hop off' : 'Tractor' }}</button>
      <div class="orbit" role="group" aria-label="Rotate the view">
        <button class="chip" aria-label="Rotate left" @pointerdown.prevent="s.input.rotL = true" @pointerup="s.input.rotL = false" @pointerleave="s.input.rotL = false" @pointercancel="s.input.rotL = false">◀</button>
        <button class="chip" :class="{ on: s.ui.autoOrbit }" aria-label="Slow auto-orbit" :aria-pressed="s.ui.autoOrbit" @click="s.ui.autoOrbit = !s.ui.autoOrbit">🎥</button>
        <button class="chip" aria-label="Rotate right" @pointerdown.prevent="s.input.rotR = true" @pointerup="s.input.rotR = false" @pointerleave="s.input.rotR = false" @pointercancel="s.input.rotR = false">▶</button>
      </div>
      <button class="chip" @click="s.ui.saves = true">💾 Save</button>
      <button class="chip" @click="s.restart()">↺ Goals</button>
    </div>

    <!-- succession timeline + CTA -->
    <div v-if="s.stage.value === 'explore'" class="bottom">
      <label class="timeline">
        <span>Year <b>{{ s.year.value }}</b></span>
        <input v-model.number="s.year.value" type="range" min="1" max="20" step="1" aria-label="Years after planting">
        <small class="for-mouse"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Q</kbd><kbd>E</kbd> or right-drag to spin · click a plant</small>
        <small class="for-touch">Tap to walk · ◀ ▶ to spin · tap a plant</small>
      </label>
      <button class="btn btn-primary cta" @click="s.ui.designer = true">🌳 Meet with a food forest designer</button>
    </div>

    <Transition name="toast"><div v-if="s.toast.value" class="toast">{{ s.toast.value }}</div></Transition>
  </div>
</template>
