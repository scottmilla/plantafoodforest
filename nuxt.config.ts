export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@tresjs/nuxt'],
  ssr: false,
  components: [{ path: '~/components', pathPrefix: false }],
  css: ['~/assets/css/main.css'],
  vite: {
    // keep a single copy of three across TresJS and our own imports (avoids blank scenes after dep re-optimization)
    resolve: { dedupe: ['three', 'vue'] },
    optimizeDeps: { include: ['three', '@tresjs/core', 'three/examples/jsm/utils/BufferGeometryUtils.js'] },
  },
  devtools: { enabled: false },
  // Override with NUXT_* env vars (see .env.example).
  runtimeConfig: {
    resendApiKey: '', // NUXT_RESEND_API_KEY — leads are emailed through Resend when set
    leadToEmail: '', // NUXT_LEAD_TO_EMAIL — where "Meet with a designer" requests go
    leadFromEmail: 'Plant a Food Forest <onboarding@resend.dev>', // NUXT_LEAD_FROM_EMAIL
  },
  app: {
    head: {
      title: 'Plant a Food Forest',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Alegreya:wght@400;500;700&family=Fondamento&display=swap' },
      ],
    },
  },
})
