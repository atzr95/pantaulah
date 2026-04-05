<p align="center">
  <img src="public/logo-256.png" alt="Pantaulah logo" width="128" />
</p>

<h1 align="center">PANTAULAH</h1>

<p align="center">
  <a href="https://pantaulah.com">pantaulah.com</a>
</p>

A fun side project, vibecoded into existence. Real-time intelligence dashboard for Malaysia — synthesizes government data across all 16 states and federal territories into an interactive choropleth map with 50+ metrics spanning economy, crime, health, transport, education, and energy.

Built with Next.js 16, React 19, D3-Geo, Tailwind CSS, and Recharts.

## Features

**Interactive Choropleth Map** — Click any state to view detailed intelligence briefs with sparkline trends, YoY changes, and sector breakdowns.

**50+ Government Metrics** across 6 categories:
- **Economy** — GDP, unemployment, CPI, trade balance, FDI, inflation, IPI
- **Crime** — Crime rate, assault/property breakdown, homicide, drug offences
- **Health** — Hospital beds, ICU utilization, blood donations, organ pledges, healthcare staff
- **Transport** — Car & motorcycle registrations, public transit ridership (rail + bus), live bus & KTM train positions
- **Education** — School enrolment, teachers, completion rates, literacy
- **Energy** — Electricity consumption by sector, generation by fuel type, water access

**Live Data Feeds:**
- Weather forecasts, warnings, earthquakes, and air quality
- Flood alerts from JPS InfoBanjir (river water levels with WASPADA/AMARAN/BAHAYA status)
- Highway CCTV from 24 expressway systems
- Live public transit map (KTMB trains, Rapid KL/Penang/Kuantan buses, MRT feeders, MyBAS nationwide)
- Rail line overlay (KTM Komuter, ETS, LRT, MRT, Monorail, KLIA Express/Transit)
- Flight tracker (Malaysia airspace)
- AIS vessel tracking (Straits of Malacca & Malaysian waters)
- Exchange rates, fuel prices, gold price (Kijang Emas), OPR
- News headlines

## Data Sources

All data is sourced from official Malaysian government APIs — no API keys required for core functionality.

| Source | Data | Update Frequency |
|--------|------|-----------------|
| [data.gov.my](https://developer.data.gov.my) | Demographics, GDP, crime, health, education, weather, fuel prices | Daily to annual |
| [DOSM](https://storage.dosm.gov.my) | Population estimates, GDP publications, crime publications | Annual |
| [BNM API](https://api.bnm.gov.my) | Exchange rates, OPR | Live |
| [Open-Meteo](https://open-meteo.com) | Current weather, air quality | Live (15min cache) |
| [MET Malaysia](https://api.met.gov.my) | Radar/satellite imagery | Live |
| [JPS InfoBanjir](https://publicinfobanjir.water.gov.my) | Flood alerts, river water levels | Live (5min cache) |
| [data.gov.my GTFS-RT](https://developer.data.gov.my/realtime-api/gtfs-realtime) | Public transit positions (bus & KTM) | Live (30s refresh) |
| [OpenStreetMap](https://www.openstreetmap.org) | Rail line routes (LRT, MRT, KTM, Monorail, ERL) | Static |
| [OpenSky Network](https://opensky-network.org) / [adsb.lol](https://adsb.lol) | Flight tracking | Live (60s refresh) |
| [AISStream](https://aisstream.io) | Vessel tracking (AIS) | Live (WebSocket) |
| [LLM.gov.my](https://www.llm.gov.my) | Highway CCTV feeds | Live (60s cache) |
| [MyEnergyStats](https://myenergystats.st.gov.my) | Electricity, generation, capacity | Annual |
| [KKMNow](https://data.gov.my) | Hospital bed/ICU utilization | Daily (1hr cache) |

## Data Freshness

Not all metrics update at the same pace — government datasets publish on different schedules. Here's what's current and what lags.

**Live (real-time):**
| Metric | Source | Notes |
|--------|--------|-------|
| Weather & air quality | Open-Meteo, MET Malaysia | 15-min cache |
| Flood alerts | JPS InfoBanjir | 5-min cache, scraped (no API) |
| Public transit (bus & KTM) | data.gov.my GTFS-RT | 30s refresh, 14 feeds (KTMB, Rapid KL/Penang/Kuantan, MRT feeders, MyBAS) |
| Flight tracking | OpenSky Network / adsb.lol | 60s refresh, OpenSky primary with adsb.lol fallback |
| Vessel tracking (AIS) | AISStream | WebSocket, live |
| Highway CCTV | LLM.gov.my | 60s cache |
| Exchange rates, OPR, gold price | BNM API | Live |
| Fuel prices | data.gov.my | Updated on price change |
| Bed & ICU utilization | KKMNow | Daily, 1hr cache |

**Monthly (via ingest):**
| Metric | Latest Data | Update Cycle |
|--------|------------|-------------|
| CPI | 2026 | Monthly |
| Exports, Imports, Trade Balance | 2026 | Monthly |
| Inflation, IPI | 2026 | Monthly |
| LEI, CEI (economic indicators) | 2026 | Monthly |
| Organ pledges, Blood donations | 2026 | Monthly |
| PEKA B40 screenings | 2026 | Monthly |
| Vehicle & motorcycle registrations | 2026 | Monthly |

**Annual (lags 1-2 years):**
| Metric | Latest Data | Notes |
|--------|------------|-------|
| GDP, GDP per capita | 2024 | DOSM publishes ~mid next year |
| Population | 2025 | DOSM estimates |
| Unemployment | 2025 | Quarterly from LFS |
| FDI | 2025 | Annual |
| Crime index, Crime rate | 2023 | DOSM publication, ~1-2yr lag |
| Drug addicts | 2023 | AADK data |
| Death rate, Birth rate | 2023 | Vital statistics |
| Doctors per 10K, Hospital beds per 10K | 2022 | MOH data |
| Homicide rate | 2022 | SDG indicator |
| Household income | 2022 | HIS survey (every 2 years) |
| Schools, Teachers, Enrolment | 2022 | MOE data |
| Student-teacher ratio | 2022 | MOE data |
| Completion rate, Literacy | 2022 | MOE/SDG data |
| Electricity consumption | 2024 | Peninsular only (no Sabah/Sarawak) |
| Water use, Water supply, Water access | 2022 | SPAN data |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/atzr95/pantaulah.git
cd pantaulah
npm install
cp .env.example .env.local
```

Edit `.env.local` with any optional API keys (see below).

### Run the Data Ingest

Fetch and cache government statistics locally:

```bash
npm run ingest        # Fetches stale tiers only (daily/monthly/annual)
npm run ingest:force  # Force re-fetch all data
npm run ingest:energy # Fetch energy & water data
```

The ingest script uses a tier system — it tracks when each tier was last fetched and only re-fetches stale data:

| Tier | Staleness | Datasets |
|------|-----------|----------|
| Daily | 1 day | Blood donations, organ pledges, PEKA B40, ridership |
| Monthly | 30 days | CPI, unemployment, trade, inflation, IPI, FDI, economic indicators |
| Annual | 90 days | Population, GDP, crime, education, health, transport |

### Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

## Environment Variables

All environment variables are **optional**. The dashboard works fully without any keys — live government APIs require no authentication.

```bash
# Flight tracking — OpenSky auth is optional (falls back to adsb.lol)
OPENSKY_CLIENT_ID=
OPENSKY_CLIENT_SECRET=

# Vessel tracking (free API key from aisstream.io)
NEXT_PUBLIC_AISSTREAM_API_KEY=

# Backup weather source (not required)
# MET_MALAYSIA_TOKEN=
```

See `.env.example` for details.

## Architecture

```
src/
├── app/
│   ├── page.tsx                          # Main dashboard
│   └── api/
│       ├── weather/                      # Forecasts, warnings, flood alerts, current conditions
│       ├── flights/                      # Flight data (OpenSky → adsb.lol fallback)
│       ├── transit/                      # Live bus & KTM positions (GTFS-RT)
│       ├── cctv/                         # Highway camera feeds
│       ├── ticker/                       # News, exchange rates, fuel prices
│       ├── health/bed-utilization/       # Hospital bed/ICU utilization
│       └── og/                           # Open Graph image
├── components/
│   ├── map/                              # Choropleth map, metric toggles
│   ├── sidebar/                          # State briefs, data cards, CCTV
│   ├── weather/                          # Weather views and panels
│   ├── ticker/                           # News ticker, rates bar
│   └── ui/                              # Shared UI (bottom sheet, top bar)
├── lib/
│   ├── data/
│   │   ├── cache/                        # Cached ingest data (JSON)
│   │   ├── types.ts                      # TypeScript interfaces
│   │   ├── choropleth.ts                 # Metric configs & tercile logic
│   │   ├── rail-lines.json               # Rail route geometry (OSM, Douglas-Peucker simplified)
│   │   ├── weather-types.ts              # Weather data types
│   │   └── data-gov-weather.ts           # Weather API fetchers + JPS flood scraper
│   └── hooks/
│       ├── use-flights.ts                # Flight polling hook
│       ├── use-vessels.ts                # AIS vessel WebSocket hook
│       └── use-transit.ts                # Bus & KTM transit polling hook
└── scripts/
    ├── ingest.ts                         # Main data pipeline
    └── ingest-energy.ts                  # Energy & water pipeline
```

**Data flow:**
- **Static data** (demographics, GDP, crime, etc.) is pre-fetched by the ingest scripts and cached as JSON. A GitHub Actions cron runs the ingest daily.
- **Live data** (weather, flights, CCTV, rates) is fetched at runtime through API routes with appropriate caching.

## Automated Data Updates

A GitHub Actions workflow (`.github/workflows/ingest.yml`) runs the ingest daily at 4 AM MYT. The script's tier system ensures only stale data is re-fetched. Changes are auto-committed to the cache directory.

## Testing

```bash
npm test             # Run once
npm run test:watch   # Watch mode
```

## API Improvement Recommendations

| Current API | Limitation | Recommended Upgrade |
|-------------|-----------|-------------------|
| **OpenSky Network / adsb.lol** (flights) | OpenSky times out from cloud IPs; adsb.lol has sparse feeder coverage in East Malaysia. Both are community-driven with no SLA. | [ADS-B Exchange](https://www.adsbexchange.com/data/) (paid, denser receivers) or [FlightRadar24](https://www.flightradar24.com) (paid, satellite ADS-B via Aireon for oceanic coverage). |
| **AISStream** (vessels) | Free tier may have message rate limits and limited historical playback. | [MarineTraffic API](https://www.marinetraffic.com/en/ais-api-services) for commercial-grade vessel tracking with richer metadata (vessel type, cargo, port calls). |
| **Open-Meteo** (weather) | Community-driven; no SLA, occasional gaps in Malaysian station data. | [MET Malaysia API](https://api.met.gov.my) (already partially integrated) for authoritative local forecasts, or [OpenWeatherMap](https://openweathermap.org/api) for global coverage with paid tiers. |
| **JPS InfoBanjir** (floods) | No public API; data is scraped from server-rendered HTML. Parsing may break if page structure changes. | A proper REST API from JPS or inclusion in [data.gov.my](https://data.gov.my) would eliminate scraping fragility. |

## License

MIT
