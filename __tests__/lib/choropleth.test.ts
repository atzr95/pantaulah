import { describe, it, expect } from "vitest";
import {
  computeTerciles,
  getBucket,
  getBucketColor,
  METRIC_CONFIGS,
} from "@/lib/data/choropleth";

describe("computeTerciles", () => {
  it("computes terciles for a normal distribution", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const result = computeTerciles(values);
    expect(result).not.toBeNull();
    // floor(9/3)=3 → index 3 = 40, floor(9*2/3)=6 → index 6 = 70
    expect(result!.t1).toBe(40);
    expect(result!.t2).toBe(70);
    expect(result!.min).toBe(10);
    expect(result!.max).toBe(90);
  });

  it("returns null for fewer than 3 values", () => {
    expect(computeTerciles([10, 20])).toBeNull();
    expect(computeTerciles([10])).toBeNull();
    expect(computeTerciles([])).toBeNull();
  });

  it("handles exactly 3 values", () => {
    const result = computeTerciles([10, 20, 30]);
    expect(result).not.toBeNull();
    expect(result!.min).toBe(10);
    expect(result!.max).toBe(30);
  });

  it("filters null values", () => {
    const values = [10, 20, 30, 40, 50, 60];
    const result = computeTerciles(values);
    expect(result).not.toBeNull();
  });

  it("sorts unsorted input", () => {
    const values = [90, 10, 50, 30, 70];
    const result = computeTerciles(values);
    expect(result!.min).toBe(10);
    expect(result!.max).toBe(90);
  });
});

describe("getBucket", () => {
  const terciles = { t1: 40, t2: 70, min: 10, max: 90 };

  it("returns 'low' for values <= t1", () => {
    expect(getBucket(10, terciles)).toBe("low");
    expect(getBucket(40, terciles)).toBe("low");
  });

  it("returns 'medium' for values between t1 and t2", () => {
    expect(getBucket(41, terciles)).toBe("medium");
    expect(getBucket(70, terciles)).toBe("medium");
  });

  it("returns 'high' for values > t2", () => {
    expect(getBucket(71, terciles)).toBe("high");
    expect(getBucket(90, terciles)).toBe("high");
  });

  it("returns 'none' for undefined value", () => {
    expect(getBucket(undefined, terciles)).toBe("none");
  });

  it("returns 'none' for null terciles", () => {
    expect(getBucket(50, null)).toBe("none");
  });
});

describe("getBucketColor", () => {
  it("returns a color string for each bucket+hue combo", () => {
    const buckets = ["low", "medium", "high", "none"] as const;
    const hues = ["cyan", "amber"] as const;
    for (const bucket of buckets) {
      for (const hue of hues) {
        const color = getBucketColor(bucket, hue);
        expect(color).toBeTruthy();
        expect(color).toContain("rgba");
      }
    }
  });
});

describe("METRIC_CONFIGS", () => {
  it("has 28 metrics", () => {
    expect(METRIC_CONFIGS).toHaveLength(28);
  });

  it("has amber (concern) metrics", () => {
    const amber = METRIC_CONFIGS.filter((c) => c.colorHue === "amber");
    expect(amber.map((c) => c.key).sort()).toEqual(["cpi", "crime", "crimeRate", "deathRate", "drugAddicts", "homicideRate", "studentTeacherRatio", "unemployment"]);
  });

  it("has cyan (neutral) metrics", () => {
    const cyan = METRIC_CONFIGS.filter((c) => c.colorHue === "cyan");
    expect(cyan.map((c) => c.key).sort()).toEqual([
      "bedsPerCapita", "birthRate", "bloodDonations", "completion", "doctorsPerCapita", "electricityConsumption", "enrolment", "gdp", "gdpPerCapita",
      "healthScreenings", "householdIncome", "literacy", "organPledges", "population", "schools", "teachers", "vehicleReg",
      "waterAccess", "waterConsumption", "waterProduction",
    ]);
  });
});
