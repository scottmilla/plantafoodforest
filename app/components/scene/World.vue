<script setup lang="ts">
import { swayUniforms } from '~/utils/plantGeo'

const s = useSurvey()
const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
  swayUniforms.uTime.value = elapsed
})
</script>

<template>
  <Atmosphere />
  <SkyDome />
  <Ground />
  <WildForest />
  <Plot />
  <FarmPlants />
  <SelectionMarker />
  <GroundTap />
  <Player />
  <CameraRig />
</template>
