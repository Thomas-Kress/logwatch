"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LAST_ACTIVITY_LIVE_MS,
  activityStatus,
  formatActivityTime,
  formatAge,
  mergeFileActivity,
  processLabel,
} from "@/lib/last-activity";
import type { LogLine, WatchedFile } from "@/lib/types";
import { cn, fileLabel } from "@/lib/utils";

type LastActivityPanelProps = {
  files: WatchedFile[];
  liveLines: LogLine[];
  now: number;
  generatedAt?: number;
  multiServer?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
};

const statusClass: Record<string, string> = {
  live: "text-emerald-300",
  quiet: "text-amber-300",
  stale: "text-red-300",
  unknown: "text-zinc-500",
};

const statusLabel: Record<string, string> = {
  live: "Live",
  quiet: "Quiet",
  stale: "Stale",
  unknown: "Unknown",
};

export function LastActivityPanel({
  files,
  liveLines,
  now,
  generatedAt,
  multiServer = false,
  selected = "",
  onSelect,
}: LastActivityPanelProps) {
  const [tick, setTick] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  const clock = tick > now ? tick : now;
  const rows = useMemo(
    () => mergeFileActivity({ files, liveLines }),
    [files, liveLines],
  );
  const liveCount = rows.filter((row) => {
    const ageMs =
      row.lastTsMs === undefined ? undefined : clock - row.lastTsMs;
    return activityStatus(ageMs) === "live";
  }).length;

  return (
    <section className="flex max-h-[28rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">
            Latest timestamps
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Last Automic stamp in each log file
            {generatedAt
              ? ` · checked ${new Date(generatedAt).toLocaleTimeString(undefined, { hour12: false })}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">
          {liveCount}/{rows.length} live
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500">
            Waiting for the next log-file scan…
          </p>
        ) : (
          <table className="w-full min-w-[36rem] border-collapse text-left font-mono text-[13px] leading-6">
            <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-2 font-medium">Process</th>
                <th className="px-3 py-2 font-medium">Log file</th>
                <th className="px-3 py-2 font-medium">Last log</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rawAge =
                  row.lastTsMs === undefined ? undefined : clock - row.lastTsMs;
                const status = activityStatus(rawAge);
                const ageMs =
                  rawAge === undefined || rawAge < -LAST_ACTIVITY_LIVE_MS
                    ? undefined
                    : Math.max(0, rawAge);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-zinc-900/80",
                      onSelect && "cursor-pointer hover:bg-zinc-800/70",
                      selected === row.id && "bg-zinc-800/70",
                    )}
                    onClick={() => onSelect?.(selected === row.id ? "" : row.id)}
                  >
                    <td className="px-4 py-1.5 text-zinc-100">
                      {processLabel(row)}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-400">
                      {fileLabel(row.name, row.serverHost, multiServer)}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-200">
                      {formatActivityTime(row.lastTs)}
                    </td>
                    <td className={cn("px-3 py-1.5 whitespace-nowrap", statusClass[status])}>
                      {ageMs === undefined ? "—" : formatAge(ageMs)}
                    </td>
                    <td className={cn("px-4 py-1.5", statusClass[status])}>
                      {statusLabel[status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
