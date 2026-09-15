import {
  DATA_WINDOW_MS,
  PROCESS_VISIBLE_MS,
  eventTime,
} from "@/lib/data-window";
import type {
  AeProcess,
  AeProcessHostStat,
  AeProcessSnapshot,
  AeProcessTypeStat,
  LogLine,
} from "@/lib/types";

const AUTOMIC_PREFIX = /^\d{8}\/\d{6}(?:\.\d{1,3})?\s+-\s+/;
const PROCESS_HEADER =
  /\bServer\s+Typ\s+C\s+Host\s+Port\s+StartTime\s+LastUpdateTime\b/i;
const PROCESS_SEPARATOR = /^[\s\-]+$/;
const PROCESS_ROW =
  /^([A-Za-z0-9_-]+#[A-Za-z]+\d+)\s+([A-Za-z]+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})$/;

export const PROCESS_TYPE_ORDER = [
  "PWP",
  "WP",
  "DWP",
  "JWP",
  "CP",
  "JCP",
  "REST",
] as const;

const PROCESS_FRESH_MS = 24 * 60 * 60 * 1000;

export function processPayload(text: string): string {
  return text.replace(/\r$/, "").replace(AUTOMIC_PREFIX, "").trim();
}

export function isProcessTableHeader(text: string): boolean {
  return PROCESS_HEADER.test(processPayload(text));
}

export function isProcessTableSeparator(text: string): boolean {
  const payload = processPayload(text);
  return payload.length > 0 && PROCESS_SEPARATOR.test(payload);
}

export function parseProcessRow(
  text: string,
): Pick<
  AeProcess,
  "name" | "type" | "connections" | "host" | "port" | "startTime" | "lastUpdateTime"
> | undefined {
  const payload = processPayload(text);
  if (!payload || isProcessTableHeader(payload) || isProcessTableSeparator(payload)) {
    return undefined;
  }
  const match = payload.match(PROCESS_ROW);
  if (!match) {
    return undefined;
  }
  return {
    name: match[1],
    type: match[2].toUpperCase(),
    connections: Number(match[3]) || 0,
    host: match[4],
    port: Number(match[5]) || 0,
    startTime: match[6],
    lastUpdateTime: match[7],
  };
}

export function parseProcessFromLine(line: LogLine): AeProcess | undefined {
  const parsed = parseProcessRow(line.message) ?? parseProcessRow(line.raw);
  if (!parsed) {
    return undefined;
  }
  return {
    ...parsed,
    ts: line.ts,
    file: line.file,
    server: line.server,
    serverHost: line.serverHost,
    historical: line.historical,
    receivedAt: line.receivedAt,
  };
}

export function collectLiveProcesses(
  liveLines: LogLine[],
  generatedAt?: number,
) {
  const incoming: AeProcess[] = [];
  for (const line of liveLines) {
    if (line.historical) {
      continue;
    }
    if ((line.receivedAt ?? 0) < (generatedAt ?? 0)) {
      continue;
    }
    const process = parseProcessFromLine(line);
    if (process) {
      incoming.push(process);
    }
  }
  return incoming;
}

export function latestProcessDataMs(
  processes: AeProcess[],
  dumpTs?: string,
) {
  let latest = 0;
  if (dumpTs) {
    const parsed = Date.parse(dumpTs);
    if (!Number.isNaN(parsed)) {
      latest = parsed;
    }
  }
  for (const process of processes) {
    const t = dumpTime(process);
    if (t > latest) {
      latest = t;
    }
  }
  return latest > 0 ? latest : undefined;
}

export function isProcessViewVisible(options: {
  processes?: AeProcess[];
  dumpTs?: string;
  liveLines?: LogLine[];
  generatedAt?: number;
  now?: number;
}) {
  const now = options.now ?? Date.now();
  const live = collectLiveProcesses(options.liveLines ?? [], options.generatedAt);
  const summary = summarizeProcesses(
    mergeProcessEvents(options.processes ?? [], live),
    now,
  );
  const latest = latestProcessDataMs(
    summary.processes,
    summary.dumpTs ?? options.dumpTs,
  );
  if (latest === undefined) {
    return false;
  }
  return now - latest <= PROCESS_VISIBLE_MS;
}

export function processId(process: Pick<AeProcess, "name">) {
  return process.name.trim();
}

export function processFingerprint(process: Pick<AeProcess, "name">) {
  return processId(process);
}

function typeRank(type: string) {
  const index = PROCESS_TYPE_ORDER.indexOf(
    type as (typeof PROCESS_TYPE_ORDER)[number],
  );
  return index >= 0 ? index : PROCESS_TYPE_ORDER.length;
}

function dumpTime(process: AeProcess) {
  return eventTime({ ts: process.ts, receivedAt: process.receivedAt });
}

function wallTime(value: string) {
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function processUptimeMs(
  process: Pick<AeProcess, "startTime" | "lastUpdateTime">,
) {
  const start = wallTime(process.startTime);
  const last = wallTime(process.lastUpdateTime);
  if (!start || !last || last < start) {
    return undefined;
  }
  return last - start;
}

export function formatUptime(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

export function isNewerProcess(candidate: AeProcess, current: AeProcess) {
  const dumpDelta = dumpTime(candidate) - dumpTime(current);
  if (dumpDelta !== 0) {
    return dumpDelta > 0;
  }
  const updateDelta =
    wallTime(candidate.lastUpdateTime) - wallTime(current.lastUpdateTime);
  if (updateDelta !== 0) {
    return updateDelta > 0;
  }
  return (candidate.receivedAt ?? 0) >= (current.receivedAt ?? 0);
}

export function keepLatestProcesses(rows: AeProcess[]) {
  const byName = new Map<string, AeProcess>();
  for (const row of rows) {
    const id = processId(row);
    if (!id) {
      continue;
    }
    const current = byName.get(id);
    if (!current || isNewerProcess(row, current)) {
      byName.set(id, row);
    }
  }
  return [...byName.values()];
}

function sortProcesses(rows: AeProcess[]) {
  return [...rows].sort(
    (a, b) =>
      typeRank(a.type) - typeRank(b.type) ||
      a.host.localeCompare(b.host) ||
      a.name.localeCompare(b.name),
  );
}

function selectDump(rows: AeProcess[]) {
  const latest = keepLatestProcesses(rows);
  if (latest.length === 0) {
    return { dumpTs: undefined as string | undefined, processes: [] as AeProcess[] };
  }

  const newestHeartbeat = latest.reduce((max, row) => {
    const beat = wallTime(row.lastUpdateTime) || dumpTime(row);
    return beat > max ? beat : max;
  }, 0);

  const processes = sortProcesses(
    latest.filter((row) => {
      const beat = wallTime(row.lastUpdateTime) || dumpTime(row);
      return newestHeartbeat === 0 || newestHeartbeat - beat <= PROCESS_FRESH_MS;
    }),
  );

  const dumpTs = processes.reduce<string | undefined>((best, row) => {
    if (!best) {
      return row.ts;
    }
    const delta = Date.parse(row.ts) - Date.parse(best);
    return Number.isNaN(delta) || delta > 0 ? row.ts : best;
  }, undefined);

  return { dumpTs, processes };
}

export function summarizeProcesses(
  events: AeProcess[],
  now = Date.now(),
): Omit<AeProcessSnapshot, "scannedAt" | "error"> {
  const cutoff = now - DATA_WINDOW_MS;
  const inWindow = events.filter((row) => dumpTime(row) >= cutoff);
  const { dumpTs, processes } = selectDump(inWindow);
  const typeCounts = new Map<string, number>();
  const hostCounts = new Map<string, number>();

  for (const row of processes) {
    typeCounts.set(row.type, (typeCounts.get(row.type) ?? 0) + 1);
    hostCounts.set(row.host, (hostCounts.get(row.host) ?? 0) + 1);
  }

  const byType: AeProcessTypeStat[] = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort(
      (a, b) =>
        typeRank(a.type) - typeRank(b.type) || b.count - a.count || a.type.localeCompare(b.type),
    );
  const byHost: AeProcessHostStat[] = [...hostCounts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));

  return {
    total: processes.length,
    hosts: byHost.length,
    dumpTs,
    byType,
    byHost,
    processes,
  };
}

export function emptyProcessSnapshot(now = Date.now()): AeProcessSnapshot {
  return {
    ...summarizeProcesses([], now),
  };
}

export function mergeProcessEvents(
  current: AeProcess[],
  incoming: AeProcess[],
) {
  return keepLatestProcesses([...current, ...incoming]);
}
