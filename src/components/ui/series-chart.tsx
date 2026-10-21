import { ENVIRONMENT_COLORS } from "@/lib/data/environment";

/** Missing values and missing dates break the line instead of filling gaps. */
export default function SeriesChart({
  points,
  unit,
  thresholds = [],
  maxGapMs = 86_400_000 * 1.5,
}: {
  points: { time: string; value: number | null }[];
  unit: string;
  thresholds?: { label: string; value: number }[];
  maxGapMs?: number;
}) {
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (!values.length)
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        No readings for this period.
      </p>
    );
  const min = Math.min(...values, ...thresholds.map((t) => t.value)),
    max = Math.max(...values, ...thresholds.map((t) => t.value));
  const span = Math.max(max - min, 0.1),
    start = Date.parse(points[0].time),
    end = Date.parse(points.at(-1)!.time);
  const x = (time: string) =>
    42 + ((Date.parse(time) - start) / Math.max(end - start, 1)) * 418;
  const y = (v: number) => 140 - ((v - min) / span) * 110;
  let path = "",
    previous: number | null = null;
  for (const p of points) {
    const time = Date.parse(p.time);
    if (p.value === null) {
      previous = null;
      continue;
    }
    path += `${previous === null || time - previous > maxGapMs ? "M" : "L"}${x(p.time).toFixed(2)},${y(p.value).toFixed(2)} `;
    previous = time;
  }
  return (
    <figure className="space-y-2">
      <svg
        viewBox="0 0 480 165"
        className="w-full"
        role="img"
        aria-label={`${unit} over time; gaps show missing readings`}
      >
        <text x="0" y="24" fill="var(--color-text-dim)" fontSize="11">
          {max.toFixed(2)}
        </text>
        <text x="0" y="145" fill="var(--color-text-dim)" fontSize="11">
          {min.toFixed(2)}
        </text>
        {thresholds.map((t) => (
          <g key={t.label}>
            <line
              x1="42"
              x2="460"
              y1={y(t.value)}
              y2={y(t.value)}
              stroke={
                ENVIRONMENT_COLORS[
                  t.label as keyof typeof ENVIRONMENT_COLORS
                ] ?? "var(--color-text-dim)"
              }
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <text
              x="460"
              y={y(t.value) - 3}
              textAnchor="end"
              fill="var(--color-text-muted)"
              fontSize="11"
            >
              {t.label}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-cyan)" strokeWidth="2" />
      </svg>
      <figcaption className="flex justify-between gap-3 text-xs text-[var(--color-text-muted)]">
        <span>
          {new Date(points[0].time).toLocaleDateString("en-MY", {
            timeZone: "Asia/Kuala_Lumpur",
            day: "numeric",
            month: "short",
          })}
        </span>
        <span>{unit} · gaps mean no data</span>
        <span>
          {new Date(points.at(-1)!.time).toLocaleDateString("en-MY", {
            timeZone: "Asia/Kuala_Lumpur",
            day: "numeric",
            month: "short",
          })}
        </span>
      </figcaption>
    </figure>
  );
}
