# Development guide

[Back to README](../README.md) · [Data reference](DATA.md) · [Contributing](../CONTRIBUTING.md)

## Requirements and setup

Use Node.js 24 and npm. The scheduled workflow uses Node.js 24, and the optional population script needs `node:sqlite`.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Cached data and map geometry are committed to the repository. Ingestion is optional for local setup.

## Commands

| Command | Purpose |
| --------- | --------- |
| `npm run dev` | Next.js development server with Turbopack |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the Next.js app |
| `npm start` | Serve the Next.js build in Node.js |
| `npm run preview` | Build with OpenNext and preview the Cloudflare Worker locally |
| `npm run deploy` | Build with OpenNext and deploy the Cloudflare Worker |

See the [data reference](DATA.md#ingestion) for ingestion and static map commands.

## Configuration

All application API credentials are optional. Core statistics, weather, maps, and transit use public sources.

| Variable | Purpose |
| ---------- | --------- |
| `OPENSKY_CLIENT_ID` | OpenSky OAuth client ID |
| `OPENSKY_CLIENT_SECRET` | OpenSky OAuth client secret |
| `YOUTUBE_API_KEY` | YouTube trending videos |

Without OpenSky credentials, flight tracking still works with unauthenticated access and an adsb.lol fallback. Without the YouTube key, trending videos show a fallback message.

The commented `MET_MALAYSIA_TOKEN` entry in [.env.example](../.env.example) is reserved for a future integration. Current code does not read it.

Use `.env.local` for local credentials. Keep secrets server-side; do not add a `NEXT_PUBLIC_` prefix.

## Architecture

```text
src/
├── app/                  # Dashboard, about page, and API routes
├── components/
│   ├── live/             # MapLibre map and layer controls
│   ├── map/              # Statistical map and metric selection
│   ├── sidebar/          # State briefs, breakdowns, and CCTV
│   ├── weather/          # Conditions, forecasts, warnings, and maps
│   ├── media/            # Live videos, trending videos, Reddit, and news
│   ├── ticker/           # News and rates
│   └── ui/               # Shared controls and layouts
└── lib/
    ├── data/             # Types, mappings, geometry, and ingested JSON cache
    ├── live/             # Tiles, wind, grid sampling, rail snapping, and towns
    ├── hooks/            # Flight and transit polling
    └── server/           # Shared edge cache and RSS helpers
scripts/
├── ingest.ts             # Main statistics pipeline
├── ingest-energy.ts      # Energy and water pipeline
├── ingest-bedutil.ts     # Hospital bed and ICU pipeline
├── build-rail-detail.ts  # Detailed rail geometry
└── build-population-hex.ts # Kontur population hexagons
__tests__/                # API and library tests
.github/workflows/        # Scheduled ingestion and deployment
```

**Data flow:**

- **Static data** (demographics, GDP, crime, etc.) is pre-fetched by the ingest scripts and cached as JSON. A GitHub Actions cron runs the ingest daily.
- **Live data** (weather, flights, CCTV, rates) is fetched at runtime through API routes. Shared caching uses the Cloudflare Cache API in production and a per-process cache in Node.js development. Hospital bed and ICU utilization is served from an ingested JSON snapshot.

## Production and deployment

### Node.js production server

```bash
npm run build
npm start
```

This serves the standard Next.js build. To check the production Cloudflare runtime, use the Worker preview below.

### Cloudflare Workers

The deployment uses [OpenNext configuration](../open-next.config.ts) and [Wrangler configuration](../wrangler.jsonc). The Worker entry and static assets are generated in `.open-next/`. Wrangler currently configures the Worker name as `pantaulah`; change it to your own name when deploying a fork.

Preview the Worker locally:

```bash
npm run preview
```

Before deploying, authenticate Wrangler for your own Cloudflare account:

```bash
npx wrangler login
```

If you use optional API credentials, configure them as Worker secrets. Each command prompts for its value:

```bash
npx wrangler secret put OPENSKY_CLIENT_ID
npx wrangler secret put OPENSKY_CLIENT_SECRET
npx wrangler secret put YOUTUBE_API_KEY
```

For a new Worker, deploy it once before adding secrets, then configure the keys for the features you use. Deploy a reviewed build with:

```bash
npm run deploy
```

The deploy command publishes to Cloudflare. It is not needed for local development or contribution checks.

### Scheduled ingestion and deployment

The [GitHub Actions workflow](../.github/workflows/ingest.yml) runs daily at 04:00 MYT. It requires repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for deployment. Application API credentials belong in the Worker secrets, not in committed configuration.

The workflow deploys when `data.json`, `energy-data.json`, or `bedutil.json` changes. Metadata-only updates are committed without deployment. A manual workflow run can force ingestion or request deployment even when data is unchanged.

## Dashboard screenshot

The README image is a capture of the running app at `/?tab=economy&metric=population`, stored in `docs/images/dashboard.png`.

To update it, run the app, open that URL in a desktop browser at 1440 × 900, wait for the map and statistics to load, and capture the viewport without browser chrome or development overlays. Keep the image optimized for repository browsing.
