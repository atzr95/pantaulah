/** Keep saved state/year/sector entries missing from a partial fetch; fresh values win, including zero. */
export function mergeCachedRecords<T extends object>(previous: T | undefined, fresh: T): T {
  const merged = { ...previous, ...fresh } as Record<string, unknown>;
  for (const [key, value] of Object.entries(fresh)) {
    const old = (previous as Record<string, unknown> | undefined)?.[key];
    if (value && old && typeof value === "object" && typeof old === "object" && !Array.isArray(value) && !Array.isArray(old)) {
      merged[key] = mergeCachedRecords(old, value);
    }
  }
  return merged as T;
}
