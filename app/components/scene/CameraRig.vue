<script setup lang="ts">
import { ref } from 'vue'
import { Vector3 } from 'three'

const s = useSurvey()
const player = usePlayer()
const cam = ref<any>(null)
const look = new Vector3()
const want = new Vector3()
let ready = false

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  const c = cam.value
  if (!c) return
  const k = 1 - Math.pow(0.003, Math.min(delta, 0.1)) // frame-rate independent ease

  // keep roughly the same horizontal view on tall phone screens by widening the vertical FOV
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1)
  const fov = aspect < 1 ? Math.min(90, 55 + (1 - aspect) * 60) : 55
  if (Math.abs(c.fov - fov) > 0.05) {
    c.fov = fov
    c.updateProjectionMatrix()
  }
  const plot = s.plot.value
  const W = plot?.width ?? 20
  const D = plot?.depth ?? 20
  const stage = s.stage.value

  if (stage === 'intro') {
    // title: low and close, the character faces us with the wild forest behind
    want.set(player.x + 1.4, 1.9, player.z + 5.6)
    look.set(player.x, 3.0, player.z - 2)
  } else if (!plot) {
    // in the clearing, before any land is staked: stand back and take in the forest
    want.set(player.x, 4.5, player.z + 11)
    look.set(player.x, 3.5, player.z - 10)
  } else if (s.ui.birdseye || stage === 'land' || stage === 'goals' || stage === 'designing') {
    // rise up so the whole piece of land (and later the design) reads at once
    const span = Math.max(W, D * 1.2)
    const h = Math.max(16, span * 0.62 + 8)
    // on a phone the survey card covers the lower ~60% of the screen: slide the view south so the land sits in the strip above it
    const dz = s.ui.mobile && stage !== 'explore' ? span * 0.42 : 0
    want.set(s.ui.mobile ? 0 : -W * 0.08, h, D / 2 + Math.max(14, span * 0.45) + dz)
    look.set(s.ui.mobile ? 0 : -W * 0.08, 0, D * 0.05 + dz)
  } else if (s.selected.value !== null && player.focus) {
    const f = player.focus
    const back = Math.max(7, f.h * 1.15 + 4)
    want.set(f.x + (s.ui.mobile ? 0 : back * 0.35), Math.max(3, f.h * 0.75 + 1.5), f.z + back)
    look.set(f.x + (s.ui.mobile ? 0 : back * 0.22), f.h * (s.ui.mobile ? 0.25 : 0.5), f.z)
  } else {
    const t = s.ui.tractor ? 1.35 : 1
    want.set(player.x, 5.2 * t, player.z + 9.5 * t)
    look.set(player.x, 2.2, player.z - 5)
  }
  if (!ready) {
    c.position.copy(want)
    ready = true
  } else {
    c.position.lerp(want, k)
  }
  const cur = (c.userData.look ??= look.clone()) as Vector3
  cur.lerp(look, k)
  c.lookAt(cur)
})
</script>

<template>
  <TresPerspectiveCamera ref="cam" :position="[1.4, 1.9, 22]" :fov="55" :near="0.1" :far="600" make-default />
</template>
