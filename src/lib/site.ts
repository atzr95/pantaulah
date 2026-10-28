/**
 * Site identity shared by page metadata, the About page, the sitemap,
 * robots.txt, llms.txt and structured data.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://pantaulah.com").replace(/\/+$/, "");

export const SITE_NAME = "PANTAULAH";

export const SITE_TITLE = "PANTAULAH — Malaysia Intelligence Terminal";

export const SITE_DESCRIPTION =
  "Real-time intelligence dashboard for Malaysia. Synthesizes demographics, economics, health, crime, and news across all 16 states and federal territories.";

/** Live layers and feeds shown alongside the state statistics. */
export const LIVE_FEEDS = [
  "Weather, air quality, rain radar and satellite imagery",
  "River levels and flood readings (JPS InfoBanjir)",
  "Open relief shelters (JKM InfoBencana)",
  "Satellite fire detections and regional haze",
  "Earthquakes near Malaysia",
  "Rail and bus positions",
  "Flights over Malaysia",
  "Highway CCTV",
  "Exchange rates and the Overnight Policy Rate",
  "Malaysian news headlines, Reddit and YouTube",
];

export const DATA_SOURCES = [
  { name: "data.gov.my", url: "https://developer.data.gov.my", description: "Demographics, GDP, crime, health, education, weather, fuel prices" },
  { name: "DOSM", url: "https://storage.dosm.gov.my", description: "Population estimates, GDP & crime publications" },
  { name: "BNM API", url: "https://api.bnm.gov.my", description: "Exchange rates, OPR" },
  { name: "Open-Meteo", url: "https://open-meteo.com", description: "Current weather, air quality" },
  { name: "MET Malaysia", url: "https://api.met.gov.my", description: "Radar & satellite imagery" },
  { name: "USGS", url: "https://earthquake.usgs.gov", description: "Live regional seismic catalogue" },
  { name: "OpenSky Network", url: "https://opensky-network.org", description: "Live flight tracking" },
  { name: "LLM.gov.my", url: "https://www.llm.gov.my", description: "Highway CCTV feeds" },
  { name: "MyEnergyStats", url: "https://myenergystats.st.gov.my", description: "Electricity consumption & generation" },
  { name: "KKMNow", url: "https://data.gov.my", description: "Hospital bed & ICU utilization" },
  { name: "JPS InfoBanjir", url: "https://publicinfobanjir.water.gov.my", description: "Recent river readings and seven-day history" },
  { name: "JKM InfoBencana", url: "https://infobencanajkmv2.jkm.gov.my/landing/index.php", description: "Open shelters, locations and reported people counts" },
  { name: "NASA FIRMS", url: "https://firms.modaps.eosdis.nasa.gov", description: "NOAA-20 satellite heat detections" },
  { name: "ASMC", url: "https://wis2.asmc.asean.org/regional-haze-situation/", description: "Daily regional haze report" },
  { name: "Global Forest Watch / UMD", url: "https://www.globalforestwatch.org", description: "Annual tree-cover loss, 2001–2025" },
  { name: "KPDN / DOSM PriceCatcher", url: "https://data.gov.my/data-catalogue/pricecatcher", description: "Food prices by state and exact pack size; CC BY 4.0" },
];

export const GITHUB_URL = "https://github.com/atzr95/pantaulah";
