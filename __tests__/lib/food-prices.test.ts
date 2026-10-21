import { expect, it } from "vitest";
import {
  summarizeFoodPrices,
  type PriceRow,
} from "../../scripts/lib/food-prices";
import { FOOD_ITEMS } from "@/lib/data/food-prices";

it("uses one price per shop, exact item codes, medians, and real observed dates", () => {
  const states = [
    "Johor",
    "Kedah",
    "Kelantan",
    "Melaka",
    "Negeri Sembilan",
    "Pahang",
    "Perak",
    "Perlis",
    "Pulau Pinang",
    "Sabah",
  ];
  const premises = states.flatMap((state, i) =>
    [1, 2, 3].map((n) => ({ premise_code: String(i * 10 + n), state })),
  );
  const rows: PriceRow[] = premises.flatMap((p) =>
    FOOD_ITEMS.map((item) => ({
      date: new Date("2026-10-19"),
      premise_code: Number(p.premise_code),
      item_code: item.code,
      price: (Number(p.premise_code) % 10) * 10,
    })),
  );
  rows.push(
    { ...rows[0], price: 12 },
    { ...rows[0], price: -5 },
    { ...rows[0], item_code: 99999, price: 1000 },
    { ...rows[0], date: new Date("2026-10-22"), price: 100 },
  );
  const cache = summarizeFoodPrices(rows, premises, new Date("2026-10-20"));
  expect(cache.items.map((item) => item.code)).toEqual(
    FOOD_ITEMS.map((item) => item.code),
  );
  for (const item of cache.items) {
    expect(item.states.Johor).toEqual([
      { date: "2026-10-19", median: 20, shops: 3 },
    ]);
    expect(Object.keys(item.states)).toHaveLength(10);
  }
  expect(cache.items[0].states.Penang).toHaveLength(1);
  expect(() => summarizeFoodPrices([], premises)).toThrow("coverage");
});
