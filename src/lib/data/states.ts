/**
 * Canonical state mapping for all 16 Malaysian entities.
 * Single source of truth for name resolution between:
 * - TopoJSON (CartogramMalaysia)
 * - data.gov.my API
 * - RSS headline matching
 * - AI prompt building
 *
 *  TopoJSON name        API name              Common aliases
 *  ─────────────────────────────────────────────────────────
 *  "Kuala Lumpur"   →   "W.P. Kuala Lumpur"   ["KL"]
 *  "Penang"         →   "Pulau Pinang"        ["Penang"]
 *  "Labuan"         →   "W.P. Labuan"         ["Labuan"]
 *  "Putrajaya"      →   "W.P. Putrajaya"      ["Putrajaya"]
 */

export interface MalaysiaState {
  /** Name used in CartogramMalaysia TopoJSON */
  topoName: string;
  /** Name used in data.gov.my API responses */
  apiName: string;
  /** Alternative names for RSS headline matching */
  aliases: string[];
  /** State capital */
  capital: string;
  /** Whether this is a federal territory */
  isFederalTerritory: boolean;
}

export const MALAYSIA_STATES: MalaysiaState[] = [
  { topoName: "Johor", apiName: "Johor", aliases: ["JB", "Johor Bahru"], capital: "Johor Bahru", isFederalTerritory: false },
  { topoName: "Kedah", apiName: "Kedah", aliases: ["Alor Setar"], capital: "Alor Setar", isFederalTerritory: false },
  { topoName: "Kelantan", apiName: "Kelantan", aliases: ["Kota Bharu", "KB"], capital: "Kota Bharu", isFederalTerritory: false },
  { topoName: "Melaka", apiName: "Melaka", aliases: ["Malacca"], capital: "Melaka City", isFederalTerritory: false },
  { topoName: "Negeri Sembilan", apiName: "Negeri Sembilan", aliases: ["N. Sembilan", "NS", "Seremban"], capital: "Seremban", isFederalTerritory: false },
  { topoName: "Pahang", apiName: "Pahang", aliases: ["Kuantan"], capital: "Kuantan", isFederalTerritory: false },
  { topoName: "Perak", apiName: "Perak", aliases: ["Ipoh"], capital: "Ipoh", isFederalTerritory: false },
  { topoName: "Perlis", apiName: "Perlis", aliases: ["Kangar"], capital: "Kangar", isFederalTerritory: false },
  { topoName: "Penang", apiName: "Pulau Pinang", aliases: ["Penang", "Georgetown", "George Town"], capital: "George Town", isFederalTerritory: false },
  { topoName: "Sabah", apiName: "Sabah", aliases: ["Kota Kinabalu", "KK"], capital: "Kota Kinabalu", isFederalTerritory: false },
  { topoName: "Sarawak", apiName: "Sarawak", aliases: ["Kuching"], capital: "Kuching", isFederalTerritory: false },
  { topoName: "Selangor", apiName: "Selangor", aliases: ["Shah Alam"], capital: "Shah Alam", isFederalTerritory: false },
  { topoName: "Terengganu", apiName: "Terengganu", aliases: ["Kuala Terengganu", "KT"], capital: "Kuala Terengganu", isFederalTerritory: false },
  { topoName: "Kuala Lumpur", apiName: "W.P. Kuala Lumpur", aliases: ["KL", "Kuala Lumpur"], capital: "Kuala Lumpur", isFederalTerritory: true },
  { topoName: "Putrajaya", apiName: "W.P. Putrajaya", aliases: ["Putrajaya"], capital: "Putrajaya", isFederalTerritory: true },
  { topoName: "Labuan", apiName: "W.P. Labuan", aliases: ["Labuan"], capital: "Victoria", isFederalTerritory: true },
];

/** Lookup map: topoName → MalaysiaState */
const byTopoName = new Map(MALAYSIA_STATES.map((s) => [s.topoName, s]));

/** Lookup map: apiName → MalaysiaState */
const byApiName = new Map(MALAYSIA_STATES.map((s) => [s.apiName, s]));

/** Lowercase alias index for headline matching */
const aliasIndex = new Map<string, MalaysiaState>();
for (const state of MALAYSIA_STATES) {
  aliasIndex.set(state.topoName.toLowerCase(), state);
  aliasIndex.set(state.apiName.toLowerCase(), state);
  for (const alias of state.aliases) {
    aliasIndex.set(alias.toLowerCase(), state);
  }
}

/** Resolve topoName → apiName for API lookups */
export function getApiName(topoName: string): string | undefined {
  return byTopoName.get(topoName)?.apiName;
}

/** Resolve apiName → topoName for map rendering */
export function getTopoName(apiName: string): string | undefined {
  return byApiName.get(apiName)?.topoName;
}

/** Resolve any state name/alias → MalaysiaState */
export function resolveState(name: string): MalaysiaState | undefined {
  return byTopoName.get(name) ?? byApiName.get(name) ?? aliasIndex.get(name.toLowerCase());
}

/** Match a headline to states by searching for state names/aliases in the text */
export function matchHeadlineToStates(headline: string): MalaysiaState[] {
  const lower = headline.toLowerCase();
  const matched = new Set<MalaysiaState>();

  for (const state of MALAYSIA_STATES) {
    const names = [state.topoName, state.apiName, ...state.aliases];
    for (const name of names) {
      if (name.length >= 3 && lower.includes(name.toLowerCase())) {
        matched.add(state);
        break;
      }
    }
  }

  return Array.from(matched);
}

export const STATE_COUNT = MALAYSIA_STATES.length; // 16
