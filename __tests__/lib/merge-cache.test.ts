import { expect, it } from "vitest";
import { mergeCachedRecords } from "../../scripts/lib/merge-cache";

it("keeps missing states, years and sectors after a partial fetch while accepting fresh zeroes", () => {
  const saved: Record<string, Record<number, Record<string, number>>> = {
    Johor: { 2022: { domestic: 5, industrial: 10 }, 2023: { domestic: 6, industrial: 20 } },
    Selangor: { 2023: { domestic: 7, industrial: 30 } },
  };
  const fresh = { Selangor: { 2023: { domestic: 0 } } };
  const result = mergeCachedRecords(saved, fresh);
  expect(result).toEqual({ ...saved, Selangor: { 2023: { domestic: 0, industrial: 30 } } });
  expect(saved.Selangor[2023].domestic).toBe(7);
  expect(mergeCachedRecords(saved, {})).toEqual(saved);
});
