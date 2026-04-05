/**
 * Malaysian rail lines from OpenStreetMap (simplified with Douglas-Peucker).
 * Covers KTM Komuter, ETS, Intercity, LRT, MRT, Monorail, ERL.
 */

import rawData from "./rail-lines.json";

export interface RailLine {
  name: string;
  color: string;
  network: string;
  coords: [number, number][];
}

export const RAIL_LINES: RailLine[] = rawData as RailLine[];
