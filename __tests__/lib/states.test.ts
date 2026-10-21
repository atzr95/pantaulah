import { describe, it, expect } from "vitest";
import {
  MALAYSIA_STATES,
  resolveState,
  matchHeadlineToStates,
} from "@/lib/data/states";

describe("MALAYSIA_STATES", () => {
  it("has exactly 16 entities", () => {
    expect(MALAYSIA_STATES).toHaveLength(16);
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

  it("matches state names regardless of letter case", () => {
    const result = matchHeadlineToStates("SELANGOR BUDGET INCREASES 15%");
    expect(result.map((s) => s.topoName)).toEqual(["Selangor"]);
  });

  it("matches a city alias to its state", () => {
    const result = matchHeadlineToStates("Georgetown heritage zone expanded");
    expect(result.map((s) => s.topoName)).toEqual(["Penang"]);
  });

  it("returns each state once when its name and aliases match", () => {
    const result = matchHeadlineToStates("Penang and Georgetown prepare for floods");
    expect(result.map((s) => s.topoName)).toEqual(["Penang"]);
  });
});
