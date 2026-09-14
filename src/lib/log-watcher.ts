import { EventEmitter } from "node:events";
import { isActivationMessage, isLogFile, isSlowDbMessage, isSlowRoutineMessage, isWpLogFile, slowRoutineFingerprint } from "@/lib/ae-meta";
import {
  MAX_ACTIVATION_EVENTS,
  activationFingerprint,
  summarizeActivations,
} from "@/lib/activations";
import {
  isNewerProcess,
  parseProcessFromLine,
  processId,
  summarizeProcesses,
} from "@/lib/processes";
import { AlertTracker } from "@/lib/alerts";
import {
  ACTIVATION_WINDOW_MS,
  DATA_WINDOW_MS,
  PROCESS_WINDOW_MS,
  SNAPSHOT_INTERVAL_MS,
  SLOW_DB_WINDOW_MS,
  eventTime,
  isFileWithinDataWindow,
  isWithinDataWindow,
  isWithinWindow,
  pruneLines,
} from "@/lib/data-window";
import { getEnv, publicEnv } from "@/lib/env";
import { appendHealthCycle } from "@/lib/health-log";
import { timestampMs } from "@/lib/last-timestamps";
import { extractLogTimestamp } from "@/lib/log-parser";
import { ServerSession } from "@/lib/server-session";
import type {
  AeProcess,
  ConnectionStatus,
  HealthCycle,
  LogLine,
  SeriesPoint,
  ServerSnapshot,
  WatchedFile,
  WatcherSnapshot,
} from "@/lib/types";
import { fileKey } from "@/lib/utils";

const WATCHER_VERSION = 36;
const MAX_RECENT = 600;
const MAX_PROBLEMS = 400;
const MAX_SLOW_DB = 2_000;
const MAX_SLOW_ROUTINE = 2_000;
const SERIES_BUCKET_MS = 10_000;
const SERIES_POINTS = 180;

type WatcherEvents = {
  snapshot: [WatcherSnapshot];
  lines: [LogLine[]];
  status: [Pick<WatcherSnapshot, "status" | "error">];
  health: [HealthCycle[]];
};

function combineStatus(statuses: ConnectionStatus[]): ConnectionStatus {
  if (statuses.length === 0) {
    return "disconnected";
  }
  if (statuses.every((status) => status === "live")) {
    return "live";
  }
  if (statuses.some((status) => status === "live")) {
    return "live";
  }
  if (statuses.some((status) => status === "connecting")) {
    return "connecting";
  }
  if (statuses.some((status) => status === "error")) {
    return "error";
  }
  return "disconnected";
}

class LogWatcher extends EventEmitter {
  private sessions: ServerSession[] = [];
  private status: ConnectionStatus = "disconnected";
  private error: string | undefined;
  private startedAt: string | undefined;
  private files = new Map<string, WatchedFile>();
  private recent: LogLine[] = [];
  private problems: LogLine[] = [];
  private slowDbEvents: LogLine[] = [];
  private slowRoutineEvents: LogLine[] = [];
  private slowRoutineSeen = new Map<string, number>();
  private slowRoutineErrors = new Map<string, string>();
  private slowRoutineScannedAt: number | undefined;
  private activationEvents: LogLine[] = [];
  private activationSeen = new Map<string, number>();
  private activationErrors = new Map<string, string>();
  private activationScannedAt: number | undefined;
  private processByName = new Map<string, AeProcess>();
  private processErrors = new Map<string, string>();
  private processScannedAt: number | undefined;
  private series: SeriesPoint[] = [];
  private seriesUpdatedAt: number | undefined;
  private ingestTimes: number[] = [];
  private totalLines = 0;
  private nextId = 1;
  private pendingLines: LogLine[] = [];
  private snapshotTimer: NodeJS.Timeout | undefined;
  private snapshotDebounce: NodeJS.Timeout | undefined;
  private flushTimer: NodeJS.Timeout | undefined;
  private running = false;
  private alerts = new AlertTracker();
  private healthCycles: HealthCycle[] = [];
  private nextHealthId = 1;

  emit<K extends keyof WatcherEvents>(
    event: K,
    ...args: WatcherEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof WatcherEvents>(
    event: K,
    listener: (...args: WatcherEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof WatcherEvents>(
    event: K,
    listener: (...args: WatcherEvents[K]) => void,
  ): this {
    return super.off(event, listener);
  }

  ensureStarted() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.snapshotTimer = setInterval(() => {
      try {
        this.emit("snapshot", this.getSnapshot());
      } catch {
        // keep streaming even if a snapshot build fails
      }
    }, SNAPSHOT_INTERVAL_MS);

    const hooks = {
      nextId: () => this.nextId++,
      onLine: (line: LogLine) => this.accept(line),
      onActivation: (line: LogLine) => this.ingestActivation(line),
      onSlowRoutine: (line: LogLine) => this.ingestSlowRoutine(line),
      onProcess: (line: LogLine) => this.ingestProcess(line),
      onFiles: (serverId: string, files: WatchedFile[]) => {
        this.replaceServerFiles(serverId, files);
        this.emit("snapshot", this.getSnapshot());
      },
      onStatus: () => this.refreshStatus(),
      onActivationError: (serverId: string, error?: string) => {
        if (error) {
          this.activationErrors.set(serverId, error);
        } else {
          this.activationErrors.delete(serverId);
          this.activationScannedAt = Date.now();
        }
        this.emit("snapshot", this.getSnapshot());
      },
      onSlowRoutineError: (serverId: string, error?: string) => {
        if (error) {
          this.slowRoutineErrors.set(serverId, error);
        } else {
          this.slowRoutineErrors.delete(serverId);
          this.slowRoutineScannedAt = Date.now();
        }
        this.emit("snapshot", this.getSnapshot());
      },
      onProcessError: (serverId: string, error?: string) => {
        if (error) {
          this.processErrors.set(serverId, error);
        } else {
          this.processErrors.delete(serverId);
          this.processScannedAt = Date.now();
        }
        this.emit("snapshot", this.getSnapshot());
      },
      onHealthCycle: (cycle: Omit<HealthCycle, "id">) =>
        this.recordHealthCycle(cycle),
    };

    this.sessions = getEnv().sshTargets.map(
      (target) => new ServerSession(target, hooks),
    );
    for (const session of this.sessions) {
      session.start();
    }
    this.refreshStatus();
  }

  stop() {
    this.running = false;
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = undefined;
    }
    if (this.snapshotDebounce) {
      clearTimeout(this.snapshotDebounce);
      this.snapshotDebounce = undefined;
    }
    for (const session of this.sessions) {
      session.stop();
    }
    this.sessions = [];
    this.setStatus("disconnected");
  }

  getHealthLog(): HealthCycle[] {
    return [...this.healthCycles].reverse();
  }

  getSnapshot(options?: { includeHealth?: boolean }): WatcherSnapshot {
    const env = publicEnv();
    const config = getEnv();
    const cutoff = Date.now() - 60_000;
    this.ingestTimes = this.ingestTimes.filter((time) => time >= cutoff);
    this.alerts.evaluateRates(
      config.ALERT_ERROR_PER_MIN,
      config.ALERT_WARN_PER_MIN,
    );
    this.advanceSeries();

    const files = [...this.files.values()]
      .filter((file) => isFileWithinDataWindow(file.mtimeMs))
      .sort(
        (a, b) =>
          a.serverHost.localeCompare(b.serverHost) ||
          a.name.localeCompare(b.name),
      );

    const servers = this.serverSnapshots();

    return {
      status: this.status,
      error: this.error,
      host: env.host,
      port: env.port,
      servers,
      path: env.path,
      pattern: env.pattern,
      startedAt: this.startedAt,
      generatedAt: Date.now(),
      files,
      stats: {
        totalLines: this.totalLines,
        errors: files.reduce((sum, file) => sum + file.errors, 0),
        warnings: files.reduce((sum, file) => sum + file.warnings, 0),
        linesPerMinute: this.ingestTimes.length,
        logFiles: files.filter((file) => file.kind === "log").length,
        traceFiles: files.filter((file) => file.kind === "trace").length,
      },
      series: this.series.map((point) => ({ ...point })),
      seriesUpdatedAt: this.seriesUpdatedAt,
      recent: this.pruneRecent(),
      problems: this.pruneProblems(),
      slowDbEvents: this.pruneSlowDb(),
      slowRoutineEvents: this.pruneSlowRoutines(),
      slowRoutineScannedAt: this.slowRoutineScannedAt,
      slowRoutineError:
        [...this.slowRoutineErrors.values()].join(" · ") || undefined,
      activations: this.getActivationSnapshot(),
      processes: this.getProcessSnapshot(),
      alerts: this.alerts.list(),
      alertConfig: {
        errorPerMin: config.ALERT_ERROR_PER_MIN,
        warnPerMin: config.ALERT_WARN_PER_MIN,
        includeTraces: config.ALERT_INCLUDE_TRACES,
      },
      healthLog: options?.includeHealth ? this.getHealthLog() : [],
    };
  }

  private serverSnapshots(): ServerSnapshot[] {
    if (this.sessions.length > 0) {
      return this.sessions.map((session) => ({
        id: session.target.id,
        host: session.target.host,
        port: session.target.port,
        status: session.status,
        error: session.error,
      }));
    }
    return publicEnv().servers.map((server) => ({
      ...server,
      status: this.status,
      error: this.error,
    }));
  }

  private setStatus(status: ConnectionStatus, error?: string) {
    this.status = status;
    this.error = error;
    this.emit("status", { status, error });
    this.emit("snapshot", this.getSnapshot());
  }

  private refreshStatus() {
    const statuses = this.sessions.map((session) => session.status);
    const next = combineStatus(statuses);
    const errors = this.sessions
      .map((session) => session.error)
      .filter((message): message is string => Boolean(message));
    const down = this.sessions.filter((session) => session.status === "error");
    let error: string | undefined;
    if (down.length > 0 && this.sessions.some((session) => session.status === "live")) {
      error = `${down.map((session) => session.target.host).join(", ")} disconnected; continuing with the remaining server`;
      if (errors.length > 0) {
        error = `${error}. ${errors.join(" · ")}`;
      }
    } else if (errors.length > 0) {
      error = errors.join(" · ");
    }
    const started = this.sessions
      .map((session) => session.startedAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (started) {
      this.startedAt = started;
    }
    this.setStatus(next, error);
  }

  private recordHealthCycle(cycle: Omit<HealthCycle, "id">) {
    appendHealthCycle(this.healthCycles, {
      ...cycle,
      id: this.nextHealthId++,
    });
    this.emit("health", this.getHealthLog());
  }

  private replaceServerFiles(serverId: string, listed: WatchedFile[]) {
    const nextNames = new Set(listed.map((file) => file.name));
    for (const [key, file] of this.files) {
      if (file.server === serverId && !nextNames.has(file.name)) {
        this.files.delete(key);
      }
    }
    for (const file of listed) {
      const key = file.id || fileKey(file.server, file.name);
      const existing = this.files.get(key);
      const listedMs = file.lastTsMs;
      const existingMs = existing?.lastTsMs;
      const listedHasStamp = listedMs !== undefined && Boolean(file.lastTs);
      const keepExisting =
        existingMs !== undefined &&
        (!listedHasStamp || existingMs > listedMs);
      this.files.set(key, {
        ...file,
        id: key,
        lines: existing?.lines ?? 0,
        errors: existing?.errors ?? 0,
        warnings: existing?.warnings ?? 0,
        lastTs: keepExisting ? existing?.lastTs : (file.lastTs ?? existing?.lastTs),
        lastTsMs: keepExisting ? existingMs : (listedHasStamp ? listedMs : existingMs),
      });
    }
  }

  private accept(line: LogLine) {
    if (line.kind !== "log" || !isLogFile(line.file)) {
      return;
    }
    if (!isWithinDataWindow(line)) {
      return;
    }
    const key = fileKey(line.server, line.file);
    const file = this.files.get(key) ?? {
      id: key,
      name: line.file,
      server: line.server,
      serverHost: line.serverHost,
      size: 0,
      mtimeMs: Date.now(),
      lines: 0,
      errors: 0,
      warnings: 0,
      kind: line.kind,
      role: line.role,
      instance: line.instance,
    };
    file.lines += 1;
    file.mtimeMs = Date.now();
    const lineTs = extractLogTimestamp(line.raw);
    if (lineTs) {
      const tsMs = timestampMs(lineTs) ?? eventTime({ ts: lineTs, receivedAt: line.receivedAt });
      if (file.lastTsMs === undefined || tsMs >= file.lastTsMs) {
        file.lastTs = lineTs;
        file.lastTsMs = tsMs;
      }
    }
    if (line.severity === "error") {
      file.errors += 1;
    } else if (line.severity === "warn") {
      file.warnings += 1;
    }
    this.files.set(key, file);
    this.totalLines += 1;
    line.receivedAt = Date.now();

    this.recent.push(line);
    if (line.severity === "error" || line.severity === "warn") {
      this.problems.push(line);
    }
    if (isSlowDbMessage(line.messageId)) {
      this.slowDbEvents.push(line);
    }
    this.ingestSlowRoutine(line);
    this.ingestActivation(line);
    this.ingestProcess(line);
    this.pruneRecent();
    this.pruneProblems();
    this.pruneSlowDb();
    this.pruneSlowRoutines();

    const env = getEnv();
    this.alerts.record(line, env.ALERT_INCLUDE_TRACES);
    this.alerts.evaluateRates(env.ALERT_ERROR_PER_MIN, env.ALERT_WARN_PER_MIN);

    if (!line.historical) {
      this.ingestTimes.push(Date.now());
    }
    this.bumpSeries(line);

    this.pendingLines.push(line);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushLines(), 200);
    }
  }

  private ingestActivation(line: LogLine) {
    if (!isActivationMessage(line.messageId) || !isWpLogFile(line.file)) {
      return;
    }
    if (!isWithinWindow(line, ACTIVATION_WINDOW_MS)) {
      return;
    }
    const fingerprint = activationFingerprint(line);
    if (this.activationSeen.has(fingerprint)) {
      return;
    }
    this.activationSeen.set(fingerprint, eventTime(line));
    this.activationEvents.push(line);
    this.pruneActivations();
  }

  private pruneActivations() {
    this.activationEvents = pruneLines(
      this.activationEvents,
      ACTIVATION_WINDOW_MS,
    ).filter((line) => isWpLogFile(line.file));
    if (this.activationEvents.length > MAX_ACTIVATION_EVENTS) {
      this.activationEvents.splice(
        0,
        this.activationEvents.length - MAX_ACTIVATION_EVENTS,
      );
    }
    const cutoff = Date.now() - ACTIVATION_WINDOW_MS;
    for (const [fingerprint, time] of this.activationSeen) {
      if (time < cutoff) {
        this.activationSeen.delete(fingerprint);
      }
    }
    return this.activationEvents;
  }

  private getActivationSnapshot() {
    const summary = summarizeActivations(this.pruneActivations());
    const errors = [...this.activationErrors.values()];
    return {
      ...summary,
      scannedAt: this.activationScannedAt,
      error: errors.length > 0 ? errors.join(" · ") : undefined,
    };
  }

  private ingestProcess(line: LogLine) {
    const process = parseProcessFromLine(line);
    if (!process) {
      return;
    }
    const key = processId(process);
    if (!key) {
      return;
    }
    const existing = this.processByName.get(key);
    if (existing && !isNewerProcess(process, existing)) {
      return;
    }
    this.processByName.set(key, process);
  }

  private pruneProcesses() {
    const cutoff = Date.now() - PROCESS_WINDOW_MS;
    for (const [key, process] of this.processByName) {
      if (eventTime(process) < cutoff) {
        this.processByName.delete(key);
      }
    }
    return [...this.processByName.values()];
  }

  private getProcessSnapshot() {
    const summary = summarizeProcesses(this.pruneProcesses());
    const errors = [...this.processErrors.values()];
    return {
      ...summary,
      scannedAt: this.processScannedAt,
      error: errors.length > 0 ? errors.join(" · ") : undefined,
    };
  }

  private ingestSlowRoutine(line: LogLine) {
    if (!isSlowRoutineMessage(line.messageId) || !isLogFile(line.file)) {
      return;
    }
    if (!isWithinWindow(line, SLOW_DB_WINDOW_MS)) {
      return;
    }
    const fingerprint = slowRoutineFingerprint(line);
    if (this.slowRoutineSeen.has(fingerprint)) {
      return;
    }
    if (!line.receivedAt) {
      line.receivedAt = Date.now();
    }
    this.slowRoutineSeen.set(fingerprint, eventTime(line));
    this.slowRoutineEvents.push(line);
    this.pruneSlowRoutines();
  }

  private pruneSlowRoutines() {
    this.slowRoutineEvents = pruneLines(
      this.slowRoutineEvents,
      SLOW_DB_WINDOW_MS,
    );
    if (this.slowRoutineEvents.length > MAX_SLOW_ROUTINE) {
      this.slowRoutineEvents.splice(
        0,
        this.slowRoutineEvents.length - MAX_SLOW_ROUTINE,
      );
    }
    const cutoff = Date.now() - SLOW_DB_WINDOW_MS;
    for (const [fingerprint, time] of this.slowRoutineSeen) {
      if (time < cutoff) {
        this.slowRoutineSeen.delete(fingerprint);
      }
    }
    return this.slowRoutineEvents;
  }

  private pruneSlowDb() {
    this.slowDbEvents = pruneLines(this.slowDbEvents, SLOW_DB_WINDOW_MS);
    if (this.slowDbEvents.length > MAX_SLOW_DB) {
      this.slowDbEvents.splice(0, this.slowDbEvents.length - MAX_SLOW_DB);
    }
    return this.slowDbEvents;
  }

  private pruneProblems() {
    this.problems = pruneLines(this.problems, DATA_WINDOW_MS);
    if (this.problems.length > MAX_PROBLEMS) {
      this.problems.splice(0, this.problems.length - MAX_PROBLEMS);
    }
    return this.problems;
  }

  private pruneRecent() {
    const isProblem = (line: LogLine) =>
      line.severity === "error" || line.severity === "warn";

    this.recent = pruneLines(this.recent, DATA_WINDOW_MS);
    while (this.recent.length > MAX_RECENT) {
      const dropInfo = this.recent.findIndex((line) => !isProblem(line));
      this.recent.splice(dropInfo >= 0 ? dropInfo : 0, 1);
    }
    return this.recent;
  }

  private emptySeriesPoint(t: number): SeriesPoint {
    return {
      t,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
      cp: 0,
      wp: 0,
      log: 0,
      trace: 0,
      slowDb: 0,
    };
  }

  private advanceSeries() {
    const bucket = Math.floor(Date.now() / SERIES_BUCKET_MS) * SERIES_BUCKET_MS;
    const last = this.series[this.series.length - 1];
    if (!last) {
      this.series.push(this.emptySeriesPoint(bucket));
    } else {
      for (let t = last.t + SERIES_BUCKET_MS; t <= bucket; t += SERIES_BUCKET_MS) {
        this.series.push(this.emptySeriesPoint(t));
      }
    }
    const cutoff = bucket - SERIES_POINTS * SERIES_BUCKET_MS;
    this.series = this.series.filter((point) => point.t >= cutoff);
    if (this.series.length > SERIES_POINTS) {
      this.series.splice(0, this.series.length - SERIES_POINTS);
    }
  }

  private bumpSeries(line: LogLine) {
    this.advanceSeries();
    const point = this.series[this.series.length - 1];
    if (!point) {
      return;
    }
    if (line.severity === "error") {
      point.error += 1;
    } else if (line.severity === "warn") {
      point.warn += 1;
    } else if (line.severity === "debug") {
      point.debug += 1;
    } else {
      point.info += 1;
    }
    if (line.role === "CP") {
      point.cp += 1;
    } else if (line.role === "WP") {
      point.wp += 1;
    }
    if (line.kind === "trace") {
      point.trace += 1;
    } else {
      point.log += 1;
    }
    if (isSlowDbMessage(line.messageId)) {
      point.slowDb += 1;
    }
    this.seriesUpdatedAt = line.receivedAt ?? Date.now();
  }

  private flushLines() {
    this.flushTimer = undefined;
    if (this.pendingLines.length === 0) {
      return;
    }
    const batch = this.pendingLines;
    this.pendingLines = [];
    this.emit("lines", batch);
    this.scheduleSnapshot();
  }

  private scheduleSnapshot() {
    if (this.snapshotDebounce) {
      return;
    }
    this.snapshotDebounce = setTimeout(() => {
      this.snapshotDebounce = undefined;
      try {
        this.emit("snapshot", this.getSnapshot());
      } catch {
        // live lines still flush even if the snapshot build fails
      }
    }, 2_000);
  }
}

const globalForWatcher = globalThis as typeof globalThis & {
  __logwatch?: LogWatcher;
  __logwatchVersion?: number;
};

export function getLogWatcher(): LogWatcher {
  if (
    !globalForWatcher.__logwatch ||
    globalForWatcher.__logwatchVersion !== WATCHER_VERSION
  ) {
    const previous = globalForWatcher.__logwatch as
      | { stop?: () => void }
      | undefined;
    try {
      previous?.stop?.();
    } catch {
      // previous watcher from an older module
    }
    globalForWatcher.__logwatch = new LogWatcher();
    globalForWatcher.__logwatchVersion = WATCHER_VERSION;
  }
  return globalForWatcher.__logwatch;
}
