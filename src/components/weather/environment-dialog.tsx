"use client";

import ItemDialog from "@/components/ui/item-dialog";
import SeriesChart from "@/components/ui/series-chart";
import { useMapData } from "@/lib/hooks/use-map-data";
import {
  observationTime,
  type EnvironmentSelection,
  type RiverHistory,
} from "@/lib/data/environment";
import { useNow } from "@/lib/hooks/use-now";

export default function EnvironmentDialog({
  selection,
  current = true,
  onClose,
}: {
  selection: EnvironmentSelection;
  current?: boolean;
  onClose: () => void;
}) {
  const now = useNow();
  const river = selection.kind === "river" ? selection.data : null;
  const history = useMapData<RiverHistory>(
    river
      ? `/api/live/environment?kind=history&station=${encodeURIComponent(river.id)}`
      : null,
  );
  const title =
    selection.kind === "fire"
      ? "Satellite heat detection"
      : selection.data.name;
  return (
    <ItemDialog title={title} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {(!current ||
          (river && now - Date.parse(river.observedAt) > 3_600_000)) && (
          <p role="status" className="text-[var(--color-amber)]">
            The latest report could not confirm this item. The details below are
            from its last report.
          </p>
        )}
        {river && (
          <>
            <p className="text-[var(--color-text-muted)]">
              {river.district}, {river.state}
            </p>
            <div className="flex flex-wrap gap-4">
              <strong className="text-2xl text-[var(--color-cyan)]">
                {river.level.toFixed(2)} m
              </strong>
              <span>
                {river.status} · {river.trend || "Trend unavailable"}
              </span>
            </div>
            {river.status === "Unknown" && (
              <p className="text-xs text-[var(--color-amber)]">
                The source warning level could not be verified.
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              Observed {observationTime(river.observedAt)}
            </p>
            <h3 className="text-xs tracking-wider text-[var(--color-cyan)]">
              LAST SEVEN DAYS
            </h3>
            {history.error ? (
              <p role="status">
                {river.graphUrl
                  ? "River history is not available here. Use the JPS link below."
                  : "River history is not available for this station."}
              </p>
            ) : !history.data ? (
              <p role="status">Loading river history…</p>
            ) : (
              <>
                <SeriesChart
                  points={history.data.readings}
                  thresholds={history.data.thresholds}
                  unit="metres"
                  maxGapMs={20 * 60_000}
                />
                {!history.data.thresholds.length && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Warning levels are not available for this station.
                  </p>
                )}
              </>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              Source: JPS InfoBanjir. River height is not flood depth on nearby
              streets.
            </p>
            {river.graphUrl && (
              <a href={river.graphUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-cyan)] underline">
                View this station on JPS
              </a>
            )}
          </>
        )}
        {selection.kind === "shelter" && (
          <>
            <p>
              {selection.data.district}, {selection.data.state}
            </p>
            <p>{selection.data.disaster}</p>
            <dl className="grid grid-cols-2 gap-3">
              <dt>People</dt>
              <dd>{selection.data.people}</dd>
              <dt>Families</dt>
              <dd>{selection.data.families}</dd>
              <dt>Capacity used</dt>
              <dd>{selection.data.capacityUsed.toFixed(1)}%</dd>
            </dl>
            <p className="text-xs text-[var(--color-text-muted)]">
              Source: JKM InfoBencana. Open shelters only. Counts follow JKM
              reports; they are not a live head count.
            </p>
          </>
        )}
        {selection.kind === "fire" && (
          <>
            <p>Observed {observationTime(selection.data.observedAt)}</p>
            <dl className="grid grid-cols-2 gap-3">
              <dt>Location</dt>
              <dd>
                {selection.data.lat.toFixed(4)}, {selection.data.lon.toFixed(4)}
              </dd>
              <dt>Intensity</dt>
              <dd>{selection.data.frp === null ? "Not reported" : `${selection.data.frp.toFixed(1)} MW`}</dd>
              <dt>Confidence</dt>
              <dd>{selection.data.confidence}</dd>
              <dt>Satellite</dt>
              <dd>{selection.data.satellite}</dd>
            </dl>
            <p className="text-xs text-[var(--color-text-muted)]">
              Source: NASA FIRMS. This is a heat detection, not a confirmed
              fire. Several detections can refer to one fire. Cloud can hide
              detections. Intensity is fire radiative power; smouldering peat
              can make heavy smoke at a low value.
            </p>
          </>
        )}
      </div>
    </ItemDialog>
  );
}
