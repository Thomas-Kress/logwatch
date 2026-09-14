import { isActivationMessage, isWpLogFile } from "@/lib/ae-meta";
import {
  ACTIVATION_BUCKET_MS,
  ACTIVATION_WINDOW_HOURS,
  ACTIVATION_WINDOW_MS,
  eventTime,
  pruneLines,
  windowCutoff,
} from "@/lib/data-window";
import type {
  ActivationFileStat,
  ActivationHourPoint,
  ActivationObjectStat,
  ActivationSnapshot,
  LogLine,
} from "@/lib/types";

export const MAX_ACTIVATION_EVENTS = 40_000;
export const MAX_ACTIVATION_RECENT = 400;
export const MAX_ACTIVATION_OBJECTS = 20;

export function activationFingerprint(
  line: Pick<LogLine, "file" | "ts" | "raw" | "server">,
) {
  return `${line.server ?? ""}\t${line.file}\t${line.ts}\t${line.raw}`;
}

export function emptyHourPoint(t: number): ActivationHourPoint {
  return {
    t,
    count: 0,
    cp: 0,
    wp: 0,
    jwp: 0,
    jcp: 0,
    rest: 0,
    other: 0,
  };
}

function hourBuckets(now: number) {
  const current = Math.floor(now / ACTIVATION_BUCKET_MS) * ACTIVATION_BUCKET_MS;
  const start = current - (ACTIVATION_WINDOW_MS - ACTIVATION_BUCKET_MS);
  const points = new Map<number, ActivationHourPoint>();
  for (let t = start; t <= current; t += ACTIVATION_BUCKET_MS) {
    points.set(t, emptyHourPoint(t));
  }
  return { start, current, points };
}

function bumpRole(point: ActivationHourPoint, role: LogLine["role"]) {
  point.count += 1;
  if (role === "CP") {
    point.cp += 1;
  } else if (role === "WP") {
    point.wp += 1;
  } else if (role === "JWP") {
    point.jwp += 1;
  } else if (role === "JCP") {
    point.jcp += 1;
  } else if (role === "REST") {
    point.rest += 1;
  } else {
    point.other += 1;
  }
}

export function summarizeActivations(
  events: LogLine[],
  now = Date.now(),
): Omit<ActivationSnapshot, "scannedAt" | "error"> {
  const inWindow = pruneLines(events, ACTIVATION_WINDOW_MS, now).filter(
    (line) => isWpLogFile(line.file),
  );
  const { start, points } = hourBuckets(now);
  const byFile = new Map<string, ActivationFileStat>();
  const byObject = new Map<string, ActivationObjectStat>();

  for (const line of inWindow) {
    const t = eventTime(line);
    const bucket =
      Math.floor(t / ACTIVATION_BUCKET_MS) * ACTIVATION_BUCKET_MS;
    const point = points.get(bucket);
    if (point) {
      bumpRole(point, line.role);
    }

    const key = `${line.server ?? ""}\t${line.file}`;
    const file = byFile.get(key) ?? {
      file: line.file,
      server: line.server,
      serverHost: line.serverHost,
      role: line.role,
      count: 0,
    };
    file.count += 1;
    byFile.set(key, file);

    if (line.objectName) {
      const object = byObject.get(line.objectName) ?? {
        objectName: line.objectName,
        count: 0,
      };
      object.count += 1;
      byObject.set(line.objectName, object);
    }
  }

  const recent = [...inWindow]
    .sort((a, b) => {
      const delta = eventTime(b) - eventTime(a);
      return delta !== 0 ? delta : b.id - a.id;
    })
    .slice(0, MAX_ACTIVATION_RECENT);

  return {
    total: inWindow.length,
    files: byFile.size,
    objects: byObject.size,
    windowHours: ACTIVATION_WINDOW_HOURS,
    hourly: [...points.values()].filter((point) => point.t >= start),
    byFile: [...byFile.values()].sort(
      (a, b) =>
        b.count - a.count ||
        (a.serverHost ?? "").localeCompare(b.serverHost ?? "") ||
        a.file.localeCompare(b.file),
    ),
    byObject: [...byObject.values()]
      .sort(
        (a, b) =>
          b.count - a.count || a.objectName.localeCompare(b.objectName),
      )
      .slice(0, MAX_ACTIVATION_OBJECTS),
    recent,
  };
}

export function emptyActivationSnapshot(
  now = Date.now(),
): ActivationSnapshot {
  return {
    ...summarizeActivations([], now),
  };
}

export function mergeActivationHourly(
  hourly: ActivationHourPoint[],
  lines: LogLine[],
  now = Date.now(),
) {
  const cutoff = windowCutoff(ACTIVATION_WINDOW_MS, now);
  const points = new Map(hourly.map((point) => [point.t, { ...point }]));
  for (const line of lines) {
    const t = eventTime(line);
    if (t < cutoff) {
      continue;
    }
    const bucket =
      Math.floor(t / ACTIVATION_BUCKET_MS) * ACTIVATION_BUCKET_MS;
    const point = points.get(bucket) ?? emptyHourPoint(bucket);
    bumpRole(point, line.role);
    points.set(bucket, point);
  }
  return [...points.values()].sort((a, b) => a.t - b.t);
}

export function isActivationLine(line: LogLine) {
  return isActivationMessage(line.messageId) && isWpLogFile(line.file);
}

export function automicStamp(ms: number) {
  const date = new Date(ms);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}/${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
