<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const s = useSurvey()
const player = usePlayer()

const root = ref<any>(null)
const body = ref<any>(null)
const legL = ref<any>(null)
const legR = ref<any>(null)
const armL = ref<any>(null)
const armR = ref<any>(null)
const ring = ref<any>(null)
const wheels = ref<any[]>([])
const smoke = ref<any>(null)

const keyMap: Record<string, 'forward' | 'back' | 'left' | 'right'> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
}
const canMove = () => s.stage.value !== 'intro' && s.selected.value === null && !s.ui.designer
function onKey(down: boolean) {
  return (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
    if (e.code === 'Escape' && down) {
      s.selected.value = null
      player.focus = null
      return
    }
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      if (s.stage.value !== 'intro') s.input[e.code === 'KeyQ' ? 'rotL' : 'rotR'] = down
      return
    }
    const k = keyMap[e.code]
    if (!k) return
    e.preventDefault()
    if (down && !canMove()) return
    s.input[k] = down
  }
}
const kd = onKey(true)
const ku = onKey(false)
onMounted(() => {
  window.addEventListener('keydown', kd)
  window.addEventListener('keyup', ku)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', kd)
  window.removeEventListener('keyup', ku)
})

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function bounds() {
  const p = s.plot.value
  const hw = (p?.width ?? 0) / 2 + 14
  const hd = (p?.depth ?? 0) / 2 + 14
  return { hw: Math.max(hw, 15), hd: Math.max(hd, 15) }
}

const { onBeforeRender } = useLoop()
let walk = 0
let lastPlotW = -1
onBeforeRender(({ delta, elapsed }) => {
  const dt = Math.min(delta, 0.05)
  // when the land appears, step back to its southern edge so it's all in front of us
  const pw = s.plot.value?.width ?? 0
  if (pw !== lastPlotW) {
    if (s.plot.value) {
      player.x = 0
      player.z = s.plot.value.depth / 2 + 5
      player.target = null
    }
    lastPlotW = pw
  }
  const i = s.input
  let dx = (i.right ? 1 : 0) - (i.left ? 1 : 0)
  let dz = (i.back ? 1 : 0) - (i.forward ? 1 : 0)
  if (dx !== 0 || dz !== 0) {
    player.target = null
    // W always means "away from the screen", however the view has been spun
    const yaw = s.stage.value === 'intro' ? 0 : player.yaw
    const c = Math.cos(yaw)
    const sn = Math.sin(yaw)
    ;[dx, dz] = [dx * c + dz * sn, -dx * sn + dz * c]
  }
  const tgt = player.target
  if (tgt && !(dx !== 0 || dz !== 0)) {
    const tx = tgt.x - player.x
    const tz = tgt.z - player.z
    if (Math.hypot(tx, tz) < 0.25) player.target = null
    else {
      dx = tx
      dz = tz
    }
  }
  const active = canMove() && (dx !== 0 || dz !== 0)
  const speed = s.ui.tractor ? 11 : 6
  if (active) {
    const len = Math.hypot(dx, dz)
    dx /= len
    dz /= len
    const b = bounds()
    player.x = Math.max(-b.hw, Math.min(b.hw, player.x + dx * speed * dt))
    player.z = Math.max(-b.hd, Math.min(b.hd, player.z + dz * speed * dt))
    player.facing = lerpAngle(player.facing, Math.atan2(-dx, -dz), s.ui.tractor ? 0.08 : 0.2)
  }
  if (s.stage.value === 'intro') player.facing = Math.PI
  else if (!active && !player.moving && s.stage.value !== 'explore') player.facing = lerpAngle(player.facing, 0, 0.05)
  player.moving = active

  walk += dt * (active ? 11 : 0)
  const swing = active && !s.ui.tractor ? Math.sin(walk) * 0.7 : 0
  if (legL.value) legL.value.rotation.x = s.ui.tractor ? -1.2 : swing
  if (legR.value) legR.value.rotation.x = s.ui.tractor ? -1.2 : -swing
  if (armL.value) armL.value.rotation.x = s.ui.tractor ? -1.0 : -swing * 0.8
  if (armR.value) armR.value.rotation.x = s.ui.tractor ? -1.0 : swing * 0.8
  if (body.value) {
    body.value.position.y = s.ui.tractor ? 0.95 + Math.sin(elapsed * 18) * 0.02 : active ? Math.abs(Math.sin(walk)) * 0.1 : Math.sin(elapsed * 2) * 0.025
    body.value.position.z = s.ui.tractor ? 0.35 : 0
  }
  wheels.value.forEach((w) => w && (w.rotation.x -= active ? dt * speed * 1.2 : 0))
  if (smoke.value) {
    smoke.value.position.y = 3.2 + ((elapsed * 1.5) % 1.2)
    smoke.value.scale.setScalar(0.25 + ((elapsed * 1.5) % 1.2) * 0.3)
  }
  if (ring.value) {
    ring.value.visible = !!player.target
    if (player.target) {
      ring.value.position.set(player.target.x, 0.08, player.target.z)
      ring.value.scale.setScalar(1 + Math.sin(elapsed * 6) * 0.15)
    }
  }
  if (root.value) {
    root.value.position.set(player.x, 0, player.z)
    root.value.rotation.y = player.facing
  }
})
</script>

<template>
  <!-- tap destination marker -->
  <TresMesh ref="ring" :rotation="[-Math.PI / 2, 0, 0]" :visible="false">
    <TresRingGeometry :args="[0.3, 0.45, 28]" />
    <TresMeshBasicMaterial color="#fff3cf" :transparent="true" :opacity="0.9" :depth-write="false" :tone-mapped="false" />
  </TresMesh>

  <TresGroup ref="root" :position="[0, 0, 16]">
    <TresMesh :position="[0, 0.03, 0]" :rotation="[-Math.PI / 2, 0, 0]">
      <TresCircleGeometry :args="[s.ui.tractor ? 1.6 : 0.7, 16]" />
      <TresMeshBasicMaterial color="#5b4a9a" :transparent="true" :opacity="0.35" />
    </TresMesh>

    <!-- tractor: a little round-shouldered red machine (front is -z) -->
    <TresGroup :visible="s.ui.tractor">
      <TresMesh :position="[0, 1.05, 0.2]" :scale="[1, 0.75, 1.5]">
        <TresSphereGeometry :args="[0.95, 14, 10]" />
        <TresMeshStandardMaterial color="#d94b3b" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 1.15, -1.0]" :scale="[0.8, 0.65, 1.1]">
        <TresSphereGeometry :args="[0.75, 12, 8]" />
        <TresMeshStandardMaterial color="#e8604a" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0.4, 2.3, -1.25]">
        <TresCylinderGeometry :args="[0.08, 0.1, 1.2, 6]" />
        <TresMeshStandardMaterial color="#4a3a3a" />
      </TresMesh>
      <TresMesh ref="smoke" :position="[0.4, 3.2, -1.25]">
        <TresIcosahedronGeometry :args="[1, 0]" />
        <TresMeshStandardMaterial color="#f4f0ff" :transparent="true" :opacity="0.6" :flat-shading="true" />
      </TresMesh>
      <!-- rounded canopy roof on four posts -->
      <TresMesh v-for="(p, i) in [[-0.7, 0.55], [0.7, 0.55], [-0.7, 1.4], [0.7, 1.4]]" :key="'post' + i" :position="[p[0]!, 2.3, p[1]!]">
        <TresCylinderGeometry :args="[0.05, 0.05, 1.6, 5]" />
        <TresMeshStandardMaterial color="#3b2a1a" />
      </TresMesh>
      <TresMesh :position="[0, 3.15, 0.95]" :scale="[1, 0.22, 1]">
        <TresSphereGeometry :args="[1.05, 12, 8]" />
        <TresMeshStandardMaterial color="#ffcf4a" :flat-shading="true" />
      </TresMesh>
      <!-- big rear wheels, small front wheels -->
      <TresGroup v-for="(w, i) in [[-1.05, 0.75, 0.75, 0.75], [1.05, 0.75, 0.75, 0.75], [-0.85, 0.42, -1.25, 0.42], [0.85, 0.42, -1.25, 0.42]]" :key="'wh' + i" :ref="(el: any) => (wheels[i] = el)" :position="[w[0]!, w[1]!, w[2]!]">
        <TresMesh :rotation="[0, 0, Math.PI / 2]">
          <TresCylinderGeometry :args="[w[3]!, w[3]!, 0.36, 12]" />
          <TresMeshStandardMaterial color="#2f2a2a" :flat-shading="true" />
        </TresMesh>
        <TresMesh :rotation="[0, 0, Math.PI / 2]">
          <TresCylinderGeometry :args="[w[3]! * 0.5, w[3]! * 0.5, 0.4, 8]" />
          <TresMeshStandardMaterial color="#ffcf4a" :flat-shading="true" />
        </TresMesh>
      </TresGroup>
    </TresGroup>

    <TresGroup ref="body">
      <!-- legs -->
      <TresGroup ref="legL" :position="[-0.17, 0.62, 0]">
        <TresMesh :position="[0, -0.28, 0]">
          <TresCapsuleGeometry :args="[0.11, 0.34, 4, 8]" />
          <TresMeshStandardMaterial color="#3b5fa8" :flat-shading="true" />
        </TresMesh>
        <TresMesh :position="[0, -0.56, -0.05]" :scale="[1, 0.65, 1.5]">
          <TresSphereGeometry :args="[0.17, 10, 8]" />
          <TresMeshStandardMaterial color="#5b3a1e" :flat-shading="true" />
        </TresMesh>
      </TresGroup>
      <TresGroup ref="legR" :position="[0.17, 0.62, 0]">
        <TresMesh :position="[0, -0.28, 0]">
          <TresCapsuleGeometry :args="[0.11, 0.34, 4, 8]" />
          <TresMeshStandardMaterial color="#3b5fa8" :flat-shading="true" />
        </TresMesh>
        <TresMesh :position="[0, -0.56, -0.05]" :scale="[1, 0.65, 1.5]">
          <TresSphereGeometry :args="[0.17, 10, 8]" />
          <TresMeshStandardMaterial color="#5b3a1e" :flat-shading="true" />
        </TresMesh>
      </TresGroup>
      <!-- torso + overalls bib -->
      <TresMesh :position="[0, 1.0, 0]">
        <TresCapsuleGeometry :args="[0.34, 0.4, 4, 10]" />
        <TresMeshStandardMaterial color="#ff7a59" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 0.92, -0.3]" :scale="[1.0, 1.0, 0.3]">
        <TresSphereGeometry :args="[0.22, 12, 10]" />
        <TresMeshStandardMaterial color="#3b5fa8" :flat-shading="true" />
      </TresMesh>
      <!-- arms -->
      <TresGroup ref="armL" :position="[-0.46, 1.25, 0]">
        <TresMesh :position="[0, -0.25, 0]">
          <TresCapsuleGeometry :args="[0.1, 0.34, 3, 6]" />
          <TresMeshStandardMaterial color="#ff7a59" :flat-shading="true" />
        </TresMesh>
      </TresGroup>
      <TresGroup ref="armR" :position="[0.46, 1.25, 0]">
        <TresMesh :position="[0, -0.25, 0]">
          <TresCapsuleGeometry :args="[0.1, 0.34, 3, 6]" />
          <TresMeshStandardMaterial color="#ff7a59" :flat-shading="true" />
        </TresMesh>
      </TresGroup>
      <!-- head, eyes (front is -z), cheeks, hair, straw hat -->
      <TresMesh :position="[0, 1.78, 0]">
        <TresSphereGeometry :args="[0.46, 20, 16]" />
        <TresMeshStandardMaterial color="#ffd9b3" />
      </TresMesh>
      <TresMesh :position="[-0.16, 1.82, -0.41]" :scale="[1, 1.3, 0.6]">
        <TresSphereGeometry :args="[0.06, 8, 8]" />
        <TresMeshBasicMaterial color="#2b1b12" />
      </TresMesh>
      <TresMesh :position="[0.16, 1.82, -0.41]" :scale="[1, 1.3, 0.6]">
        <TresSphereGeometry :args="[0.06, 8, 8]" />
        <TresMeshBasicMaterial color="#2b1b12" />
      </TresMesh>
      <TresMesh :position="[-0.28, 1.7, -0.36]" :scale="[1, 0.7, 0.4]">
        <TresSphereGeometry :args="[0.07, 8, 8]" />
        <TresMeshBasicMaterial color="#ff9d9d" />
      </TresMesh>
      <TresMesh :position="[0.28, 1.7, -0.36]" :scale="[1, 0.7, 0.4]">
        <TresSphereGeometry :args="[0.07, 8, 8]" />
        <TresMeshBasicMaterial color="#ff9d9d" />
      </TresMesh>
      <TresMesh :position="[0, 1.95, 0.22]">
        <TresSphereGeometry :args="[0.34, 12, 10]" />
        <TresMeshStandardMaterial color="#6b3e22" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 2.1, 0]">
        <TresCylinderGeometry :args="[0.78, 0.78, 0.07, 18]" />
        <TresMeshStandardMaterial color="#f2cf6b" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 2.3, 0]">
        <TresCylinderGeometry :args="[0.34, 0.42, 0.4, 14]" />
        <TresMeshStandardMaterial color="#f2cf6b" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 2.22, 0]">
        <TresCylinderGeometry :args="[0.43, 0.43, 0.1, 14]" />
        <TresMeshStandardMaterial color="#d94b4b" :flat-shading="true" />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>
