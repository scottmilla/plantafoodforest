<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import {
  BufferGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, SphereGeometry, TubeGeometry, CatmullRomCurve3, Vector3, type Material,
} from 'three'
import type { Feature } from '#shared/types'

// The land itself: a staked, roped boundary sized to their answer, then (once designed) mulched beds,
// pond, swales and paths, all painted as soft glazes rather than hard-edged geometry.
const s = useSurvey()
const group = new Group()
const disposables: { dispose(): void }[] = []
const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x)

function ribbon(points: [number, number][], width: number, y: number) {
  const pos: number[] = []
  const idx: number[] = []
  points.forEach(([x, z], i) => {
    const [ax, az] = points[Math.max(0, i - 1)]!
    const [bx, bz] = points[Math.min(points.length - 1, i + 1)]!
    let dx = bx - ax
    let dz = bz - az
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    pos.push(x - dz * width / 2, y, z + dx * width / 2, x + dz * width / 2, y, z - dx * width / 2)
    if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2)
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return keep(g)
}
const glaze = (color: string, opacity: number) => keep(new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide }))
const solid = (color: string) => keep(new MeshStandardMaterial({ color, flatShading: true }))

function clear() {
  group.clear()
  disposables.splice(0).forEach((d) => d.dispose())
}

function addMesh(geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, rx = 0) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.x = rx
  group.add(m)
  return m
}

function build() {
  clear()
  const plot = s.plot.value
  if (!plot) return
  const { width: W, depth: D } = plot
  // ground glaze: three translucent washes, each a little smaller, so the edge feels painted
  ;[['#e9cf98', 0.5, 2.4], ['#d9b47e', 0.45, 0.8], ['#c99a6a', 0.35, -0.6]].forEach(([c, o, pad], i) => {
    addMesh(keep(new PlaneGeometry(W + (pad as number), D + (pad as number))), glaze(c as string, o as number), 0, 0.02 + i * 0.006, 0, -Math.PI / 2)
  })
  // stakes + rope
  const stakeGeo = keep(new CylinderGeometry(0.06, 0.08, 1.1, 6))
  const stakeMat = solid('#a2693a')
  const ropeMat = keep(new MeshStandardMaterial({ color: '#f2e6c8' }))
  const corners: [number, number][] = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [-W / 2, -D / 2]]
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]!
    const [bx, bz] = corners[i + 1]!
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / 8))
    const pts: Vector3[] = []
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n
      const z = az + ((bz - az) * k) / n
      if (k < n) addMesh(stakeGeo, stakeMat, x, 0.55, z)
      pts.push(new Vector3(x, 0.92, z))
      if (k < n) pts.push(new Vector3(x + (bx - ax) / n / 2, 0.8, z + (bz - az) / n / 2))
    }
    addMesh(keep(new TubeGeometry(new CatmullRomCurve3(pts), n * 6, 0.025, 4)), ropeMat)
  }

  const d = s.design.value
  if (!d) return
  for (const f of d.features) addFeature(f)
}

function addFeature(f: Feature) {
  if (f.kind === 'bed' && f.points) {
    addMesh(ribbon(f.points, 2.4, 0.045), glaze('#7a5232', 0.35))
    addMesh(ribbon(f.points, 1.4, 0.05), glaze('#5e3c22', 0.4))
  } else if (f.kind === 'path' && f.points) {
    addMesh(ribbon(f.points, 2.2, 0.06), glaze('#f6dba6', 0.75))
    addMesh(ribbon(f.points, 1.4, 0.065), glaze('#efc38f', 0.8))
  } else if (f.kind === 'swale' && f.points) {
    addMesh(ribbon(f.points, 1.6, 0.055), glaze('#5f87b8', 0.38))
    const berm = f.points.map(([x, z]) => new Vector3(x + 1.1, 0.12, z))
    addMesh(keep(new TubeGeometry(new CatmullRomCurve3(berm), berm.length * 2, 0.35, 5)), solid('#8a9a5a')).scale.y = 0.5
  } else if (f.kind === 'pond' && f.r) {
    ;[['#c9ecf0', 0.75, 1.5], ['#7fbfe0', 0.85, 1.15], ['#4f8fd0', 0.85, 0.85], ['#3a5ab0', 0.7, 0.5]].forEach(([c, o, k], i) => {
      addMesh(keep(new CircleGeometry(f.r! * (k as number), 40)), glaze(c as string, o as number), f.x, 0.07 + i * 0.005, f.z, -Math.PI / 2).scale.y = 0.82
    })
    const pad = keep(new CircleGeometry(0.6, 12))
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4
      const rr = f.r! * (0.3 + (i % 3) * 0.17)
      addMesh(pad, glaze(i % 3 ? '#5aa64a' : '#ffb6d0', 0.9), f.x + Math.cos(a) * rr, 0.1, f.z + Math.sin(a) * rr * 0.82, -Math.PI / 2)
    }
    const reed = keep(new CylinderGeometry(0.03, 0.05, 1.6, 4))
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + (i % 2) * 0.1
      addMesh(reed, solid(i % 4 ? '#7a9a4a' : '#8a6a3a'), f.x + Math.cos(a) * f.r! * 1.05, 0.8, f.z + Math.sin(a) * f.r! * 0.86)
    }
  } else if (f.kind === 'shed') {
    // a small rounded barn: soft forms, no hard right angles on the roof
    const g = new Group()
    g.position.set(f.x, 0, f.z)
    const walls = new Mesh(keep(new CylinderGeometry(2.6, 2.9, 2.6, 7)), solid('#e8c89a'))
    walls.position.y = 1.3
    const roof = new Mesh(keep(new SphereGeometry(3.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), solid('#b4503a'))
    roof.position.y = 2.5
    roof.scale.y = 0.62
    const door = new Mesh(keep(new SphereGeometry(1, 8, 6)), solid('#6a4a8a'))
    door.position.set(0, 0.9, 2.75)
    door.scale.set(0.8, 1.1, 0.2)
    g.add(walls, roof, door)
    group.add(g)
  }
}

watch([() => s.plot.value?.width, () => s.design.value], build, { immediate: true })
onBeforeUnmount(clear)
</script>

<template>
  <primitive :object="group" />
</template>
