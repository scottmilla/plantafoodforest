# Plant a Food Forest

A 3D sales survey for syntropic food forest practitioners. A visitor answers three questions, then walks around 2–3 food forest designs generated for their climate, land and goals. When they're excited, they hit **Meet with a food forest designer** and the lead lands in your inbox.

Built like Cosmic Cross Farm: Nuxt 4 (SPA), TresJS/three.js, Fondamento + Alegreya, watercolour/lasur styling. Deploys to Vercel.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # design-model tests
```

## The funnel

1. **Where?** Postal code (or town, for places that barely use postcodes) → `/api/place`
   - location: zippopotam.us, falling back to OpenStreetMap Nominatim
   - climate: 10 years of daily history from Open-Meteo's archive → USDA zone, rain, frost-free days, chill hours, dry months, climate class, native-flora region
   - right now: Open-Meteo's forecast → today's sky, time of day, rain/snow, season
   - The HUD (top left) shows it all. The visitor spawns into a nondescript forest dressed for their climate and season.
2. **How much land?** Buckets plus an exact entry, in acres, hectares or manzanas (defaulting by country). The plot is staked out at true scale. Farms over ~5 acres render a representative 2 ha block and scale the numbers.
3. **Two goals, ranked.** Money, year-round fruit, natives only, restoration/guests, rare fruit/zone pushing, timber → `/api/design`.

Then they explore: toggle designs at the top, walk (WASD or tap), click any plant for its card, open 📊 System for whole-design stats, scrub the **Year** slider to watch succession (placenta crops fade out, climax trees close in), switch to bird's-eye, and in money designs ride the tractor 🚜.

## The in-house model: `server/model/`

"Syntropic Sage" is our own design model. It's served at `POST /api/design` inside the Nuxt app (a Vercel function), and it's deliberately a transparent rule-and-score model, not a neural net. Same input → same design, and every choice is explainable (the "Why this design" list comes straight from it).

| File | What it is |
| --- | --- |
| `species.ts` | The knowledge base: ~140 species with strata, succession stage, form, zone range, chill, drought tolerance, native regions, years to fruit, yield, harvest window, price and cultivar lists for season-stretching. **This is where practitioners add value: add your species and varieties here.** |
| `climate.ts` | USDA zone math, the climate summary, climate class, native region by lat/lon |
| `engine.ts` | The pipeline: climate filter → goal scoring → strata pools → line/contour layout → yield projection → rationale |

How each goal shapes a design (goal 1 decides the layout; goal 2 nudges species choice):

- **Money: Market Alley.** One target tree and one berry, the fastest-to-cash pair that fits. Pollarded support (black locust, eucalyptus, gliricidia…) between them, never shading the crop. 8–12 m alleys, one variety each, and a tractor.
- **Year-round: Twelve-Month Larder.** Picks species and cultivars greedily to cover the most harvest months, mixing year 1–2 producers with long-lived high-value trees. 4.5 m lines, dense spacing.
- **Natives: Native Tapestry.** Native-only, still stacked through every stratum. Fewer varieties, more layers.
- **Restoration: Living Watershed.** Contour-curved lines, swales, a pond, a guest path. Favours natives, wildlife and N-fixers, and lets vigorous pioneers in (flagged).
- **Rare / zone pushing: Edge of the Zone.** Allows species up to a zone warmer than the site (cold-hardy citrus, olive, loquat, feijoa in 7b/8a), combined with season-stretching.
- **Timber: Timber Succession.** Fast support trees training hardwoods; wider lines.

Strata follow Götsch: emergent ~20% / high ~40% / medium ~60% / low ~80% occupancy, set here as in-line spacings of roughly 16 / 8 / 4 / 2 m, plus ground cover. How many strata a design stacks depends on climate: all five in the tropics, fewer toward the poles and on small lots.

**Growing it into a "real" model later:** keep the `DesignRequest → DesignResponse` contract in `shared/types.ts`. Designs your designers actually install (from leads) become labelled training data. Swap the scoring step (`goalScore`) for a learned ranker first, and the rest of the pipeline stays. To run it as a separate service, move `server/model/` into its own package and point `/api/design` at it.

## Leads

`POST /api/lead` emails you via [Resend](https://resend.com) with everything needed to match a designer later (location, zone, climate, area, ranked goals, the design they liked, contact info). Copy `.env.example` → `.env` and set:

```
NUXT_RESEND_API_KEY=re_...
NUXT_LEAD_TO_EMAIL=you@example.com
```

Without a key, leads are only logged to the server console.

## Email list

Saving a forest asks for an email (once, then remembered on that device) plus an optional "send me tips" checkbox. `POST /api/subscribe` emails you a **"New subscriber"** note (their email, whether they opted in, where they are, what they built). Your inbox is the list: search for "New subscriber", and filter on "opted in" for anyone you can send newsletters to. Their save itself always works on their own device, whether or not the email goes out.

There's deliberately no database. Vercel functions can't keep files between runs (so SQLite or a `.txt` file would lose data), and this avoids running one. If the list outgrows an inbox, the next step is adding each address to a Resend Audience in the same endpoint (one extra API call).

Emails are sent with [Resend](https://resend.com), the same as designer requests, via `server/utils/mail.ts`.

## Deploy (Vercel)

Import the repo in Vercel; Nuxt is auto-detected. Add the env vars above under Project → Settings → Environment Variables.

## Caveats

- Yields, prices and years-to-fruit are rough planning numbers for comparing designs. Have practitioners tune `species.ts`.
- Native regions are coarse continental buckets.
- If the climate archive is unreachable, the zone is estimated from latitude and marked "(estimated)" in the HUD.
