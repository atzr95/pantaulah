import type { CacheData } from "./types";

const SUM_METRICS = ["population", "crime", "gdp", "organPledges", "healthScreenings", "bloodDonations", "drugAddicts", "vehicleReg", "motorcycleReg", "schools", "enrolment", "teachers"];
const RATE_METRICS = ["unemployment", "cpi", "householdIncome", "gdpPerCapita", "crimeRate", "homicideRate", "doctorsPerCapita", "bedsPerCapita", "deathRate", "birthRate", "tfr", "completion", "literacy", "studentTeacherRatio"];
const POPULATION_RATES = ["homicideRate", "doctorsPerCapita", "bedsPerCapita", "deathRate", "birthRate"];
const PP_METRICS = new Set(["unemployment", "inflation", "epfDividend"]);

/** Rebuild totals after state backfill; never present an average of state rates as Malaysia's rate. */
export function rebuildNational(data: Pick<CacheData, "states" | "national">): void {
  const states = Object.values(data.states).map((s) => s.years);
  const national = data.national.years;
  const years = new Set([...Object.keys(national), ...states.flatMap((s) => Object.keys(s))].map(Number));
  for (const year of years) {
    const entry = national[year] ??= {};
    const rows = states.map((s) => s[year]);
    for (const key of [...SUM_METRICS, ...RATE_METRICS]) {
      if (entry[key]?.source !== "national") delete entry[key];
    }
    for (const key of SUM_METRICS) {
      if (entry[key]) continue;
      const values = rows.flatMap((r) => r?.[key] ? [r[key]!.value] : []);
      if (values.length) entry[key] = { value: Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100, year };
    }
    for (const [key, numerator, denominator, factor] of [
      ["gdpPerCapita", "gdp", "population", 1000],
      ["crimeRate", "crime", "population", 100],
      ["studentTeacherRatio", "enrolment", "teachers", 1],
    ] as const) {
      if (!entry[key] && entry[numerator] && (entry[denominator]?.value ?? 0) > 0) {
        entry[key] = { value: Math.round(entry[numerator]!.value / entry[denominator]!.value * factor * 100) / 100, year };
      }
    }
    for (const key of POPULATION_RATES) {
      // A partial set of states cannot stand in for the whole country.
      if (entry[key] || !rows.length || !rows.every((r) => r?.[key] && r.population)) continue;
      const population = rows.reduce((sum, r) => sum + r!.population!.value, 0);
      if (population > 0) entry[key] = {
        value: Math.round(rows.reduce((sum, r) => sum + r![key]!.value * r!.population!.value, 0) / population * 100) / 100,
        year,
      };
    }
  }
  for (const year of years) {
    for (const key of [...SUM_METRICS, ...RATE_METRICS]) {
      const current = national[year]?.[key];
      if (!current) continue;
      delete current.change;
      const previous = national[year - 1]?.[key];
      if (!previous) continue;
      if (PP_METRICS.has(key)) current.change = current.value - previous.value;
      else if (previous.value !== 0) current.change = (current.value - previous.value) / previous.value * 100;
    }
  }
}
