import type { FileKind, FileRole } from "@/lib/ae-meta";

export type { FileKind, FileRole };

export type Severity = "debug" | "info" | "warn" | "error" | "unknown";

export type ConnectionStatus = "disconnected" | "connecting" | "live" | "error";

export type LogLine = {
  id: number;
  ts: string;
  file: string;
  server: string;
  serverHost: string;
  kind: FileKind;
  role: FileRole;
  instance?: string;
  thread?: string;
  severity: Severity;
  messageId?: string;
  opc?: string;
  operation?: string;
  durationMs?: number;
  routine?: string;
  routineModule?: string;
  runId?: string;
  objectName?: string;
  message: string;
  raw: string;
  historical?: boolean;
  receivedAt?: number;
};

export type WatchedFile = {
  id: string;
  name: string;
  server: string;
  serverHost: string;
  size: number;
  mtimeMs: number;
  lastTs?: string;
  lastTsMs?: number;
  lines: number;
  errors: number;
  warnings: number;
  kind: FileKind;
  role: FileRole;
  instance?: string;
};

export type SeriesPoint = {
  t: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
  cp: number;
  wp: number;
  log: number;
  trace: number;
  slowDb: number;
};

export type AlertLevel = "critical" | "warning";

export type Alert = {
  id: string;
  ts: string;
  level: AlertLevel;
  title: string;
  detail: string;
  count: number;
  file?: string;
  messageId?: string;
  kind: "rate" | "event";
};

export type DashboardFilters = {
  kind: FileKind | "all";
  role: FileRole | "all";
  severity: Severity | "all";
  query: string;
  messageId: string;
  runId: string;
  file: string;
  server: string;
};

export type ActivationHourPoint = {
  t: number;
  count: number;
  cp: number;
  wp: number;
  jwp: number;
  jcp: number;
  rest: number;
  other: number;
};

export type ActivationFileStat = {
  file: string;
  server?: string;
  serverHost?: string;
  role: FileRole;
  count: number;
};

export type ServerSnapshot = {
  id: string;
  host: string;
  port: number;
  status: ConnectionStatus;
  error?: string;
};

export type ActivationObjectStat = {
  objectName: string;
  count: number;
};

export type ActivationSnapshot = {
  total: number;
  files: number;
  objects: number;
  windowHours: number;
  scannedAt?: number;
  error?: string;
  hourly: ActivationHourPoint[];
  byFile: ActivationFileStat[];
  byObject: ActivationObjectStat[];
  recent: LogLine[];
};

export type AeProcess = {
  name: string;
  type: string;
  connections: number;
  host: string;
  port: number;
  startTime: string;
  lastUpdateTime: string;
  ts: string;
  file: string;
  server: string;
  serverHost: string;
  historical?: boolean;
  receivedAt?: number;
};

export type AeProcessTypeStat = {
  type: string;
  count: number;
};

export type AeProcessHostStat = {
  host: string;
  count: number;
};

export type AeProcessSnapshot = {
  total: number;
  hosts: number;
  dumpTs?: string;
  scannedAt?: number;
  error?: string;
  byType: AeProcessTypeStat[];
  byHost: AeProcessHostStat[];
  processes: AeProcess[];
};

export type HealthCycle = {
  id: number;
  at: number;
  server: string;
  serverHost: string;
  linesSelected: number;
  changedFiles: string[];
  unchangedFiles: string[];
};

export type WatcherSnapshot = {
  status: ConnectionStatus;
  error?: string;
  host: string;
  port: number;
  servers: ServerSnapshot[];
  path: string;
  pattern: string;
  startedAt?: string;
  generatedAt: number;
  files: WatchedFile[];
  stats: {
    totalLines: number;
    errors: number;
    warnings: number;
    linesPerMinute: number;
    logFiles: number;
    traceFiles: number;
  };
  series: SeriesPoint[];
  seriesUpdatedAt?: number;
  recent: LogLine[];
  problems: LogLine[];
  slowDbEvents: LogLine[];
  slowRoutineEvents: LogLine[];
  slowRoutineScannedAt?: number;
  slowRoutineError?: string;
  activations: ActivationSnapshot;
  processes: AeProcessSnapshot;
  alerts: Alert[];
  alertConfig: {
    errorPerMin: number;
    warnPerMin: number;
    includeTraces: boolean;
  };
  healthLog: HealthCycle[];
};
