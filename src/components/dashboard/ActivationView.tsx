"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import {
  activationFingerprint,
  emptyActivationSnapshot,
  isActivationLine,
  mergeActivationHourly,
} from "@/lib/activations";
import { latestArrivalMs, latestLineArrival } from "@/lib/chart-stamp";
import {
  ACTIVATION_WINDOW_HOURS,
  eventTime,
  isWithinWindow,
  ACTIVATION_WINDOW_MS,
} from "@/lib/data-window";
import type {
  ActivationSnapshot,
  LogLine,
} from "@/lib/types";
import { cn, fileKey, fileLabel } from "@/lib/utils";

const ActivationTimelineChart = dynamic(
  () => import("@/components/dashboard/ActivationTimelineChart"),
  { ssr: false },
);
const ActivationFilesChart = dynamic(
  () => import("@/components/dashboard/ActivationFilesChart"),
  { ssr: false },
);

type ActivationViewProps = {
  activations?: ActivationSnapshot;
  generatedAt?: number;
  liveLines: LogLine[];
  now: number;
  multiServer?: boolean;
};

const selectClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none";
const inputClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-sky-700";

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, { hour12: false });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function ActivationView({
  activations,
  generatedAt,
  liveLines,
  now,
  multiServer = false,
}: ActivationViewProps) {
  const [file, setFile] = useState("");
  const [query, setQuery] = useState("");

  const fallback = useMemo(() => emptyActivationSnapshot(now), [now]);
  const base = activations ?? fallback;
  const freshLive = useMemo(() => {
    const seen = new Set(base.recent.map(activationFingerprint));
    return liveLines.filter((line) => {
      if (!isActivationLine(line) || line.historical) {
        return false;
      }
      if (!isWithinWindow(line, ACTIVATION_WINDOW_MS, now)) {
        return false;
      }
      if ((line.receivedAt ?? 0) < (generatedAt ?? 0)) {
        return false;
      }
      const fingerprint = activationFingerprint(line);
      if (seen.has(fingerprint)) {
        return false;
      }
      seen.add(fingerprint);
      return true;
    });
  }, [base.recent, generatedAt, liveLines, now]);

  const hourly = useMemo(
    () => mergeActivationHourly(base.hourly, freshLive, now),
    [base.hourly, freshLive, now],
  );

  const byFile = useMemo(() => {
    const counts = new Map(
      base.byFile.map((item) => [
        fileKey(item.server ?? "", item.file),
        { ...item },
      ]),
    );
    for (const line of freshLive) {
      const key = fileKey(line.server, line.file);
      const current = counts.get(key) ?? {
        file: line.file,
        server: line.server,
        serverHost: line.serverHost,
        role: line.role,
        count: 0,
      };
      current.count += 1;
      counts.set(key, current);
    }
    return [...counts.values()].sort(
      (a, b) =>
        b.count - a.count ||
        (a.serverHost ?? "").localeCompare(b.serverHost ?? "") ||
        a.file.localeCompare(b.file),
    );
  }, [base.byFile, freshLive]);

  const byObject = useMemo(() => {
    const counts = new Map(
      base.byObject.map((item) => [item.objectName, { ...item }]),
    );
    for (const line of freshLive) {
      if (!line.objectName) {
        continue;
      }
      const current = counts.get(line.objectName) ?? {
        objectName: line.objectName,
        count: 0,
      };
      current.count += 1;
      counts.set(line.objectName, current);
    }
    const q = query.trim().toLowerCase();
    return [...counts.values()]
      .filter((item) => !q || item.objectName.toLowerCase().includes(q))
      .sort(
        (a, b) => b.count - a.count || a.objectName.localeCompare(b.objectName),
      )
      .slice(0, 20);
  }, [base.byObject, freshLive, query]);

  const recent = useMemo(() => {
    const merged = [...base.recent, ...freshLive];
    const seen = new Set<string>();
    const q = query.trim().toLowerCase();
    return merged
      .filter((line) => {
        const fingerprint = activationFingerprint(line);
        if (seen.has(fingerprint)) {
          return false;
        }
        seen.add(fingerprint);
        if (file && fileKey(line.server, line.file) !== file && line.file !== file) {
          return false;
        }
        if (q) {
          const haystack = [
            line.objectName,
            line.runId,
            line.file,
            line.message,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const delta = eventTime(b) - eventTime(a);
        return delta !== 0 ? delta : b.id - a.id;
      })
      .slice(0, 400);
  }, [base.recent, file, freshLive, query]);

  const total = base.total + freshLive.length;
  const files = byFile.length;
  const objects = base.objects;
  const perHour = total / ACTIVATION_WINDOW_HOURS;
  const arrivedAt = latestArrivalMs(
    latestLineArrival([...base.recent, ...freshLive]),
    base.scannedAt,
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
        <p className="mr-2 text-sm font-medium text-zinc-300">WP logs</p>
        <select
          value={file}
          onChange={(event) => setFile(event.target.value)}
          className={`${selectClass} max-w-72`}
        >
          <option value="">All WP log files</option>
          {byFile.map((item) => {
            const key = fileKey(item.server ?? "", item.file);
            return (
            <option key={key || item.file} value={key || item.file}>
              {fileLabel(item.file, item.serverHost, multiServer)} ({item.count})
            </option>
            );
          })}
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search object or RunID…"
          className={`${inputClass} min-w-48 flex-1`}
        />
      </section>

      {base.error && (
        <p className="rounded-xl border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Could not scan WP log files: {base.error}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Activities · 7h</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {total}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Per hour</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {perHour < 10 ? perHour.toFixed(1) : Math.round(perHour)}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">WP log files</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {files}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Distinct objects</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {objects}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Appearances over time"
          description={`WP log files · last ${ACTIVATION_WINDOW_HOURS} hours · 15-minute buckets${
            base.scannedAt ? "" : " · scanning log files…"
          }`}
          arrivedAt={arrivedAt}
        >
          <ActivationTimelineChart hourly={hourly} />
        </ChartCard>
        <ChartCard
          title="By log file"
          description="Click a file in the list to focus the recent activations"
          arrivedAt={arrivedAt}
        >
          <ActivationFilesChart
            files={byFile}
            selected={file}
            multiServer={multiServer}
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="flex max-h-[28rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <p className="border-b border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-200">
            Top objects
          </p>
          <div className="flex-1 overflow-auto">
            {byObject.length === 0 ? (
              <p className="px-4 py-8 text-sm text-zinc-500">
                No object activations match the current filters.
              </p>
            ) : (
              byObject.map((item) => (
                <button
                  key={item.objectName}
                  type="button"
                  onClick={() => setQuery(item.objectName)}
                  className="flex w-full items-center justify-between gap-3 border-b border-zinc-900 px-4 py-2.5 text-left hover:bg-zinc-800/70"
                >
                  <span className="truncate font-mono text-sm text-zinc-200">
                    {item.objectName}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {item.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex max-h-[28rem] min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-sm font-medium text-zinc-200">
              Recent activities
            </h2>
            <span className="text-xs text-zinc-500">
              {recent.length} shown
            </span>
          </div>
          <div className="flex-1 overflow-auto font-mono text-[13px] leading-6">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-sm text-zinc-500">
                No activities in WP logs over the last{" "}
                {ACTIVATION_WINDOW_HOURS} hours.
              </p>
            ) : (
              recent.map((line) => {
                const key = fileKey(line.server, line.file);
                return (
                <button
                  key={`${line.id}-${key}-${line.ts}`}
                  type="button"
                  onClick={() => setFile(key === file ? "" : key)}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-zinc-900/80 px-4 py-1.5 text-left hover:bg-zinc-900/80 lg:grid-cols-[auto_190px_56px_minmax(0,1fr)_88px]",
                    file === key && "bg-zinc-900/80",
                  )}
                >
                  <span className="whitespace-nowrap text-zinc-500">
                    {formatDateTime(line.ts)}
                  </span>
                  <span className="hidden truncate text-zinc-500 lg:block">
                    {fileLabel(line.file, line.serverHost, multiServer)}
                  </span>
                  <span className="hidden text-zinc-600 lg:block">
                    {line.role}
                  </span>
                  <span className="truncate text-sky-300">
                    {line.objectName ?? line.message}
                  </span>
                  <span className="hidden truncate text-zinc-500 lg:block">
                    {line.runId ?? formatClock(line.ts)}
                  </span>
                </button>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
