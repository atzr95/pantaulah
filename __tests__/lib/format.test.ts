import { describe, it, expect } from "vitest";
import {
  formatPopulation,
  formatPopulationCompact,
  formatGdp,
  formatCrime,
  formatPercentage,
  formatCpi,
  formatChange,
  formatRate,
} from "@/lib/utils/format";

describe("formatPopulation", () => {
  it("formats thousands to full population", () => {
    expect(formatPopulation(6994.4)).toBe("6,994,400");
  });

  it("handles small values", () => {
    expect(formatPopulation(100)).toBe("100,000");
  });

  it("handles undefined", () => {
    expect(formatPopulation(undefined)).toBe("—");
  });

  it("handles zero", () => {
    expect(formatPopulation(0)).toBe("0");
  });
});

describe("formatPopulationCompact", () => {
  it("formats millions", () => {
    expect(formatPopulationCompact(7205.3)).toBe("7.2M");
  });

  it("formats thousands", () => {
    expect(formatPopulationCompact(198.4)).toBe("198K");
  });

  it("handles undefined", () => {
    expect(formatPopulationCompact(undefined)).toBe("—");
  });
});

describe("formatGdp", () => {
  it("formats billions", () => {
    expect(formatGdp(384200)).toBe("RM 384.2B");
  });

  it("formats millions", () => {
    expect(formatGdp(500)).toBe("RM 500.0M");
  });

  it("handles undefined", () => {
    expect(formatGdp(undefined)).toBe("—");
  });
});

describe("formatCrime", () => {
  it("formats with thousand separators", () => {
    expect(formatCrime(22327)).toBe("22,327");
  });

  it("handles undefined", () => {
    expect(formatCrime(undefined)).toBe("—");
  });
});

describe("formatPercentage", () => {
  it("formats with one decimal", () => {
    expect(formatPercentage(3.1)).toBe("3.1%");
  });

  it("handles zero", () => {
    expect(formatPercentage(0)).toBe("0.0%");
  });

  it("handles undefined", () => {
    expect(formatPercentage(undefined)).toBe("—");
  });
});

describe("formatCpi", () => {
  it("formats with one decimal", () => {
    expect(formatCpi(136.1)).toBe("136.1");
  });

  it("handles undefined", () => {
    expect(formatCpi(undefined)).toBe("—");
  });
});

describe("formatChange", () => {
  it("formats positive change", () => {
    expect(formatChange(4.2, "YoY")).toBe("+4.2% YoY");
  });

  it("formats negative change", () => {
    expect(formatChange(-0.2, "QoQ")).toBe("-0.2% QoQ");
  });

  it("formats zero change", () => {
    expect(formatChange(0, "MoM")).toBe("+0.0% MoM");
  });

  it("handles undefined", () => {
    expect(formatChange(undefined)).toBe("");
  });

  it("defaults suffix to YoY", () => {
    expect(formatChange(1.5)).toBe("+1.5% YoY");
  });
});

describe("formatRate", () => {
  it("formats exchange rate to 4 decimals", () => {
    expect(formatRate(4.213)).toBe("4.2130");
  });

  it("handles undefined", () => {
    expect(formatRate(undefined)).toBe("—");
  });
});
