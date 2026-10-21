import railDetail from "@/lib/data/rail-detail.json";
import { lineNetwork, snapToNetwork } from "./line-snap";

export const railNetwork = lineNetwork(railDetail.features
  .filter((f) => f.properties.kind === "rail")
  .flatMap((f) => f.geometry.coordinates));

/** KTM reports zero heading at stops; use the nearest track's position and direction. */
export function snapToRail(lon: number, lat: number) {
  return snapToNetwork(railNetwork, lon, lat, 300);
}
