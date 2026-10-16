<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const s = useSurvey()
const detect = () => window.matchMedia('(max-width: 700px), (max-height: 480px)').matches
s.ui.mobile = detect()
const onResize = () => (s.ui.mobile = detect())
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <TresCanvas clear-color="#a8c8ff" window-size :antialias="true" :dpr="[1, s.ui.mobile ? 1.5 : 2]">
    <World />
  </TresCanvas>
</template>
