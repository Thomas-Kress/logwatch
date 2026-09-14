export type FileKind = "log" | "trace" | "other";
export type FileRole = "CP" | "WP" | "JWP" | "JCP" | "REST" | "other";

export type FileMeta = {
  kind: FileKind;
  role: FileRole;
  instance?: string;
};

const FILE_NAME =
  /^(JWP|JCP|REST|CP|WP)srv_(log|trc)_(\d+)/i;

export function parseFileMeta(name: string): FileMeta {
  const match = name.match(FILE_NAME);
  if (!match) {
    const kind: FileKind = /_trc_/i.test(name)
      ? "trace"
      : /_log_/i.test(name)
        ? "log"
        : "other";
    return { kind, role: "other" };
  }

  return {
    role: match[1].toUpperCase() as FileRole,
    kind: match[2].toLowerCase() === "trc" ? "trace" : "log",
    instance: match[3],
  };
}

export function isLogFile(name: string): boolean {
  return parseFileMeta(name).kind === "log";
}

export function isWpLogFile(name: string): boolean {
  const meta = parseFileMeta(name);
  return meta.kind === "log" && meta.role === "WP";
}

export function extractRunId(text: string): string | undefined {
  return text.match(/RunID\s+'(\d+)'/i)?.[1];
}

export function extractObjectName(text: string): string | undefined {
  const typed = text.match(
    /\b(?:Workflow|Job|Schedule|Script|Event|Object|JOBP|JOBS|JSCH|SCRI|EVNT)\s+'([^']+)'/i,
  );
  if (typed?.[1]) {
    return typed[1];
  }
  return text.match(
    /'((?:JOBS|JOBP|JSCH|SCRI|EVNT|CALE|VARA|USER|LOGIN|CONN|HOST)\.[^']+)'/i,
  )?.[1];
}

export const SLOW_DB_MESSAGE_ID = "U00003524";
export const SLOW_ROUTINE_MESSAGE_ID = "U00003434";
export const ACTIVATION_MESSAGE_ID = "U00007000";

const SLOW_DB_MESSAGE_IDS = new Set(["U00003524"]);
const SLOW_ROUTINE_MESSAGE_IDS = new Set(["U00003434"]);
const ACTIVATION_MESSAGE_IDS = new Set(["U00007000"]);
const ACTIVATION_RE = /'([^']+)'\s+activated with RunID\s+'(\d+)'/i;

const SLOW_DB_OPC = /OPC:\s*'([^']+)'/i;
const SLOW_DB_TIME = /time:\s*'([^']+)'/i;
const SLOW_ROUTINE_RE =
  /Server routine\s+'([^']+)'\s+required\s+'([^']+)'\s+minutes\s+and\s+'([^']+)'\s+seconds/i;
const DURATION_CLOCK = /^(\d+):(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const DURATION_MS = /^(\d+(?:\.\d+)?)\s*ms$/i;
const DURATION_SEC = /^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$/i;

export const OPC_LABELS: Record<string, string> = {
  BIND: "Bind",
  CLSE: "Close connection",
  CMIT: "Commit",
  DBPC: "DB procedure",
  DELE: "Delete",
  DELT: "Delete",
  EXEC: "Execute",
  FETC: "Fetch",
  INSE: "Insert",
  INSR: "Insert",
  OPEN: "Open connection",
  PREP: "Prepare",
  ROLL: "Rollback",
  SLCO: "Select",
  SLCT: "Select",
  SLCU: "Select",
  UPDT: "Update",
};

export type SlowDbCall = {
  opc: string;
  operation: string;
  durationMs?: number;
};

export type SlowRoutineCall = {
  routine: string;
  module: string;
  name: string;
  durationMs?: number;
};

export function opcLabel(opc: string): string {
  const key = opc.trim().toUpperCase();
  return OPC_LABELS[key] ?? key;
}

export function normalizeMessageId(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return "";
  }
  const withU = trimmed.startsWith("U") ? trimmed : `U${trimmed}`;
  const digits = withU.match(/^U(\d{1,8})$/);
  if (!digits) {
    return withU;
  }
  return `U${digits[1].padStart(8, "0")}`;
}

export function isSlowDbMessage(messageId?: string): boolean {
  if (!messageId) {
    return false;
  }
  return SLOW_DB_MESSAGE_IDS.has(normalizeMessageId(messageId));
}

export function isSlowRoutineMessage(messageId?: string): boolean {
  if (!messageId) {
    return false;
  }
  return SLOW_ROUTINE_MESSAGE_IDS.has(normalizeMessageId(messageId));
}

export function splitRoutine(routine: string): { module: string; name: string } {
  const trimmed = routine.replace(/\s+/g, " ").trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) {
    return { module: "", name: trimmed };
  }
  return {
    module: trimmed.slice(0, slash).trim(),
    name: trimmed.slice(slash + 1).trim(),
  };
}

export function routineLabel(routine: string): string {
  const { name } = splitRoutine(routine);
  return name || routine;
}

export function isActivationMessage(messageId?: string): boolean {
  if (!messageId) {
    return false;
  }
  return ACTIVATION_MESSAGE_IDS.has(normalizeMessageId(messageId));
}

export type ActivationCall = {
  objectName: string;
  runId: string;
};

export function parseActivation(text: string): ActivationCall | undefined {
  const match = text.match(ACTIVATION_RE);
  if (!match) {
    return undefined;
  }
  return { objectName: match[1], runId: match[2] };
}

export function parseSlowDbCall(text: string): SlowDbCall | undefined {
  const opcMatch = text.match(SLOW_DB_OPC);
  if (!opcMatch) {
    return undefined;
  }
  const opc = opcMatch[1].toUpperCase();
  const timeMatch = text.match(SLOW_DB_TIME);
  return {
    opc,
    operation: opcLabel(opc),
    durationMs: timeMatch ? parseDuration(timeMatch[1]) : undefined,
  };
}

export function parseSlowRoutine(text: string): SlowRoutineCall | undefined {
  const match = text.match(SLOW_ROUTINE_RE);
  if (!match) {
    return undefined;
  }
  const routine = match[1].replace(/\s+/g, " ").trim();
  if (!routine) {
    return undefined;
  }
  const { module, name } = splitRoutine(routine);
  const minutes = parseLocaleNumber(match[2]);
  const seconds = parseLocaleNumber(match[3]);
  let durationMs: number | undefined;
  if (minutes !== undefined && seconds !== undefined) {
    durationMs = (minutes * 60 + seconds) * 1000;
  } else if (seconds !== undefined) {
    durationMs = seconds * 1000;
  } else if (minutes !== undefined) {
    durationMs = minutes * 60 * 1000;
  }
  return {
    routine,
    module,
    name: name || routine,
    durationMs,
  };
}

export function slowRoutineFingerprint(line: {
  file: string;
  ts: string;
  raw: string;
  server?: string;
}) {
  return `${line.server ?? ""}\t${line.file}\t${line.ts}\t${line.raw}`;
}

function parseLocaleNumber(value: string): number | undefined {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+[.,]\d+$/.test(trimmed)) {
    const parsed = Number(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return undefined;
}

function parseDuration(value: string): number | undefined {
  const trimmed = value.trim();
  const clock = trimmed.match(DURATION_CLOCK);
  if (clock) {
    return (
      Number(clock[1]) * 1000 +
      Number(clock[2]) +
      Number(clock[3]) / 1000 +
      Number(clock[4]) / 1e6
    );
  }
  const millis = trimmed.match(DURATION_MS);
  if (millis) {
    return Number(millis[1]);
  }
  const seconds = trimmed.match(DURATION_SEC);
  if (seconds) {
    return Number(seconds[1]) * 1000;
  }
  return undefined;
}

export function formatDuration(durationMs: number): string {
  if (durationMs >= 10_000) {
    return `${(durationMs / 1000).toFixed(1)} s`;
  }
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)} s`;
  }
  return `${Math.round(durationMs)} ms`;
}
