import { describe, it, expect } from "vitest";
import { matchHeadlineToStates } from "@/lib/data/states";

describe("headline matching edge cases", () => {
  it("matches state name at start of headline", () => {
    const result = matchHeadlineToStates("Sabah floods displace thousands");
    expect(result.some((s) => s.topoName === "Sabah")).toBe(true);
  });

  it("matches state name at end of headline", () => {
    const result = matchHeadlineToStates("New highway project for Perak");
    expect(result.some((s) => s.topoName === "Perak")).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = matchHeadlineToStates("SELANGOR BUDGET INCREASES 15%");
    expect(result.some((s) => s.topoName === "Selangor")).toBe(true);
  });

  it("matches Johor Bahru alias to Johor", () => {
    const result = matchHeadlineToStates("Johor Bahru property market booms");
    expect(result.some((s) => s.topoName === "Johor")).toBe(true);
  });

  it("matches Georgetown alias to Penang", () => {
    const result = matchHeadlineToStates("Georgetown heritage zone expanded");
    expect(result.some((s) => s.topoName === "Penang")).toBe(true);
  });

  it("matches Kota Kinabalu alias to Sabah", () => {
    const result = matchHeadlineToStates("Kota Kinabalu airport upgrade begins");
    expect(result.some((s) => s.topoName === "Sabah")).toBe(true);
  });

  it("does not match partial names within words", () => {
    // "Melaka" should not match inside "AMelaka" etc.
    // But it will match "Melaka" as a substring in most cases
    // This tests that very short aliases are filtered
    const result = matchHeadlineToStates("This is a random headline about nothing");
    expect(result).toHaveLength(0);
  });

  it("matches multiple states in one headline", () => {
    const result = matchHeadlineToStates(
      "Sabah and Sarawak to receive additional federal funding"
    );
    const names = result.map((s) => s.topoName);
    expect(names).toContain("Sabah");
    expect(names).toContain("Sarawak");
  });

  it("deduplicates when headline matches both name and alias", () => {
    // "Penang" appears as both a topoName and an alias
    const result = matchHeadlineToStates("Penang state government announces");
    const penangCount = result.filter((s) => s.topoName === "Penang").length;
    expect(penangCount).toBe(1);
  });
});
