<script setup lang="ts">
import { onBeforeUnmount, onMounted, unref } from 'vue'
import { Raycaster, Vector2, type Object3D } from 'three'
import { plantGrowth } from '~/utils/growth'
import { hash } from '~/utils/plantGeo'

// All tap/click input goes through one raycast we run ourselves on pointer down/up, so a bare finger tap
// (which never "hovers" first) always hits what's under it.
//  • tap a plant → open its card     • tap ground → walk there (hold + drag to steer)
const s = useSurvey()
const player = usePlayer()
const { camera, renderer, scene } = useTres()

const ray = new Raycaster()
const ndc = new Vector2()
let dragging = false
let orbiting = false
let lastX = 0
let pending: number | null = null
let startX = 0
let startY = 0
let dom: HTMLCanvasElement | null = null

function cast(e: PointerEvent) {
  const cam = unref(camera)
  if (!dom || !cam) return null
  const rect = dom.getBoundingClientRect()
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  ray.setFromCamera(ndc, cam)
  const targets: Object3D[] = []
  unref(scene).traverse((o) => {
    if (o.userData?.pick && o.visible) targets.push(o)
  })
  for (const hit of ray.intersectObjects(targets, false)) {
    const ud = hit.object.userData
    if (ud.pick === 'plant' && hit.instanceId != null) return { kind: 'plant' as const, id: (ud.ids as Int32Array)[hit.instanceId]!, point: hit.point }
    if (ud.pick === 'ground') return { kind: 'ground' as const, id: -1, point: hit.point }
  }
  return null
}

function walkTo(p: { x: number; z: number }) {
  const hw = Math.max((s.plot.value?.width ?? 0) / 2 + 14, 15)
  const hd = Math.max((s.plot.value?.depth ?? 0) / 2 + 14, 15)
  player.target = { x: Math.max(-hw, Math.min(hw, p.x)), z: Math.max(-hd, Math.min(hd, p.z)) }
}

function close() {
  s.selected.value = null
  player.focus = null
}

function down(e: PointerEvent) {
  if (e.button === 2 && s.stage.value !== 'intro') {
    orbiting = true // right-drag spins the view
    lastX = e.clientX
    return
  }
  if (e.button !== 0) return
  if (s.stage.value !== 'explore' || s.ui.designer) return
  startX = e.clientX
  startY = e.clientY
  const h = cast(e)
  pending = null
  if (h?.kind === 'plant') pending = h.id
  else if (h?.kind === 'ground') {
    if (s.selected.value !== null) close()
    else if (!s.ui.birdseye) {
      dragging = true
      walkTo(h.point)
    }
  } else if (s.selected.value !== null) close()
}
function move(e: PointerEvent) {
  if (orbiting) {
    player.yaw -= (e.clientX - lastX) * 0.006
    lastX = e.clientX
    return
  }
  if (!dragging) return
  const h = cast(e)
  if (h?.kind === 'ground') walkTo(h.point)
}
function up(e: PointerEvent) {
  orbiting = false
  dragging = false
  if (pending === null) return
  const id = pending
  pending = null
  if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) return // a drag, not a tap
  const d = s.design.value
  const p = d?.plants[id]
  if (!d || !p) return
  const sp = d.species[p.s]!
  player.focus = { x: p.x, z: p.z, h: sp.heightM * plantGrowth(sp, s.year.value, hash(id * 5 + 1)) }
  player.target = null
  s.input.forward = s.input.back = s.input.left = s.input.right = false
  s.ui.birdseye = false
  s.selected.value = id
}
const noMenu = (e: Event) => e.preventDefault()
function cancel() {
  orbiting = false
  dragging = false
  pending = null
}

onMounted(() => {
  if (import.meta.dev) (window as any).__pfCast = (x: number, y: number) => cast({ clientX: x, clientY: y } as PointerEvent)
  dom = unref(renderer)?.domElement ?? document.querySelector('canvas')
  dom?.addEventListener('contextmenu', noMenu)
  dom?.addEventListener('pointerdown', down)
  dom?.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
})
onBeforeUnmount(() => {
  dom?.removeEventListener('contextmenu', noMenu)
  dom?.removeEventListener('pointerdown', down)
  dom?.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', up)
  window.removeEventListener('pointercancel', cancel)
})
</script>

<template>
  <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, 0.001, 0]" :user-data="{ pick: 'ground' }">
    <TresPlaneGeometry :args="[400, 400]" />
    <TresMeshBasicMaterial :color-write="false" :depth-write="false" />
  </TresMesh>
</template>
