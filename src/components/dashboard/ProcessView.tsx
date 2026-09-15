"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { colorForProcessType } from "@/components/dashboard/chartTheme";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import { latestArrivalMs } from "@/lib/chart-stamp";
import { DATA_WINDOW_DAYS } from "@/lib/data-window";
import { timestampMs } from "@/lib/last-timestamps";
import {
  collectLiveProcesses,
  emptyProcessSnapshot,
  formatUptime,
  keepLatestProcesses,
  mergeProcessEvents,
  processUptimeMs,
  summarizeProcesses,
} from "@/lib/processes";
import type { AeProcessSnapshot, LogLine } from "@/lib/types";
import { cn } from "@/lib/utils";

const ProcessTypeChart = dynamic(
  () => import("@/components/dashboard/ProcessTypeChart"),
  { ssr: false },
);

type ProcessViewProps = {
  processes?: AeProcessSnapshot;
  generatedAt?: number;
  liveLines: LogLine[];
  now: number;
};

const selectClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none";
const inputClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-sky-700";

function formatDumpTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").slice(0, 19);
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

function countByPrefix(byType: { type: string; count: number }[], types: string[]) {
  const wanted = new Set(types);
  return byType.reduce(
    (sum, item) => sum + (wanted.has(item.type) ? item.count : 0),
    0,
  );
}

export function ProcessView({
  processes,
  generatedAt,
  liveLines,
  now,
}: ProcessViewProps) {
  const [type, setType] = useState("");
  const [host, setHost] = useState("");
  const [query, setQuery] = useState("");

  const fallback = useMemo(() => emptyProcessSnapshot(now), [now]);
  const base = processes ?? fallback;
  const baseProcesses = Array.isArray(base.processes) ? base.processes : [];
  const freshLive = useMemo(
    () => collectLiveProcesses(liveLines, generatedAt),
    [generatedAt, liveLines],
  );

  const summary = useMemo(
    () =>
      summarizeProcesses(
        mergeProcessEvents(baseProcesses, freshLive),
        now,
      ),
    [baseProcesses, freshLive, now],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keepLatestProcesses(summary.processes).filter((row) => {
      if (type && row.type !== type) {
        return false;
      }
      if (host && row.host !== host) {
        return false;
      }
      if (!q) {
        return true;
      }
      const uptimeMs = processUptimeMs(row);
      const haystack = [
        row.name,
        row.type,
        row.host,
        String(row.port),
        row.startTime,
        row.lastUpdateTime,
        uptimeMs === undefined ? "" : formatUptime(uptimeMs),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [host, query, summary.processes, type]);

  const work = countByPrefix(summary.byType, ["PWP", "WP", "DWP", "JWP"]);
  const communication = countByPrefix(summary.byType, ["CP", "JCP", "REST"]);
  const longestUptimeMs = useMemo(() => {
    let longest: number | undefined;
    for (const row of summary.processes) {
      const uptimeMs = processUptimeMs(row);
      if (uptimeMs === undefined) {
        continue;
      }
      if (longest === undefined || uptimeMs > longest) {
        longest = uptimeMs;
      }
    }
    return longest;
  }, [summary.processes]);
  const arrivedAt = latestArrivalMs(
    timestampMs(summary.dumpTs),
    base.scannedAt,
    ...freshLive.map((process) => process.receivedAt),
    ...summary.processes.map((process) => process.receivedAt),
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
        <p className="mr-2 text-sm font-medium text-zinc-300">Processes</p>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={selectClass}
        >
          <option value="">All types</option>
          {summary.byType.map((item) => (
            <option key={item.type} value={item.type}>
              {item.type} ({item.count})
            </option>
          ))}
        </select>
        <select
          value={host}
          onChange={(event) => setHost(event.target.value)}
          className={selectClass}
        >
          <option value="">All hosts</option>
          {summary.byHost.map((item) => (
            <option key={item.host} value={item.host}>
              {item.host} ({item.count})
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search server, host, or port…"
          className={`${inputClass} min-w-48 flex-1`}
        />
      </section>

      {base.error && (
        <p className="rounded-xl border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          Could not scan process tables: {base.error}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Processes</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {summary.total}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Work (WP / JWP / PWP)</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {work}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Communication</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {communication}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Hosts</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {summary.hosts}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Longest uptime</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {longestUptimeMs === undefined ? "—" : formatUptime(longestUptimeMs)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="By type"
          description={`Latest server table in log files${
            summary.dumpTs ? ` · logged ${formatDumpTime(summary.dumpTs)}` : ""
          }${base.scannedAt ? "" : " · scanning log files…"}`}
          arrivedAt={arrivedAt}
        >
          <ProcessTypeChart byType={summary.byType} />
        </ChartCard>
        <div className="flex max-h-[22rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <p className="border-b border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-200">
            By host
          </p>
          <div className="flex-1 overflow-auto">
            {summary.byHost.length === 0 ? (
              <p className="px-4 py-8 text-sm text-zinc-500">
                No process hosts in the latest table.
              </p>
            ) : (
              summary.byHost.map((item) => (
                <button
                  key={item.host}
                  type="button"
                  onClick={() => setHost(item.host === host ? "" : item.host)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b border-zinc-900 px-4 py-2.5 text-left hover:bg-zinc-800/70",
                    host === item.host && "bg-zinc-800/70",
                  )}
                >
                  <span className="truncate font-mono text-sm text-zinc-200">
                    {item.host}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {item.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="flex min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-medium text-zinc-200">Server processes</h2>
          <span className="text-xs text-zinc-500">
            {rows.length} shown
            {summary.dumpTs ? ` · ${formatDumpTime(summary.dumpTs)}` : ""}
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500">
              No server process table found in log files from the last{" "}
              {DATA_WINDOW_DAYS} days.
            </p>
          ) : (
            <table className="w-full min-w-[58rem] border-collapse text-left font-mono text-[13px] leading-6">
              <thead className="sticky top-0 bg-zinc-950 text-xs text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-2 font-medium">Server</th>
                  <th className="px-3 py-2 font-medium">Typ</th>
                  <th className="px-3 py-2 font-medium">C</th>
                  <th className="px-3 py-2 font-medium">Host</th>
                  <th className="px-3 py-2 font-medium">Port</th>
                  <th className="px-3 py-2 font-medium">StartTime</th>
                  <th className="px-3 py-2 font-medium">LastUpdateTime</th>
                  <th className="px-4 py-2 font-medium">Uptime</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const uptimeMs = processUptimeMs(row);
                  return (
                  <tr
                    key={row.name}
                    className="border-b border-zinc-900/80 hover:bg-zinc-900/80"
                  >
                    <td className="px-4 py-1.5 text-zinc-100">{row.name}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className="inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 text-xs"
                        style={{
                          color: colorForProcessType(row.type),
                          backgroundColor: `${colorForProcessType(row.type)}22`,
                        }}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-zinc-400">
                      {row.connections}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-200">{row.host}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{row.port}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-400">
                      {row.startTime}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-zinc-400">
                      {row.lastUpdateTime}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-zinc-200">
                      {uptimeMs === undefined ? "—" : formatUptime(uptimeMs)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
