import {
  FOOD_ITEMS,
  type FoodPriceCache,
} from "../../src/lib/data/food-prices";
import { malaysiaState } from "../../src/lib/data/environment";

export interface PriceRow {
  date: Date;
  premise_code: bigint | number;
  item_code: bigint | number;
  price: number;
}
export interface PremiseRow {
  premise_code: string;
  state: string;
}

/** Median per item/state/day, with one price per shop and no filled-in dates. */
export function summarizeFoodPrices(
  rows: PriceRow[],
  premises: PremiseRow[],
  now = new Date(),
): FoodPriceCache {
  const stateByShop = new Map(
    premises.map((p) => [Number(p.premise_code), malaysiaState(p.state)]),
  );
  const items = FOOD_ITEMS.map((i) => ({
    code: i.code,
    name: i.name,
    unit: i.unit,
    states: {} as Record<
      string,
      { date: string; median: number; shops: number }[]
    >,
  }));
  const groups = new Map<string, Map<number, number>>();
  const today = now.toISOString().slice(0, 10);
  for (const row of rows) {
    const code = Number(row.item_code),
      shop = Number(row.premise_code),
      state = stateByShop.get(shop);
    if (
      !state ||
      !FOOD_ITEMS.some((i) => i.code === code) ||
      !Number.isFinite(row.price) ||
      row.price <= 0 ||
      !(row.date instanceof Date) ||
      !Number.isFinite(row.date.getTime())
    )
      continue;
    const date = row.date.toISOString().slice(0, 10);
    if (date > today || now.getTime() - row.date.getTime() > 62 * 86_400_000)
      continue;
    const key = `${code}|${state}|${date}`,
      group = groups.get(key) ?? new Map<number, number>();
    group.set(shop, row.price);
    groups.set(key, group);
  }
  for (const [key, prices] of groups) {
    const [code, state, date] = key.split("|"),
      sorted = [...prices.values()].sort((a, b) => a - b),
      mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const item = items.find((i) => i.code === Number(code))!;
    (item.states[state] ??= []).push({
      date,
      median: Math.round(median * 100) / 100,
      shops: prices.size,
    });
  }
  for (const item of items)
    for (const points of Object.values(item.states))
      points.sort((a, b) => a.date.localeCompare(b.date));
  if (items.some((i) => Object.keys(i.states).length < 10))
    throw new Error(
      "Food price coverage is too small; keeping the previous cache",
    );
  return { fetchedAt: now.toISOString(), items };
}
