<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fmtArea } from '~/utils/units'

// Save the forest you're exploring (answers + fruit edits) in this browser, and bring any saved forest back.
const s = useSurvey()
const name = ref('')
const canSave = computed(() => s.stage.value === 'explore' && !!s.site.value)
const updating = computed(() => !!s.currentSaveId.value && s.saves.value.some((x) => x.id === s.currentSaveId.value))
watch(() => s.ui.saves, (open) => {
  if (!open) return
  const cur = s.saves.value.find((x) => x.id === s.currentSaveId.value)
  name.value = cur?.name ?? s.suggestName()
}, { immediate: true })

const GOAL: Record<string, string> = { money: 'Money', yearRound: 'Year-round', natives: 'Natives', restoration: 'Restoration', rare: 'Rare fruit', timber: 'Timber' }
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const editCount = (o: Record<string, { add: string[]; remove: string[] }>) => Object.values(o).reduce((n, v) => n + v.add.length + v.remove.length, 0)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const emailOk = computed(() => EMAIL_RE.test(s.email.value.trim()))
const touched = ref(false)
async function save(asNew = false) {
  touched.value = true
  s.error.value = ''
  if (!emailOk.value) return
  await s.saveCurrent(name.value, asNew)
}
function close() {
  s.ui.saves = false
}
</script>

<template>
  <Transition name="pop">
    <div v-if="s.ui.saves" class="scrim center" @click.self="close">
      <article class="card designer savepanel">
        <button class="close" aria-label="Close" @click="close">✕</button>
        <p class="type">Saved on this device</p>
        <h2>Saved forests</h2>

        <form v-if="canSave" class="save-form" novalidate @submit.prevent="save(false)">
          <input v-model="name" class="field" maxlength="60" placeholder="Name this forest" aria-label="Forest name">
          <input v-model="s.email.value" class="field" type="email" inputmode="email" autocomplete="email" placeholder="Your email" aria-label="Your email" :aria-invalid="touched && !emailOk" required>
          <p v-if="touched && !emailOk" class="err">Please enter a valid email so we can keep your forest for you.</p>
          <p v-else-if="s.error.value" class="err">{{ s.error.value }}</p>
          <label class="optin">
            <input v-model="s.optIn.value" type="checkbox">
            <span>Send me food forest tips and updates (optional)</span>
          </label>
          <p class="fine">We use your email to follow up about your forest and, if you ask for one, connect you with a designer. We never share it. Reply “unsubscribe” any time.</p>
          <div class="row">
            <button class="btn btn-primary grow" :disabled="s.saving.value">{{ s.saving.value ? 'Saving…' : updating ? '💾 Update save' : '💾 Save this forest' }}</button>
            <button v-if="updating" type="button" class="chip" :disabled="s.saving.value" @click="save(true)">Save copy</button>
          </div>
        </form>
        <p v-else class="lede">Design a forest, then save it here to come back to it later.</p>

        <h3>{{ s.saves.value.length ? 'Your saves' : 'Nothing saved yet' }}</h3>
        <ul class="saved">
          <li v-for="sv in s.saves.value" :key="sv.id" :class="{ now: sv.id === s.currentSaveId.value }">
            <button class="open" @click="s.loadSave(sv.id)">
              <b>{{ sv.name }}</b>
              <small>
                Zone {{ sv.site.zoneLabel }} · {{ fmtArea(sv.areaM2, sv.unit) }} · {{ sv.goals.map((g) => GOAL[g] ?? g).join(' + ') }}<template v-if="editCount(sv.overrides)"> · ✏️ {{ editCount(sv.overrides) }} edits</template> · {{ when(sv.savedAt) }}
              </small>
            </button>
            <button class="rb minus" :aria-label="`Delete ${sv.name}`" @click="s.deleteSave(sv.id)">🗑</button>
          </li>
        </ul>
      </article>
    </div>
  </Transition>
</template>
