"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { SlowDbTypeStat } from "@/components/dashboard/SlowDbChart";
import { colorForOpc } from "@/components/dashboard/chartTheme";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import {
  formatDuration,
  isLogFile,
  parseSlowRoutine,
  routineLabel,
  SLOW_ROUTINE_MESSAGE_ID,
} from "@/lib/ae-meta";
import { latestArrivalMs } from "@/lib/chart-stamp";
import { eventTime, isWithinWindow, SLOW_DB_WINDOW_MS } from "@/lib/data-window";
import type { FileRole, LogLine } from "@/lib/types";
import { cn, fileKey, fileLabel } from "@/lib/utils";

const SlowDbChart = dynamic(() => import("@/components/dashboard/SlowDbChart"), {
  ssr: false,
});
const SlowDbTimelineChart = dynamic(
  () => import("@/components/dashboard/SlowDbTimelineChart"),
  { ssr: false },
);

type SlowRoutineViewProps = {
  events: LogLine[];
  now: number;
  multiServer?: boolean;
  error?: string;
};

type SlowRoutineEvent = {
  id: number;
  t: number;
  ts: string;
  routine: string;
  module: string;
  name: string;
  durationMs: number;
  role: string;
  file: string;
  server: string;
  serverHost?: string;
  receivedAt?: number;
};

const SLOW_DB_WINDOW_HOURS = SLOW_DB_WINDOW_MS / (60 * 60 * 1000);

const selectClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none";
const inputClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-sky-700";

function toEvent(line: LogLine): SlowRoutineEvent {
  const parsed = parseSlowRoutine(line.raw) ?? parseSlowRoutine(line.message);
  const routine = (line.routine ?? parsed?.routine ?? "UNKNOWN").trim();
  const module = (line.routineModule ?? parsed?.module ?? "").trim();
  const name = parsed?.name || routineLabel(routine);
  return {
    id: line.id,
    t: eventTime(line),
    ts: line.ts,
    routine,
    module,
    name,
    durationMs: line.durationMs ?? parsed?.durationMs ?? 0,
    role: line.role,
    file: line.file,
    server: line.server,
    serverHost: line.serverHost,
    receivedAt: line.receivedAt,
  };
}

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

export function SlowRoutineView({
  events,
  now,
  multiServer = false,
  error,
}: SlowRoutineViewProps) {
  const [file, setFile] = useState("");
  const [role, setRole] = useState("");
  const [routineModule, setRoutineModule] = useState("");
  const [routine, setRoutine] = useState("");
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const parsed = useMemo(
    () =>
      events
        .filter(
          (line) =>
            isLogFile(line.file) &&
            isWithinWindow(line, SLOW_DB_WINDOW_MS, now),
        )
        .map(toEvent)
        .sort((a, b) => a.t - b.t),
    [events, now],
  );

  const byFile = useMemo(() => {
    const counts = new Map<
      string,
      { file: string; server: string; serverHost?: string; count: number }
    >();
    for (const event of parsed) {
      const key = fileKey(event.server, event.file);
      const current = counts.get(key) ?? {
        file: event.file,
        server: event.server,
        serverHost: event.serverHost,
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
  }, [parsed]);

  const byRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of parsed) {
      counts.set(event.role, (counts.get(event.role) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ role: value as FileRole, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.role.localeCompare(b.role),
      );
  }, [parsed]);

  const byModule = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of parsed) {
      const key = event.module || "OTHER";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ module: value, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.module.localeCompare(b.module),
      );
  }, [parsed]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parsed.filter((event) => {
      const key = fileKey(event.server, event.file);
      if (file && key !== file && event.file !== file) {
        return false;
      }
      if (role && event.role !== role) {
        return false;
      }
      if (routineModule && (event.module || "OTHER") !== routineModule) {
        return false;
      }
      if (routine && event.routine !== routine) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = [
        event.name,
        event.routine,
        event.module,
        event.role,
        event.file,
        event.serverHost,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [file, parsed, query, role, routine, routineModule]);

  const types = useMemo((): SlowDbTypeStat[] => {
    const grouped = new Map<string, SlowDbTypeStat>();
    for (const event of visible) {
      const current = grouped.get(event.routine) ?? {
        opc: event.routine,
        operation: event.name,
        count: 0,
        maxDurationMs: 0,
        avgDurationMs: 0,
      };
      current.count += 1;
      current.maxDurationMs = Math.max(current.maxDurationMs, event.durationMs);
      current.avgDurationMs += event.durationMs;
      grouped.set(event.routine, current);
    }
    return [...grouped.values()]
      .map((type) => ({
        ...type,
        avgDurationMs: type.count ? type.avgDurationMs / type.count : 0,
      }))
      .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));
  }, [visible]);

  const allRoutines = useMemo((): SlowDbTypeStat[] => {
    const grouped = new Map<string, SlowDbTypeStat>();
    for (const event of parsed) {
      const current = grouped.get(event.routine) ?? {
        opc: event.routine,
        operation: event.name,
        count: 0,
        maxDurationMs: 0,
        avgDurationMs: 0,
      };
      current.count += 1;
      grouped.set(event.routine, current);
    }
    return [...grouped.values()].sort(
      (a, b) => b.count - a.count || a.operation.localeCompare(b.operation),
    );
  }, [parsed]);

  const slowest = visible.reduce<SlowRoutineEvent | undefined>((current, event) => {
    if (!current || event.durationMs > current.durationMs) {
      return event;
    }
    return current;
  }, undefined);
  const recent = [...visible].reverse().slice(0, 400);
  const arrivedAt = latestArrivalMs(
    ...visible.map((event) => event.receivedAt ?? event.t),
  );
  const perHour = visible.length / SLOW_DB_WINDOW_HOURS;
  const chartEvents = visible.map((event) => ({
    t: event.t,
    opc: event.routine,
    operation: event.name,
    durationMs: event.durationMs,
  }));

  return (
    <div className="flex flex-col gap-5 border-t border-zinc-800 pt-8">
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
        <p className="mr-2 text-sm font-medium text-zinc-300">U messages</p>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={selectClass}
        >
          <option value="">All processes</option>
          {byRole.map((item) => (
            <option key={item.role} value={item.role}>
              {item.role} ({item.count})
            </option>
          ))}
        </select>
        <select
          value={file}
          onChange={(event) => setFile(event.target.value)}
          className={`${selectClass} max-w-72`}
        >
          <option value="">All log files</option>
          {byFile.map((item) => {
            const key = fileKey(item.server, item.file);
            return (
              <option key={key} value={key}>
                {fileLabel(item.file, item.serverHost, multiServer)} ({item.count})
              </option>
            );
          })}
        </select>
        <select
          value={routineModule}
          onChange={(event) => {
            setRoutineModule(event.target.value);
            setRoutine("");
          }}
          className={selectClass}
        >
          <option value="">All modules</option>
          {byModule.map((item) => (
            <option key={item.module} value={item.module}>
              {item.module} ({item.count})
            </option>
          ))}
        </select>
        <select
          value={routine}
          onChange={(event) => setRoutine(event.target.value)}
          className={`${selectClass} max-w-80`}
        >
          <option value="">All routines</option>
          {allRoutines
            .filter((type) => !routineModule || type.opc.startsWith(`${routineModule}/`))
            .map((type) => (
              <option key={type.opc} value={type.opc}>
                {type.operation} ({type.opc})
              </option>
            ))}
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search routine, module, or file…"
          className={`${inputClass} min-w-48 flex-1`}
        />
      </section>

      {error ? (
        <p className="rounded-xl border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          {error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Routines · {SLOW_DB_WINDOW_HOURS}h</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {visible.length}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Per hour</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {perHour < 10 ? perHour.toFixed(1) : Math.round(perHour)}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Slowest</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-amber-300">
            {slowest && slowest.durationMs
              ? formatDuration(slowest.durationMs)
              : "—"}
          </p>
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-sm text-zinc-400">Patterns</p>
          <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
            {types.length}
          </p>
        </article>
      </section>

      <p className="text-xs text-zinc-500">
        {SLOW_ROUTINE_MESSAGE_ID} · server routine took too long · grouped by{" "}
        <span className="font-mono">MODULE/NAME</span> · last {SLOW_DB_WINDOW_HOURS}{" "}
        hours
      </p>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.9fr)]">
        <ChartCard
          title="By routine pattern"
          description="Counts of slow server routines grouped by MODULE/NAME"
          arrivedAt={arrivedAt}
        >
          <SlowDbChart
            types={types}
            emptyMessage="No slow server routines in this window."
            itemNoun="slow routine"
          />
        </ChartCard>
        <div className="flex max-h-[22rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <p className="border-b border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-200">
            By pattern
          </p>
          <div className="flex-1 overflow-auto">
            {types.length === 0 ? (
              <p className="px-4 py-8 text-sm text-zinc-500">
                None yet. U00003434 is logged when a server routine exceeds its
                expected processing time.
              </p>
            ) : (
              types.map((type, index) => (
                <button
                  key={type.opc}
                  type="button"
                  onClick={() => setRoutine(type.opc === routine ? "" : type.opc)}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-zinc-900 px-4 py-2.5 text-left hover:bg-zinc-800/70",
                    routine === type.opc && "bg-zinc-800/70",
                  )}
                >
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: colorForOpc(type.opc, index) }}
                  />
                  <span className="truncate text-sm text-zinc-200">
                    {type.operation}
                    <span className="block truncate text-xs text-zinc-500">
                      {type.opc}
                      {type.maxDurationMs
                        ? ` · slowest ${formatDuration(type.maxDurationMs)}`
                        : ""}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {type.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <h2 className="text-sm font-medium text-zinc-200">Over time</h2>
        <p className="mt-0.5 mb-3 text-xs text-zinc-500">
          Routines and time consumed · last {SLOW_DB_WINDOW_HOURS} hours
        </p>
        <SlowDbTimelineChart
          types={types}
          events={chartEvents}
          arrivedAt={arrivedAt}
          emptyMessage="No slow server routines in the last 12 hours."
        />
      </section>

      <section
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
          listOpen && "min-h-[24rem]",
        )}
      >
        <button
          type="button"
          onClick={() => setListOpen((open) => !open)}
          aria-expanded={listOpen}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/80"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
            {listOpen ? (
              <ChevronDown className="size-3.5 text-zinc-500" />
            ) : (
              <ChevronRight className="size-3.5 text-zinc-500" />
            )}
            Recent routines
          </span>
          <span className="text-xs text-zinc-500">
            {listOpen ? `${recent.length} shown` : `${recent.length} hidden`}
          </span>
        </button>
        {listOpen ? (
          <div className="flex-1 overflow-auto border-t border-zinc-800 font-mono text-[13px] leading-6">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-sm text-zinc-500">
                No U00003434 server routines in the last {SLOW_DB_WINDOW_HOURS}{" "}
                hours.
              </p>
            ) : (
              recent.map((event) => {
                const key = fileKey(event.server, event.file);
                return (
                  <button
                    key={`${event.id}-${key}-${event.ts}`}
                    type="button"
                    onClick={() => setFile(key === file ? "" : key)}
                    className={cn(
                      "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 border-b border-zinc-900/80 px-4 py-1.5 text-left hover:bg-zinc-900/80 lg:grid-cols-[auto_190px_56px_minmax(0,1fr)_88px]",
                      file === key && "bg-zinc-900/80",
                    )}
                  >
                    <span className="whitespace-nowrap text-zinc-500">
                      {formatDateTime(event.ts)}
                    </span>
                    <span className="hidden truncate text-zinc-500 lg:block">
                      {fileLabel(event.file, event.serverHost, multiServer)}
                    </span>
                    <span className="hidden text-zinc-600 lg:block">
                      {event.role}
                    </span>
                    <span className="truncate text-zinc-200">
                      {event.name}
                      <span className="ml-2 text-zinc-500">{event.routine}</span>
                    </span>
                    <span className="hidden truncate text-right font-mono text-amber-300 lg:block">
                      {event.durationMs
                        ? formatDuration(event.durationMs)
                        : formatClock(event.ts)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
