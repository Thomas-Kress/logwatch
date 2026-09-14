import { formatUptime } from "@/lib/processes";
import { extractLogTimestamp } from "@/lib/log-parser";
import { formatLogStamp, timestampMs } from "@/lib/last-timestamps";
import type { FileRole, LogLine, WatchedFile } from "@/lib/types";
import { fileKey } from "@/lib/utils";

export const LAST_ACTIVITY_LIVE_MS = 2 * 60 * 1000;
export const LAST_ACTIVITY_QUIET_MS = 10 * 60 * 1000;

const ROLE_ORDER: FileRole[] = ["WP", "JWP", "CP", "JCP", "REST", "other"];

export type ActivityStatus = "live" | "quiet" | "stale" | "unknown";

export type FileActivity = {
  id: string;
  name: string;
  server: string;
  serverHost: string;
  role: FileRole;
  instance?: string;
  lastTs?: string;
  lastTsMs?: number;
};

export { timestampMs, formatLogStamp };

function roleRank(role: FileRole) {
  const index = ROLE_ORDER.indexOf(role);
  return index >= 0 ? index : ROLE_ORDER.length;
}

export function activityStatus(ageMs?: number): ActivityStatus {
  if (ageMs === undefined) {
    return "unknown";
  }
  if (ageMs < -LAST_ACTIVITY_LIVE_MS) {
    return "unknown";
  }
  if (ageMs <= LAST_ACTIVITY_LIVE_MS) {
    return "live";
  }
  if (ageMs <= LAST_ACTIVITY_QUIET_MS) {
    return "quiet";
  }
  return "stale";
}

export function formatAge(durationMs: number) {
  if (durationMs <= 1_000) {
    return "just now";
  }
  return `${formatUptime(durationMs)} ago`;
}

export function formatActivityTime(value?: string) {
  return formatLogStamp(value);
}

export function processLabel(file: Pick<WatchedFile, "role" | "instance">) {
  if (file.instance) {
    return `${file.role} ${file.instance}`;
  }
  return file.role;
}

export function mergeFileActivity(options: {
  files: WatchedFile[];
  liveLines?: LogLine[];
}): FileActivity[] {
  const { files, liveLines = [] } = options;
  const byId = new Map<string, FileActivity>();

  for (const file of files) {
    const lastTs = file.lastTs;
    const lastTsMs = file.lastTsMs ?? timestampMs(lastTs);
    byId.set(file.id, {
      id: file.id,
      name: file.name,
      server: file.server,
      serverHost: file.serverHost,
      role: file.role,
      instance: file.instance,
      lastTs,
      lastTsMs,
    });
  }

  for (const line of liveLines) {
    const ts = extractLogTimestamp(line.raw) ?? stampIfExplicit(line.ts);
    if (!ts) {
      continue;
    }
    const key = fileKey(line.server, line.file);
    const current = byId.get(key);
    if (!current) {
      continue;
    }
    const tsMs = timestampMs(ts);
    if (tsMs === undefined) {
      continue;
    }
    if (current.lastTsMs === undefined || tsMs >= current.lastTsMs) {
      current.lastTs = ts;
      current.lastTsMs = tsMs;
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role) ||
      Number(a.instance ?? 0) - Number(b.instance ?? 0) ||
      a.serverHost.localeCompare(b.serverHost) ||
      a.name.localeCompare(b.name),
  );
}

function stampIfExplicit(value?: string) {
  if (!value) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !value.endsWith("Z")) {
    return value;
  }
  return extractLogTimestamp(value);
}
