import { eventTime } from "@/lib/data-window";
import type { SeriesPoint } from "@/lib/types";

export function latestArrivalMs(
  ...values: Array<number | string | undefined | null>
): number | undefined {
  let max: number | undefined;
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const ms = typeof value === "number" ? value : Date.parse(String(value));
    if (!Number.isFinite(ms)) {
      continue;
    }
    if (max === undefined || ms > max) {
      max = ms;
    }
  }
  return max;
}

export function lineArrivedAt(line: {
  ts: string;
  receivedAt?: number;
}) {
  return line.receivedAt ?? eventTime(line);
}

export function latestLineArrival(
  lines: Array<{ ts: string; receivedAt?: number }>,
) {
  return latestArrivalMs(...lines.map(lineArrivedAt));
}

export function latestFileArrival(
  files: Array<{ lastTsMs?: number; mtimeMs?: number }>,
) {
  return latestArrivalMs(...files.map((file) => file.lastTsMs ?? file.mtimeMs));
}

export function seriesDataArrivedAt(
  series: SeriesPoint[],
  seriesUpdatedAt?: number,
  keys: Array<keyof SeriesPoint> = ["info", "warn", "error", "debug"],
) {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const point = series[i];
    if (!keys.some((key) => Number(point[key]) > 0)) {
      continue;
    }
    if (
      i === series.length - 1 &&
      seriesUpdatedAt &&
      seriesUpdatedAt >= point.t
    ) {
      return seriesUpdatedAt;
    }
    return point.t;
  }
}

export function formatChartStamp(ms: number) {
  const date = new Date(ms);
  const time = date.toLocaleTimeString(undefined, { hour12: false });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return time;
  }
  const day = date.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
  });
  return `${day} ${time}`;
}
