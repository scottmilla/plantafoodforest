// Non-reactive, mutated every frame by Player and read by CameraRig.
// `target` is where a tap/click told the character to walk (null when idle).
const player = {
  x: 0, z: 16, facing: Math.PI, moving: false,
  target: null as { x: number; z: number } | null,
  focus: null as { x: number; z: number; h: number } | null,
}

export function usePlayer() {
  return player
}
