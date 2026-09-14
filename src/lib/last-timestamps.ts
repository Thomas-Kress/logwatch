import { extractLogTimestamp, isTailHeader } from "@/lib/log-parser";
import type { WatchedFile } from "@/lib/types";

export type LogStamp = {
  ts: string;
  tsMs: number;
};

const LOCAL_ISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

export function timestampMs(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const local = normalized.match(LOCAL_ISO);
  if (local) {
    const ms = Number((local[7] ?? "0").padEnd(3, "0").slice(0, 3));
    return new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
      Number(local[6]),
      ms,
    ).getTime();
  }
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function formatLogStamp(value?: string) {
  if (!value) {
    return "—";
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const local = normalized.match(LOCAL_ISO);
  if (local) {
    return `${local[1]}-${local[2]}-${local[3]} ${local[4]}:${local[5]}:${local[6]}`;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").replace(/Z$/, "").slice(0, 19);
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function lastTimestampsFromTail(output: string, names: string[]) {
  const stamps = new Map<string, LogStamp>();
  let current = names.length === 1 ? names[0] : "";

  for (const raw of output.split("\n")) {
    const header = isTailHeader(raw);
    if (header) {
      current = header;
      continue;
    }
    if (!current) {
      continue;
    }
    const stamp = stampFromText(raw);
    if (!stamp) {
      continue;
    }
    const existing = stamps.get(current);
    if (!existing || stamp.tsMs >= existing.tsMs) {
      stamps.set(current, stamp);
    }
  }

  return stamps;
}

export function parseLastTimestampRows(output: string) {
  const stamps = new Map<string, LogStamp>();
  for (const row of output.split("\n")) {
    const trimmed = row.replace(/\r$/, "");
    if (!trimmed) {
      continue;
    }
    const tab = trimmed.indexOf("\t");
    if (tab <= 0) {
      continue;
    }
    const name = trimmed
      .slice(0, tab)
      .replace(/^\.\//, "")
      .replace(/^.*[/\\]/, "");
    const stamp = stampFromText(trimmed.slice(tab + 1));
    if (!name || !stamp) {
      continue;
    }
    stamps.set(name, stamp);
  }
  return stamps;
}

export function applyLastTimestamps(
  files: WatchedFile[],
  stamps: Map<string, LogStamp>,
): WatchedFile[] {
  return files.map((file) => {
    const stamp = stamps.get(file.name);
    if (!stamp) {
      return {
        ...file,
        lastTs: undefined,
        lastTsMs: undefined,
      };
    }
    return {
      ...file,
      lastTs: stamp.ts,
      lastTsMs: stamp.tsMs,
    };
  });
}

function stampFromText(text: string): LogStamp | undefined {
  const ts = extractLogTimestamp(text.trim());
  const tsMs = timestampMs(ts);
  if (!ts || tsMs === undefined) {
    return undefined;
  }
  return { ts, tsMs };
}
