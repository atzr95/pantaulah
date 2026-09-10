/**
 * Free, key-less raster tile sources for the live map.
 * NASA GIBS WMTS paths are {z}/{y}/{x} (TileMatrix/TileRow/TileCol).
 */

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

export const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

/** Esri World Imagery: sharp to street level (z18). Sentinel-2 mosaics blur past z14. */
export const SATELLITE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** VIIRS night lights, annual composite. */
export const NIGHT_LIGHTS_TILES = `${GIBS}/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`;

/** Aerosol optical depth = haze/smoke thickness seen from space. Daily, ~1 day lag. */
export const HAZE_AOD_TILES = `${GIBS}/MODIS_Combined_Value_Added_AOD/default/${isoDaysAgo(1)}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;

export const GIBS_ATTRIBUTION = "NASA GIBS";

/** RainViewer radar: frame list (CORS-enabled) + tile template. */
export const RAINVIEWER_FRAMES = "https://api.rainviewer.com/public/weather-maps.json";
export const radarTile = (host: string, path: string) => `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;

export interface RadarFrame { time: number; path: string }
export interface RainViewerIndex {
  host: string;
  radar: { past: RadarFrame[]; nowcast: RadarFrame[] };
}
