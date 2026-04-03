import { describe, it, expect } from "vitest";
import {
  MALAYSIA_STATES,
  getApiName,
  getTopoName,
  resolveState,
  matchHeadlineToStates,
  STATE_COUNT,
} from "@/lib/data/states";

describe("MALAYSIA_STATES", () => {
  it("has exactly 16 entities", () => {
    expect(MALAYSIA_STATES).toHaveLength(16);
    expect(STATE_COUNT).toBe(16);
  });

  it("includes all 3 federal territories", () => {
    const fts = MALAYSIA_STATES.filter((s) => s.isFederalTerritory);
    expect(fts).toHaveLength(3);
    expect(fts.map((s) => s.topoName).sort()).toEqual([
      "Kuala Lumpur",
      "Labuan",
      "Putrajaya",
    ]);
  });

  it("has unique topoNames", () => {
    const names = MALAYSIA_STATES.map((s) => s.topoName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has unique apiNames", () => {
    const names = MALAYSIA_STATES.map((s) => s.apiName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("getApiName", () => {
  it("maps Penang → Pulau Pinang", () => {
    expect(getApiName("Penang")).toBe("Pulau Pinang");
  });

  it("maps Kuala Lumpur → W.P. Kuala Lumpur", () => {
    expect(getApiName("Kuala Lumpur")).toBe("W.P. Kuala Lumpur");
  });

  it("maps Labuan → W.P. Labuan", () => {
    expect(getApiName("Labuan")).toBe("W.P. Labuan");
  });

  it("maps Selangor → Selangor (same name)", () => {
    expect(getApiName("Selangor")).toBe("Selangor");
  });

  it("returns undefined for unknown state", () => {
    expect(getApiName("Singapore")).toBeUndefined();
  });
});

describe("getTopoName", () => {
  it("maps Pulau Pinang → Penang", () => {
    expect(getTopoName("Pulau Pinang")).toBe("Penang");
  });

  it("maps W.P. Kuala Lumpur → Kuala Lumpur", () => {
    expect(getTopoName("W.P. Kuala Lumpur")).toBe("Kuala Lumpur");
  });

  it("returns undefined for unknown API name", () => {
    expect(getTopoName("Unknown")).toBeUndefined();
  });
});

describe("resolveState", () => {
  it("resolves by topoName", () => {
    expect(resolveState("Selangor")?.apiName).toBe("Selangor");
  });

  it("resolves by apiName", () => {
    expect(resolveState("W.P. Kuala Lumpur")?.topoName).toBe("Kuala Lumpur");
  });

  it("resolves by alias (KL)", () => {
    expect(resolveState("KL")?.topoName).toBe("Kuala Lumpur");
  });

  it("resolves by alias (JB)", () => {
    expect(resolveState("JB")?.topoName).toBe("Johor");
  });

  it("resolves case-insensitively", () => {
    expect(resolveState("kl")?.topoName).toBe("Kuala Lumpur");
    expect(resolveState("selangor")?.topoName).toBe("Selangor");
  });

  it("returns undefined for unknown name", () => {
    expect(resolveState("Atlantis")).toBeUndefined();
  });
});

describe("matchHeadlineToStates", () => {
  it("matches exact state name", () => {
    const result = matchHeadlineToStates("Selangor announces new development plan");
    expect(result).toHaveLength(1);
    expect(result[0].topoName).toBe("Selangor");
  });

  it("does not match 2-char alias (KL) due to min length filter", () => {
    const result = matchHeadlineToStates("KL traffic reaches record levels");
    // KL is only 2 chars, below the 3-char minimum to avoid false positives
    expect(result.some((s) => s.topoName === "Kuala Lumpur")).toBe(false);
  });

  it("matches full name Kuala Lumpur", () => {
    const result = matchHeadlineToStates("Kuala Lumpur traffic reaches record levels");
    expect(result.some((s) => s.topoName === "Kuala Lumpur")).toBe(true);
  });

  it("matches alias (Penang)", () => {
    const result = matchHeadlineToStates("Penang bridge toll increase proposed");
    expect(result.some((s) => s.topoName === "Penang")).toBe(true);
  });

  it("matches multiple states", () => {
    const result = matchHeadlineToStates("Johor and Selangor lead GDP growth");
    expect(result.length).toBeGreaterThanOrEqual(2);
    const names = result.map((s) => s.topoName);
    expect(names).toContain("Johor");
    expect(names).toContain("Selangor");
  });

  it("returns empty for no match", () => {
    const result = matchHeadlineToStates("Global markets rally on positive data");
    expect(result).toHaveLength(0);
  });

  it("ignores very short aliases (< 3 chars)", () => {
    // "NS" is only 2 chars, should not match
    const result = matchHeadlineToStates("NS government policy update");
    // NS is in the aliases for Negeri Sembilan but only 2 chars
    // The function skips names < 3 chars
    expect(result.every((s) => s.topoName !== "Negeri Sembilan")).toBe(true);
  });
});
