import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import * as XLSX from "xlsx";
import { FOOD_ITEMS } from "../src/lib/data/food-prices";
import {
  summarizeFoodPrices,
  type PriceRow,
  type PremiseRow,
} from "./lib/food-prices";

const storage = "https://storage.data.gov.my/pricecatcher/";

/** Returns null only when the file is not published yet (404). */
async function downloadIfPublished(name: string): Promise<ArrayBuffer | null> {
  const res = await fetch(storage + name, {
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${name}: source returned ${res.status}`);
  return res.arrayBuffer();
}

async function download(name: string): Promise<ArrayBuffer> {
  const file = await downloadIfPublished(name);
  if (!file) throw new Error(`${name}: source returned 404`);
  return file;
}

async function main() {
  const now = new Date(),
    previous = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
  const months = [
    now.toISOString().slice(0, 7),
    previous.toISOString().slice(0, 7),
  ];
  const [currentFile, previousFile] = await Promise.all([
    downloadIfPublished(`pricecatcher_${months[0]}.parquet`),
    download(`pricecatcher_${months[1]}.parquet`),
  ]);
  // The new month's file is published days late; until then last month's file
  // is the newest data, and the five-day check below still catches a real stall.
  if (!currentFile)
    console.log(`${months[0]} prices not published yet; using ${months[1]}`);
  const tables = await Promise.all(
    [currentFile, previousFile]
      .filter((file) => file !== null)
      .map((file) => parquetReadObjects({ file, compressors })),
  );
  const [premiseBuffer, itemBuffer] = await Promise.all([
    download("lookup_premise.csv"),
    download("lookup_item.csv"),
  ]);
  const table = <T>(buffer: ArrayBuffer): T[] => {
    const book = XLSX.read(new TextDecoder().decode(buffer), {
      type: "string",
      raw: true,
    });
    return XLSX.utils.sheet_to_json<T>(book.Sheets[book.SheetNames[0]], {
      defval: "",
    });
  };
  const lookup = table<{ item_code: string; item: string; unit: string }>(
    itemBuffer,
  );
  for (const item of FOOD_ITEMS)
    if (
      !lookup.some(
        (r) =>
          Number(r.item_code) === item.code &&
          r.item.trim() === item.sourceName &&
          r.unit.toLowerCase().replace(/\s/g, "") === item.sourceUnit,
      )
    )
      throw new Error(
        `Item ${item.code} or its pack size changed; keeping the previous cache`,
      );
  const result = summarizeFoodPrices(
    tables.flat() as unknown as PriceRow[],
    table<PremiseRow>(premiseBuffer),
    now,
  );
  const newest = result.items
    .flatMap((i) =>
      Object.values(i.states).flatMap((p) => p.map((v) => v.date)),
    )
    .sort()
    .at(-1)!;
  if (now.getTime() - Date.parse(newest) > 5 * 86_400_000)
    throw new Error(
      "Price source is more than five days old; keeping the previous cache",
    );
  const dir = new URL("../src/lib/data/cache/", import.meta.url),
    path = new URL("food-prices.json", dir);
  await mkdir(dir, { recursive: true });
  try {
    const old = JSON.parse(await readFile(path, "utf8"));
    if (JSON.stringify(old.items) === JSON.stringify(result.items)) {
      console.log("Food prices unchanged");
      return;
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const temp = new URL("food-prices.json.tmp", dir);
  await writeFile(temp, JSON.stringify(result));
  await rename(temp, path);
  console.log(
    `Food prices saved: latest ${newest}, ${result.items.length} items`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
