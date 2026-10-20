import { describe, expect, it } from "vitest";
import { rebuildNational } from "@/lib/data/national";
import type { CacheData, StateData, StateYearData } from "@/lib/data/types";

const state = (years: Record<number, StateYearData>): StateData => ({ apiName: "", topoName: "", latestYear: 2023, years });
const metric = (value: number) => ({ value, year: 2023 });

describe("national figures", () => {
  it("uses all restored states and real denominators instead of averaging their rates", () => {
    const data = {
      states: {
        Johor: state({ 2023: { population: metric(100), gdp: metric(1000), crime: metric(10), enrolment: metric(100), teachers: metric(10), deathRate: metric(2) } }),
        Selangor: state({ 2023: { population: metric(900), gdp: metric(18000), crime: metric(90), enrolment: metric(900), teachers: metric(30), deathRate: metric(10) } }),
      },
      national: state({ 2023: { crime: metric(10), gdpPerCapita: metric(15000), householdIncome: metric(7000), unemployment: metric(5) } }),
    };
    rebuildNational(data);
    const national = data.national.years[2023] as Record<string, { value: number }>;
    expect(national.crime.value).toBe(100);
    expect(national.crimeRate.value).toBe(10);
    expect(national.gdpPerCapita.value).toBe(19000);
    expect(national.studentTeacherRatio.value).toBe(25);
    expect(national.deathRate.value).toBe(9.2);
    expect(national.householdIncome).toBeUndefined();
    expect(national.unemployment).toBeUndefined();
  });

  it("keeps published national rates and medians", () => {
    const data: Pick<CacheData, "states" | "national"> = {
      states: { Johor: state({ 2023: { householdIncome: metric(6000) } }) },
      national: state({ 2023: { householdIncome: { ...metric(6500), source: "national" }, unemployment: { ...metric(3), source: "national" } } }),
    };
    rebuildNational(data);
    expect(data.national.years[2023].householdIncome?.value).toBe(6500);
    expect(data.national.years[2023].unemployment?.value).toBe(3);
  });

  it("recalculates changes after restoring state data and is safe to repeat", () => {
    const data = {
      states: { Johor: state({ 2022: { population: { value: 100, year: 2022 } }, 2023: { population: metric(110) } }) },
      national: state({ 2023: { population: { ...metric(90), change: -10 } } }),
    };
    rebuildNational(data);
    rebuildNational(data);
    expect(data.national.years[2023].population).toEqual({ value: 110, year: 2023, change: 10 });
  });
});
