import { describe, it, expect } from "vitest";
import {
  computeRankScale,
  getRampColor,
  getRampGradient,
  METRIC_CONFIGS,
} from "@/lib/data/choropleth";

describe("computeRankScale", () => {
  it("spreads states evenly by rank, not by value", () => {
    // Heavily skewed values still get distinct positions
    const scale = computeRankScale({ a: 1, b: 2, c: 3, d: 1000 })!;
    expect(scale.t).toEqual({ a: 0, b: 1 / 3, c: 2 / 3, d: 1 });
    expect(scale.min).toBe(1);
    expect(scale.max).toBe(1000);
  });

  it("gives tied values the same position", () => {
    const scale = computeRankScale({ a: 5, b: 5, c: 9 })!;
    expect(scale.t.a).toBe(scale.t.b);
    expect(scale.t.c).toBe(1);
  });

  it("ignores missing values and needs at least 3", () => {
    expect(computeRankScale({ a: 1, b: 2, c: undefined })).toBeNull();
    expect(computeRankScale({ a: 1, b: 2, c: 3, d: undefined })!.t).not.toHaveProperty("d");
  });
});

describe("getRampColor", () => {
  it("returns the ramp endpoints and a distinct no-data colour", () => {
    expect(getRampColor(0, "cyan")).toBe("rgba(0, 110, 150, 0.18)");
    expect(getRampColor(1, "cyan")).toBe("rgba(0, 212, 255, 0.65)");
    expect(getRampColor(1, "amber")).toBe("rgba(255, 149, 0, 0.65)");
    expect(getRampColor(undefined, "amber")).not.toBe(getRampColor(0, "amber"));
  });

  it("interpolates between stops", () => {
    expect(getRampColor(0.5, "cyan")).toBe("rgba(0, 161, 203, 0.42)");
  });

  it("builds a CSS gradient through every stop", () => {
    expect(getRampGradient("amber").split("rgba").length - 1).toBe(3);
  });
});

describe("METRIC_CONFIGS", () => {
  it("has 32 metrics", () => {
    expect(METRIC_CONFIGS).toHaveLength(32);
  });

  it("has amber (concern) metrics", () => {
    const amber = METRIC_CONFIGS.filter((c) => c.colorHue === "amber");
    expect(amber.map((c) => c.key).sort()).toEqual(["bedUtilization", "cpi", "crime", "crimeRate", "deathRate", "drugAddicts", "homicideRate", "icuUtilization", "studentTeacherRatio", "unemployment"]);
  });

  it("has cyan (neutral) metrics", () => {
    const cyan = METRIC_CONFIGS.filter((c) => c.colorHue === "cyan");
    expect(cyan.map((c) => c.key).sort()).toEqual([
      "bedsPerCapita", "birthRate", "bloodDonations", "completion", "doctorsPerCapita", "electricityConsumption", "enrolment", "gdp", "gdpPerCapita",
      "healthScreenings", "householdIncome", "literacy", "motorcycleReg", "organPledges", "population", "schools", "teachers", "tfr", "vehicleReg",
      "waterAccess", "waterConsumption", "waterProduction",
    ]);
  });
});
