"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { AlertList } from "@/components/dashboard/AlertList";
import { ActivationView } from "@/components/dashboard/ActivationView";
import { AppHeader, type DashboardView } from "@/components/dashboard/AppHeader";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import { ProcessView } from "@/components/dashboard/ProcessView";
import { FileList } from "@/components/dashboard/FileList";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { HealthLog } from "@/components/dashboard/HealthLog";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { LastActivityPanel } from "@/components/dashboard/LastActivityPanel";
import { LogTail } from "@/components/dashboard/LogTail";
import { SlowDbView } from "@/components/dashboard/SlowDbView";
import {
  latestFileArrival,
  seriesDataArrivedAt,
} from "@/lib/chart-stamp";
import { defaultFilters, isProblemLine, matchesFile, matchesLine, matchesTailLine } from "@/lib/filters";
import { isActivationMessage, isLogFile, isSlowDbMessage, isSlowRoutineMessage, isWpLogFile, slowRoutineFingerprint } from "@/lib/ae-meta";
import { MAX_ACTIVATION_RECENT, activationFingerprint } from "@/lib/activations";
import {
  ACTIVATION_WINDOW_MS,
  DATA_WINDOW_MS,
  SNAPSHOT_INTERVAL_MS,
  SLOW_DB_WINDOW_MS,
  UPDATE_INTERVAL_MS,
  isFileWithinDataWindow,
  isWithinDataWindow,
  isWithinWindow,
  pruneLines,
} from "@/lib/data-window";
import { isProcessViewVisible } from "@/lib/processes";
import type { DashboardFilters, HealthCycle, LogLine, WatcherSnapshot } from "@/lib/types";

const VolumeChart = dynamic(() => import("@/components/dashboard/VolumeChart"), {
  ssr: false,
});
const SeverityChart = dynamic(
  () => import("@/components/dashboard/SeverityChart"),
  { ssr: false },
);
const RoleChart = dynamic(() => import("@/components/dashboard/RoleChart"), {
  ssr: false,
});
const TopFilesChart = dynamic(
  () => import("@/components/dashboard/TopFilesChart"),
  { ssr: false },
);

function mergeLines(current: LogLine[], incoming: LogLine[], max = 800) {
  const seen = new Set(current.map((line) => line.id));
  const next = pruneLines(
    current.filter((line) => isLogFile(line.file)),
    DATA_WINDOW_MS,
  );
  for (const line of incoming) {
    if (
      !seen.has(line.id) &&
      isLogFile(line.file) &&
      isWithinDataWindow(line)
    ) {
      next.push(line);
      seen.add(line.id);
    }
  }
  while (next.length > max) {
    const drop = next.findIndex((line) => !isProblemLine(line));
    next.splice(drop >= 0 ? drop : 0, 1);
  }
  return next;
}

function isSnapshot(data: unknown): data is WatcherSnapshot {
  if (!data || typeof data !== "object") {
    return false;
  }
  const snapshot = data as WatcherSnapshot;
  return Array.isArray(snapshot.files) && Array.isArray(snapshot.series);
}

function mergeActivationLines(current: LogLine[], incoming: LogLine[]) {
  const seen = new Set(current.map(activationFingerprint));
  const next = pruneLines(current, ACTIVATION_WINDOW_MS);
  for (const line of incoming) {
    const fingerprint = activationFingerprint(line);
    if (
      seen.has(fingerprint) ||
      !isActivationMessage(line.messageId) ||
      !isWpLogFile(line.file) ||
      !isWithinWindow(line, ACTIVATION_WINDOW_MS)
    ) {
      continue;
    }
    next.push(line);
    seen.add(fingerprint);
  }
  if (next.length > MAX_ACTIVATION_RECENT) {
    next.splice(0, next.length - MAX_ACTIVATION_RECENT);
  }
  return next;
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<WatcherSnapshot | null>(null);
  const [healthLog, setHealthLog] = useState<HealthCycle[]>([]);
  const [liveLines, setLiveLines] = useState<LogLine[]>([]);
  const [liveActivations, setLiveActivations] = useState<LogLine[]>([]);
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [view, setView] = useState<DashboardView>("overview");
  const [showHealthLog, setShowHealthLog] = useState(false);
  const [streamState, setStreamState] = useState<"connecting" | "open" | "error">(
    "connecting",
  );
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<string | undefined>(undefined);

  const ingestSnapshot = useCallback((data: unknown) => {
    if (!isSnapshot(data)) {
      return;
    }
    setSnapshot(data);
    if (Array.isArray(data.healthLog) && data.healthLog.length > 0) {
      setHealthLog(data.healthLog);
    }
    const sessionChanged = sessionRef.current !== data.startedAt;
    if (sessionChanged) {
      sessionRef.current = data.startedAt;
    }
    setLiveLines((current) => {
      if (sessionChanged) {
        return [];
      }
      const seen = new Set(
        [
          ...(data.recent ?? []),
          ...(data.problems ?? []),
          ...(data.slowDbEvents ?? []),
          ...(data.slowRoutineEvents ?? []),
        ].map((line) => line.id),
      );
      return current.filter(
        (line) => !seen.has(line.id) && isWithinDataWindow(line),
      );
    });
    setLiveActivations((current) => {
      if (sessionChanged) {
        return [];
      }
      const seen = new Set(
        (data.activations?.recent ?? []).map(activationFingerprint),
      );
      return pruneLines(current, ACTIVATION_WINDOW_MS).filter((line) => {
        if (seen.has(activationFingerprint(line))) {
          return false;
        }
        return isWithinWindow(line, ACTIVATION_WINDOW_MS);
      });
    });
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      if (closed) {
        return;
      }
      source = new EventSource("/api/logs/stream");
      source.addEventListener("snapshot", (event) => {
        try {
          ingestSnapshot(JSON.parse(event.data));
        } catch {
          // ignore a truncated or malformed SSE payload
        }
      });
      source.addEventListener("health", (event) => {
        try {
          const data = JSON.parse(event.data) as HealthCycle[];
          if (Array.isArray(data)) {
            setHealthLog(data);
          }
        } catch {
          // ignore a truncated or malformed SSE payload
        }
      });
      source.addEventListener("lines", (event) => {
        try {
          const data = JSON.parse(event.data) as LogLine[];
          const logLines = data.filter((line) => isLogFile(line.file));
          setLiveLines((current) => mergeLines(current, logLines, 400));
          setLiveActivations((current) => mergeActivationLines(current, logLines));
        } catch {
          // ignore a truncated or malformed SSE payload
        }
      });
      source.onopen = () => setStreamState("open");
      source.onerror = () => {
        if (closed || !source) {
          return;
        }
        if (source.readyState === EventSource.CLOSED) {
          setStreamState("error");
          retry = window.setTimeout(connect, 2_000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) {
        window.clearTimeout(retry);
      }
      source?.close();
    };
  }, [ingestSnapshot]);

  useEffect(() => {
    const tick = window.setInterval(
      () => setNow(Date.now()),
      SNAPSHOT_INTERVAL_MS,
    );
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const response = await fetch("/api/logs/status", { cache: "no-store" });
        if (!response.ok || cancelled) {
          return;
        }
        ingestSnapshot(await response.json());
      } catch {
        // SSE remains the primary feed; this is a once-a-minute backup
      }
    };
    void pull();
    const id = window.setInterval(pull, UPDATE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ingestSnapshot]);

  const lines = useMemo(
    () => mergeLines(snapshot?.recent ?? [], liveLines),
    [liveLines, snapshot?.recent],
  );
  const problems = useMemo(
    () =>
      mergeLines(
        snapshot?.problems ?? [],
        liveLines.filter(isProblemLine),
        400,
      ),
    [liveLines, snapshot?.problems],
  );

  const files = useMemo(
    () =>
      (snapshot?.files ?? []).filter(
        (file) =>
          isLogFile(file.name) &&
          isFileWithinDataWindow(file.mtimeMs, now) &&
          matchesFile(file, filters),
      ),
    [filters, now, snapshot?.files],
  );
  const visibleLines = useMemo(
    () =>
      lines.filter(
        (line) => isWithinDataWindow(line, now) && matchesLine(line, filters),
      ),
    [filters, lines, now],
  );
  const tailLines = useMemo(
    () =>
      problems.filter(
        (line) => isWithinDataWindow(line, now) && matchesTailLine(line, filters),
      ),
    [filters, now, problems],
  );
  const severityMix = useMemo(() => {
    const mix = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const point of snapshot?.series ?? []) {
      mix.info += point.info;
      mix.warn += point.warn;
      mix.error += point.error;
      mix.debug += point.debug;
    }
    return mix;
  }, [snapshot?.series]);
  const clientRate = useMemo(() => {
    const cutoff = now - 60_000;
    return visibleLines.filter(
      (line) => (line.receivedAt ?? Date.parse(line.ts)) >= cutoff,
    ).length;
  }, [now, visibleLines]);
  const filtersIdle =
    filters.kind === defaultFilters.kind &&
    filters.role === defaultFilters.role &&
    filters.severity === defaultFilters.severity &&
    !filters.query &&
    !filters.messageId &&
    !filters.runId &&
    !filters.file &&
    !filters.server;
  const rate = filtersIdle
    ? (snapshot?.stats.linesPerMinute ?? clientRate)
    : clientRate;
  const slowDbEvents = useMemo(() => {
    const seen = new Set<number>();
    const merged: LogLine[] = [];
    for (const line of [...(snapshot?.slowDbEvents ?? []), ...lines, ...problems]) {
      if (
        !isSlowDbMessage(line.messageId) ||
        !isLogFile(line.file) ||
        seen.has(line.id) ||
        !isWithinWindow(line, SLOW_DB_WINDOW_MS, now)
      ) {
        continue;
      }
      seen.add(line.id);
      merged.push(line);
    }
    return merged;
  }, [lines, now, problems, snapshot?.slowDbEvents]);
  const slowRoutineEvents = useMemo(() => {
    const seen = new Set<string>();
    const merged: LogLine[] = [];
    for (const line of [
      ...(snapshot?.slowRoutineEvents ?? []),
      ...lines,
      ...problems,
    ]) {
      if (
        !isSlowRoutineMessage(line.messageId) ||
        !isLogFile(line.file) ||
        !isWithinWindow(line, SLOW_DB_WINDOW_MS, now)
      ) {
        continue;
      }
      const fingerprint = slowRoutineFingerprint(line);
      if (seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
      merged.push(line);
    }
    return merged;
  }, [lines, now, problems, snapshot?.slowRoutineEvents]);

  const status = snapshot?.status ?? (streamState === "error" ? "error" : "connecting");
  const servers = snapshot?.servers ?? [];
  const multiServer = servers.length > 1;
  const hostLabel = servers.length
    ? servers
        .map((server) => `${server.host}:${server.port}`)
        .join(" · ")
    : snapshot
      ? `${snapshot.host}:${snapshot.port}`
      : "";
  const statusLabel =
    status === "live"
      ? multiServer && servers.some((server) => server.status !== "live")
        ? "Partial"
        : "Live"
      : status === "connecting"
        ? "Connecting"
        : status === "error"
          ? "Error"
          : "Idle";

  const processesVisible = useMemo(
    () =>
      isProcessViewVisible({
        processes: snapshot?.processes?.processes,
        dumpTs: snapshot?.processes?.dumpTs,
        liveLines,
        generatedAt: snapshot?.generatedAt,
        now,
      }),
    [liveLines, now, snapshot?.generatedAt, snapshot?.processes],
  );
  const volumeArrivedAt = useMemo(
    () =>
      seriesDataArrivedAt(
        snapshot?.series ?? [],
        snapshot?.seriesUpdatedAt,
      ),
    [snapshot?.series, snapshot?.seriesUpdatedAt],
  );
  const roleArrivedAt = useMemo(
    () =>
      seriesDataArrivedAt(snapshot?.series ?? [], snapshot?.seriesUpdatedAt, [
        "cp",
        "wp",
      ]),
    [snapshot?.series, snapshot?.seriesUpdatedAt],
  );
  const topFilesArrivedAt = useMemo(
    () => latestFileArrival(files),
    [files],
  );

  useEffect(() => {
    if (view === "processes" && !processesVisible) {
      setView("overview");
    }
  }, [processesVisible, view]);

  const patchFilters = (patch: Partial<DashboardFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        view={view}
        onViewChange={setView}
        status={status}
        statusLabel={statusLabel}
        hostLabel={hostLabel}
        path={snapshot?.path}
        pattern={snapshot?.pattern}
        generatedAt={snapshot?.generatedAt}
        servers={servers}
        multiServer={multiServer}
        connected={Boolean(snapshot)}
        showProcesses={processesVisible}
        showHealthLog={showHealthLog}
        onToggleHealthLog={() => setShowHealthLog((open) => !open)}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        {snapshot?.error && (
          <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {snapshot.error}
          </p>
        )}

        {showHealthLog && (
          <HealthLog
            cycles={healthLog}
            multiServer={multiServer}
          />
        )}

      {view === "activations" ? (
        <ActivationView
          activations={snapshot?.activations}
          generatedAt={snapshot?.generatedAt}
          liveLines={liveActivations}
          now={now}
          multiServer={multiServer}
        />
      ) : view === "slowdb" ? (
        <SlowDbView
          events={slowDbEvents}
          routineEvents={slowRoutineEvents}
          routineError={snapshot?.slowRoutineError}
          now={now}
          multiServer={multiServer}
        />
      ) : view === "processes" && processesVisible ? (
        <ProcessView
          processes={snapshot?.processes}
          generatedAt={snapshot?.generatedAt}
          liveLines={liveLines}
          now={now}
        />
      ) : (
        <>
      <AlertBanner alerts={snapshot?.alerts ?? []} />
      <FilterBar
        filters={filters}
        servers={snapshot?.servers}
        onChange={setFilters}
      />
      <KpiCards
        values={{
          files: files.length,
          rate,
          warnings: files.reduce((sum, file) => sum + file.warnings, 0),
          errors: files.reduce((sum, file) => sum + file.errors, 0),
          alerts: snapshot?.alerts.length ?? 0,
        }}
      />

      <LastActivityPanel
        files={files}
        liveLines={lines}
        now={now}
        generatedAt={snapshot?.generatedAt}
        multiServer={multiServer}
        selected={filters.file}
        onSelect={(id) => patchFilters({ file: id })}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Log volume by severity"
          description="All received log lines over the last 30 minutes. Info includes Debug. Filters do not apply."
          arrivedAt={volumeArrivedAt}
        >
          <VolumeChart series={snapshot?.series ?? []} />
        </ChartCard>
        <ChartCard
          title="Severity mix"
          description="Totals of the volume chart for the same 30 minutes. Debug is shown separately here."
          arrivedAt={volumeArrivedAt}
        >
          <SeverityChart
            info={severityMix.info}
            warn={severityMix.warn}
            error={severityMix.error}
            debug={severityMix.debug}
          />
        </ChartCard>
        <ChartCard title="CP vs WP traffic" arrivedAt={roleArrivedAt}>
          <RoleChart
            key={`role-${snapshot?.generatedAt ?? 0}`}
            series={snapshot?.series ?? []}
          />
        </ChartCard>
        <ChartCard title="Top files by problems" arrivedAt={topFilesArrivedAt}>
          <TopFilesChart
            files={files}
            multiServer={multiServer}
          />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <FileList
          files={files}
          selected={filters.file}
          multiServer={multiServer}
          onSelect={(name) => patchFilters({ file: name })}
        />
        <AlertList
          alerts={snapshot?.alerts ?? []}
          onFilter={patchFilters}
        />
      </section>

      <LogTail
        lines={tailLines}
        multiServer={multiServer}
      />
        </>
      )}
      </div>
    </div>
  );
}
