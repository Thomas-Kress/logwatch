import type { LogLine } from "@/lib/types";

export const DATA_WINDOW_DAYS = 7;
export const DATA_WINDOW_MS = DATA_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const DATA_WINDOW_MINUTES = DATA_WINDOW_DAYS * 24 * 60;
export const SLOW_DB_WINDOW_MS = 12 * 60 * 60 * 1000;
export const ACTIVATION_WINDOW_HOURS = 7;
export const ACTIVATION_WINDOW_MS = ACTIVATION_WINDOW_HOURS * 60 * 60 * 1000;
export const ACTIVATION_BUCKET_MS = 15 * 60 * 1000;
export const UPDATE_INTERVAL_MS = 60_000;
export const SNAPSHOT_INTERVAL_MS = 30_000;
export const PROCESS_WINDOW_HOURS = 48;
export const PROCESS_WINDOW_MS = PROCESS_WINDOW_HOURS * 60 * 60 * 1000;
export const PROCESS_VISIBLE_HOURS = 6;
export const PROCESS_VISIBLE_MS = PROCESS_VISIBLE_HOURS * 60 * 60 * 1000;

export function dataCutoff(now = Date.now()) {
  return now - DATA_WINDOW_MS;
}

export function windowCutoff(windowMs: number, now = Date.now()) {
  return now - windowMs;
}

export function eventTime(line: Pick<LogLine, "ts" | "receivedAt">) {
  const parsed = Date.parse(line.ts);
  return Number.isNaN(parsed) ? (line.receivedAt ?? 0) : parsed;
}

export function isWithinWindow(
  line: Pick<LogLine, "ts" | "receivedAt">,
  windowMs: number,
  now = Date.now(),
) {
  return eventTime(line) >= windowCutoff(windowMs, now);
}

export function isWithinDataWindow(
  line: Pick<LogLine, "ts" | "receivedAt">,
  now = Date.now(),
) {
  return isWithinWindow(line, DATA_WINDOW_MS, now);
}

export function isFileWithinDataWindow(mtimeMs: number, now = Date.now()) {
  return mtimeMs >= dataCutoff(now);
}

export function pruneLines<T extends Pick<LogLine, "ts" | "receivedAt">>(
  lines: T[],
  windowMs = DATA_WINDOW_MS,
  now = Date.now(),
) {
  const cutoff = windowCutoff(windowMs, now);
  return lines.filter((line) => eventTime(line) >= cutoff);
}
