/**
 * Formatting utilities for Malaysian data display.
 * All numbers formatted for MY locale conventions.
 */

/** Format population (input is in thousands from API) → "7,194,200" */
export function formatPopulation(thousands: number | undefined): string {
  if (thousands == null) return "—";
  const absolute = Math.round(thousands * 1000);
  return absolute.toLocaleString("en-MY");
}

/** Format population compact → "7.2M" or "198.4K" */
export function formatPopulationCompact(thousands: number | undefined): string {
  if (thousands == null) return "—";
  if (thousands >= 1000) return `${(thousands / 1000).toFixed(1)}M`;
  return `${Math.round(thousands)}K`;
}

/** Format GDP (input is RM millions from API) → "RM 384.2B" or "RM 51.8B" */
export function formatGdp(millions: number | undefined): string {
  if (millions == null) return "—";
  if (millions >= 1000) return `RM ${(millions / 1000).toFixed(1)}B`;
  return `RM ${millions.toFixed(1)}M`;
}

/** Format crime count → "22,327" */
export function formatCrime(count: number | undefined): string {
  if (count == null) return "—";
  return Math.round(count).toLocaleString("en-MY");
}

/** Format crime rate per 100K → "342 / 100K" */
export function formatCrimeRate(
  crimes: number | undefined,
  populationThousands: number | undefined
): string {
  if (crimes == null || populationThousands == null || populationThousands === 0) return "—";
  const per100k = (crimes / (populationThousands * 1000)) * 100000;
  return `${Math.round(per100k)}`;
}

/** Format unemployment rate → "3.1%" */
export function formatPercentage(value: number | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

/** Format CPI index → "136.1" */
export function formatCpi(index: number | undefined): string {
  if (index == null) return "—";
  return index.toFixed(1);
}

/** Format change with direction → "+4.2% YoY" or "-0.2pp QoQ" */
export function formatChange(
  change: number | undefined,
  suffix: string = "YoY",
  unit: "%" | "pp" = "%"
): string {
  if (change == null) return "";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}${unit} ${suffix}`;
}

/** Format exchange rate → "4.2130" */
export function formatRate(rate: number | undefined): string {
  if (rate == null) return "—";
  return rate.toFixed(4);
}

/** Format trade value (input is raw RM) → "RM 1.4T" or "RM 215.2B" */
export function formatTrade(value: number | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}RM ${(abs / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${sign}RM ${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}RM ${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}RM ${Math.round(abs).toLocaleString("en-MY")}`;
}

/** Format inflation rate → "2.1%" */
export function formatInflation(value: number | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

/** Format IPI index → "126.3" */
export function formatIpi(index: number | undefined): string {
  if (index == null) return "—";
  return index.toFixed(1);
}

/** Format FDI (input is RM billions) → "RM 48.2B" */
export function formatFdi(billions: number | undefined): string {
  if (billions == null) return "—";
  const sign = billions < 0 ? "-" : "";
  return `${sign}RM ${Math.abs(billions).toFixed(1)}B`;
}

/** Format economic indicator index → "110.8" */
export function formatIndex(index: number | undefined): string {
  if (index == null) return "—";
  return index.toFixed(1);
}

/** Format household income (RM) → "RM 6,338" */
export function formatIncome(value: number | undefined): string {
  if (value == null) return "—";
  return `RM ${Math.round(value).toLocaleString("en-MY")}`;
}

/** Format OPR → "3.00%" */
export function formatOpr(value: number | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

/** Universal metric formatter — maps a metric key to its human-readable value with units */
export function formatMetricValue(key: string, value: number | undefined): string {
  if (value == null) return "—";
  switch (key) {
    case "gdp": return formatGdp(value);
    case "gdpPerCapita": return `RM ${Math.round(value).toLocaleString("en-MY")}`;
    case "crime": return formatCrime(value);
    case "crimeRate": return `${value.toFixed(1)} / 100K`;
    case "drugAddicts": return Math.round(value).toLocaleString("en-MY");
    case "homicideRate": return `${value.toFixed(2)} / 100K`;
    case "doctorsPerCapita": return `${value.toFixed(1)} / 10K`;
    case "bedsPerCapita": return `${value.toFixed(1)} / 10K`;
    case "deathRate": return `${value.toFixed(1)} / 1K`;
    case "birthRate": return `${value.toFixed(1)} / 1K`;
    case "bloodDonations": return Math.round(value).toLocaleString("en-MY");
    case "unemployment": return formatPercentage(value);
    case "cpi": return formatCpi(value);
    case "population": return formatPopulationCompact(value);
    case "householdIncome": return formatIncome(value);
    case "exports":
    case "imports":
    case "tradeBalance": return formatTrade(value);
    case "inflation": return formatInflation(value);
    case "ipi": return formatIpi(value);
    case "fdi": return formatFdi(value);
    case "lei":
    case "cei": return formatIndex(value);
    case "opr": return formatOpr(value);
    case "studentTeacherRatio": return `${value.toFixed(1)} : 1`;
    case "completion":
    case "literacy": return `${value.toFixed(1)}%`;
    case "vehicleReg":
    case "motorcycleReg":
    case "schools":
    case "teachers":
    case "organPledges":
    case "healthScreenings":
    case "enrolment":
      return Math.round(value).toLocaleString("en-MY");
    case "electricityConsumption":
      return `${value.toLocaleString("en-MY", { maximumFractionDigits: 1 })} GWh`;
    case "waterConsumption":
    case "waterProduction":
      return `${value.toLocaleString("en-MY", { maximumFractionDigits: 1 })} MLD`;
    case "waterAccess":
      return `${value.toFixed(1)}%`;
    case "bedUtilization":
    case "icuUtilization":
      return `${value.toFixed(1)}%`;
    default: return value.toLocaleString("en-MY");
  }
}
