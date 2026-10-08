# Data reference

[Back to README](../README.md) · [Development guide](DEVELOPMENT.md)

## Sources

Government sources are used where available. Live third-party sources are listed below. No API keys are required for core functionality.

| Source | Data | Source Publication / Snapshot |
| -------- | ------ | ----------------- |
| [data.gov.my](https://developer.data.gov.my) | Demographics, GDP, crime, health, education, weather, fuel prices | Daily to annual |
| [DOSM](https://storage.dosm.gov.my) | Population estimates, GDP publications, crime publications | Annual |
| [BNM API](https://api.bnm.gov.my) | Exchange rates, OPR | Published rates and policy decisions |
| [Open-Meteo](https://open-meteo.com) | Current weather, air quality | Current conditions; app cache varies by endpoint |
| [MET Malaysia](https://api.met.gov.my) | Radar/satellite imagery | Radar/satellite images |
| [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/fdsnws/event/1/) | Regional seismic activity (M5.0+ within 3,000 km) | Event-driven |
| [JPS InfoBanjir](https://publicinfobanjir.water.gov.my) | Flood alerts, river water levels | River-level observations |
| [data.gov.my GTFS-RT](https://developer.data.gov.my/realtime-api/gtfs-realtime) | Public transit positions (bus & KTM) | Vehicle position updates |
| [OpenStreetMap](https://www.openstreetmap.org) | Rail line routes (LRT, MRT, KTM, Monorail, ERL); detailed ~6 m version for the live map via `scripts/build-rail-detail.ts` | Static |
| [Natural Earth](https://www.naturalearthdata.com) via world-atlas | Neighbouring land outlines around Malaysia (map context) | Static |
| [OpenSky Network](https://opensky-network.org) / [adsb.lol](https://adsb.lol) | Flight tracking | Aircraft position updates |
| [LLM.gov.my](https://www.llm.gov.my) | Highway CCTV feeds; live stills proxied via `/api/cctv/image` | Camera stills; available highways vary |
| [MyEnergyStats](https://myenergystats.st.gov.my) | Electricity, generation, capacity | Annual |
| [KKMNow](https://data.gov.my) | Hospital bed/ICU utilization | Daily |
| [OpenFreeMap](https://openfreemap.org) | Live map vector basemap + 3D building heights | Static |
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) | Live map 3D terrain (Terrarium) | Static |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Satellite basemap (sharp to street level) | Periodic |
| [RainViewer](https://www.rainviewer.com/api.html) | Rain radar frames (rewindable) | Radar frames |
| [Open-Meteo forecast + air quality](https://open-meteo.com) (PM2.5 from [CAMS](https://atmosphere.copernicus.eu)) | Wind particles, cloud and PM2.5 blobs (0.75° grid, 24h) | Hourly forecast values |
| [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) | Haze (MODIS AOD), night lights (Black Marble) | Daily |
| [adsbdb](https://www.adsbdb.com) | Flight route / airline lookup on click | Route lookup |
| [Kontur Population](https://data.humdata.org/dataset/kontur-population-malaysia) | Population hexagons (H3 res 5, from 400m data) | 2023 snapshot |

## Freshness

Source publication, ingestion, server caching, and browser polling are separate schedules. A refresh can return the same observation. Check each metric's year and each feed's timestamp before comparing values.

### Runtime feeds

The intervals below describe the implementation as reviewed on **8 October 2026**. They are cache lifetimes or polling intervals, not guarantees about upstream publication or delivery.

| Feed | App cache / polling | Notes |
| ------ | --------------------- | ------- |
| Current weather | 5-minute server cache for one state; 10 minutes for all states | Open-Meteo observation timestamps are included |
| Forecasts, warnings, floods, air quality, earthquakes | 2-minute shared server cache | Combined weather endpoint; sources can fail independently |
| Transit positions | 30-second browser polling | Positions depend on each GTFS-RT feed |
| Flights | 60-second browser polling; 30-second shared server cache | OpenSky with adsb.lol fallback; coverage varies |
| Highway CCTV | 4-minute server cache | Eight configured highway codes; only cameras returned by LLM are available |
| Wind, clouds, PM2.5 grid | 3-hour shared server cache | Hourly forecast values for a 24-hour window |
| Flight route lookup | 24-hour server cache | Callsign lookup through adsbdb |
| Hospital bed and ICU utilization | Daily scheduled ingestion; 1-hour HTTP cache | Served from committed JSON, not fetched live from KKMNow |

### Cached statistics snapshot

The tables below describe the committed datasets reviewed on **8 October 2026**. Main-cache fetch timestamp: **30 September 2026 (UTC)**. Years can differ by state; current-year totals can be incomplete. These tables are a snapshot, not a promise of the latest provider release.

#### Monthly and daily statistics

| Metric | Latest Data | Update Cycle |
| -------- | ------------ | ------------- |
| CPI | 2026 | Monthly |
| Exports, Imports, Trade Balance | 2026 | Monthly |
| Inflation, IPI | 2026 | Monthly |
| LEI, CEI (economic indicators) | 2026 | Monthly |
| Organ pledges, Blood donations | 2026 | Daily ingest tier |
| PEKA B40 screenings | 2026 | Daily ingest tier |
| Vehicle & motorcycle registrations | 2026 | Monthly |

#### Annual and periodic statistics

| Metric | Latest Data | Notes |
| -------- | ------------ | ------- |
| GDP, GDP per capita | 2024 | DOSM publishes ~mid next year |
| Population | 2025 | DOSM estimates |
| Unemployment | 2025 | Ingested with the monthly tier |
| FDI | 2025 | Annual |
| Crime index, Crime rate | 2023 | DOSM publication, ~1-2yr lag |
| Drug addicts | 2023 | AADK data |
| Death rate, Birth rate | 2024 | Vital statistics |
| Doctors per 10K, Hospital beds per 10K | 2022 | MOH data |
| Homicide rate | 2022 | SDG indicator |
| Household income | 2024 | HIS survey (every 2 years) |
| Schools, Teachers, Enrolment | 2022 | MOE data |
| Student-teacher ratio | 2022 | MOE data |
| Completion rate, Literacy | 2022 | MOE/SDG data |
| Electricity consumption | 2025 | Peninsular only (no Sabah/Sarawak) |
| Water use | 2024 | SPAN data |
| Water supply, Water access | 2022 | SPAN data |

## Ingestion

Run these commands from the repository root when you need to refresh the included datasets:

```bash
npm run ingest         # Refresh stale tiers
npm run ingest:force   # Refresh every tier
npm run ingest:energy  # Refresh energy and water datasets
npm run ingest:bedutil # Refresh hospital bed and ICU utilization
```

| Main ingest tier | Refresh threshold | Datasets |
| ------------------ | ------------------- | ---------- |
| Daily | New UTC calendar date | Blood donations, organ pledges, PEKA B40, ridership |
| Monthly | 29 days | CPI, unemployment, trade, inflation, IPI, FDI, economic indicators |
| Annual | 89 days | Population, GDP, crime, education, health, transport |

These thresholds control refetching; they do not describe source publication frequency. Energy and bed-utilization ingestion use separate scripts.

The [scheduled workflow](../.github/workflows/ingest.yml) runs daily at **04:00 MYT (20:00 UTC the previous day)**. It runs all three ingest scripts, commits changed cache files, and deploys when app-visible data changes. Each ingest step runs independently; the workflow reports failure if any ingest step fails.

Inspect `src/lib/data/cache/data-gaps.json` for ingestion coverage gaps. Review generated changes before committing them. Missing source values can be preserved from the previous cache.

## Static map assets

Prebuilt geometry is included in `src/lib/data/`. Rebuild it only when changing a source or its processing:

```bash
npx tsx scripts/build-rail-detail.ts
npx tsx scripts/build-population-hex.ts /path/to/kontur.gpkg
```

The rail script fetches OpenStreetMap routes through Overpass. The population script reads a local Kontur GeoPackage; decompress the downloaded `.gpkg.gz` first. It uses `node:sqlite`; Node.js 24 is recommended for both scripts.

Camera positions are stored in `src/lib/data/cctv-coords.json`, keyed by LLM camera name. Cameras without coordinates are omitted from the live map and logged in development.

## Attribution

The MIT license applies to project code. Provider data and map assets retain their own terms. Source links above identify the providers; map attribution is displayed in the app. Preserve attribution when changing layers or adding datasets.

Pantaulah is an independent project and is not affiliated with its data providers.
