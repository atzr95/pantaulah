/**
 * Major highway routes from OpenStreetMap (simplified).
 * Data loaded from highways.json (auto-generated from Overpass API).
 */

import rawData from "./highways.json";

export interface HighwayRoute {
  ref: string;
  name: string;
  coords: [number, number][];
}

export const HIGHWAYS: HighwayRoute[] = rawData as HighwayRoute[];
