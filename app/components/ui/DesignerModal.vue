<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { Lead } from '#shared/types'

const s = useSurvey()
const form = reactive({ name: '', email: '', phone: '', message: '' })
const state = ref<'form' | 'sending' | 'done'>('form')
const err = ref('')

async function send() {
  err.value = ''
  state.value = 'sending'
  const d = s.design.value
  const lead: Lead = {
    ...form, site: s.site.value, areaM2: s.areaM2.value || null, goals: s.goals.value, designId: d?.id, designName: d?.name, designSpecies: d?.species.filter((x) => x.yieldKg > 0).map((x) => `${x.name} ×${Math.round(x.count * d.plot.scale)}`),
  }
  try {
    await $fetch('/api/lead', { method: 'POST', body: lead })
    state.value = 'done'
  } catch (e: any) {
    err.value = e?.data?.statusMessage || 'Could not send. Please try again.'
    state.value = 'form'
  }
}
function close() {
  s.ui.designer = false
  if (state.value === 'done') state.value = 'form'
}
</script>

<template>
  <Transition name="pop">
    <div v-if="s.ui.designer" class="scrim center" @click.self="close">
      <article class="card designer">
        <button class="close" aria-label="Close" @click="close">✕</button>
        <template v-if="state !== 'done'">
          <p class="type">Free intro call</p>
          <h2>Meet with a food forest designer</h2>
          <p class="desc">
            A practitioner near {{ s.site.value?.label ?? 'you' }} will look at your
            <b>{{ s.design.value?.name ?? 'design' }}</b> with you and turn it into a planting plan for your actual soil, water and slope.
          </p>
          <form @submit.prevent="send">
            <input v-model="form.name" class="field" placeholder="Your name" required autocomplete="name">
            <input v-model="form.email" class="field" type="email" placeholder="Email" required autocomplete="email">
            <input v-model="form.phone" class="field" type="tel" placeholder="Phone / WhatsApp (optional)" autocomplete="tel">
            <textarea v-model="form.message" class="field" rows="3" placeholder="Anything we should know? Slope, water, timeline, dreams…" />
            <p v-if="err" class="err">{{ err }}</p>
            <button class="btn btn-primary wide" :disabled="state === 'sending'">{{ state === 'sending' ? 'Sending…' : 'Request my designer 🌳' }}</button>
          </form>
        </template>
        <template v-else>
          <div class="done">
            <div class="badge">🌱</div>
            <h2>The seed is planted</h2>
            <p class="desc">We'll be in touch at <b>{{ form.email }}</b> soon. Keep exploring your designs in the meantime.</p>
            <button class="btn btn-primary" @click="close">Back to my forest</button>
          </div>
        </template>
      </article>
    </div>
  </Transition>
</template>
