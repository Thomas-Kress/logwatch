import {
  extractObjectName,
  extractRunId,
  isActivationMessage,
  isSlowDbMessage,
  isSlowRoutineMessage,
  parseActivation,
  parseFileMeta,
  parseSlowDbCall,
  parseSlowRoutine,
} from "@/lib/ae-meta";
import { severityForMessageId } from "@/lib/severity-catalog";
import type { LogLine, Severity } from "@/lib/types";

const AUTOMIC_LINE =
  /^(\d{8})\/(\d{6})(?:\.(\d{1,3}))?\s+-\s+(?:(\d+)\s+)?(?:(U\d{7,8})\s+)?(.*)$/;
const AUTOMIC_STAMP = /(\d{8})\/(\d{6})(?:\.(\d{1,3}))?/;
const ISO_LINE =
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(.*)$/;
const TAIL_HEADER = /^==>\s+(.+?)\s+<==\s*$/;
const HEX_DUMP = /^\d{8}\s+[0-9A-Fa-f]{8}\b/;
const MESSAGE_ID = /\b(U\d{7,8})\b/;

const ERROR_RE =
  /\b(ended abnormally|ended_not_ok|en_abend|abend(?:ed)?|abort(?:ed)?|fatal|exception|unsuccessful|unable to|not possible|access denied|could not|cannot\b|failed|failure|error in\b|errors?\b)\b/i;
const WARN_RE =
  /\b(warn(?:ing)?s?|timed out|retry(?:ing)?|deprecated|delayed|skipped|time critical)\b/i;

export function isTailHeader(line: string): string | undefined {
  const match = line.match(TAIL_HEADER);
  return match?.[1]?.replace(/^.*[\\/]/, "");
}

export function classifySeverity(
  text: string,
  kind: LogLine["kind"],
  messageId?: string,
): Severity {
  if (HEX_DUMP.test(text) || /^Network:/i.test(text)) {
    return "debug";
  }
  const cataloged = severityForMessageId(messageId);
  if (cataloged) {
    return cataloged;
  }
  if (/^\s*\[?(ERR(?:OR)?|FATAL|CRITICAL)\]/i.test(text) || /^ERROR\s*:/i.test(text)) {
    return "error";
  }
  if (/^\s*\[?WARN(?:ING)?\]/i.test(text) || /^WARNING\s*:/i.test(text)) {
    return "warn";
  }
  if (ERROR_RE.test(text)) {
    return "error";
  }
  if (WARN_RE.test(text)) {
    return "warn";
  }
  if (kind === "trace") {
    return "debug";
  }
  return "info";
}

function automicTimestamp(date: string, time: string, fraction?: string) {
  const ms = (fraction ?? "000").padEnd(3, "0").slice(0, 3);
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.${ms}`;
}

export function extractLogTimestamp(text: string): string | undefined {
  const automic = text.match(AUTOMIC_STAMP);
  if (automic) {
    return automicTimestamp(automic[1], automic[2], automic[3]);
  }
  const iso = text.match(ISO_LINE);
  if (iso) {
    return iso[1].replace(" ", "T");
  }
  return undefined;
}

function enrich(line: Omit<LogLine, "runId" | "objectName">): LogLine {
  const slowDb =
    isSlowDbMessage(line.messageId) || /time critical db call/i.test(line.message)
      ? parseSlowDbCall(line.raw) ?? parseSlowDbCall(line.message)
      : undefined;
  const slowRoutine =
    isSlowRoutineMessage(line.messageId) || /Server routine\s+'/i.test(line.message)
      ? parseSlowRoutine(line.raw) ?? parseSlowRoutine(line.message)
      : undefined;
  const activation =
    isActivationMessage(line.messageId) || /activated with RunID/i.test(line.message)
      ? parseActivation(line.raw) ?? parseActivation(line.message)
      : undefined;
  return {
    ...line,
    runId:
      activation?.runId ??
      extractRunId(line.raw) ??
      extractRunId(line.message),
    objectName:
      activation?.objectName ??
      extractObjectName(line.raw) ??
      extractObjectName(line.message),
    opc: slowDb?.opc,
    operation: slowDb?.operation,
    durationMs: slowDb?.durationMs ?? slowRoutine?.durationMs,
    routine: slowRoutine?.routine,
    routineModule: slowRoutine?.module,
  };
}

export function parseLogLine(
  raw: string,
  file: string,
  id: number,
  historical = false,
  server?: { id: string; host: string },
): LogLine | undefined {
  const trimmed = raw.replace(/\r$/, "");
  if (!trimmed || trimmed.startsWith("tail: ")) {
    return undefined;
  }

  const meta = parseFileMeta(file);
  const automic = trimmed.match(AUTOMIC_LINE);
  if (automic) {
    const [, date, time, fraction, thread, messageId, rest] = automic;
    const message = (rest || trimmed).trim();
    const resolvedId = messageId ?? message.match(MESSAGE_ID)?.[1];
    return enrich({
      id,
      ts: automicTimestamp(date, time, fraction),
      file,
      server: server?.id ?? "",
      serverHost: server?.host ?? "",
      kind: meta.kind,
      role: meta.role,
      instance: meta.instance,
      thread,
      severity: classifySeverity(message, meta.kind, resolvedId),
      messageId: resolvedId,
      message: message || trimmed,
      raw: trimmed,
      historical,
    });
  }

  const iso = trimmed.match(ISO_LINE);
  if (iso) {
    const [, ts, rest] = iso;
    const resolvedId = rest.match(MESSAGE_ID)?.[1];
    return enrich({
      id,
      ts: ts.replace(" ", "T"),
      file,
      server: server?.id ?? "",
      serverHost: server?.host ?? "",
      kind: meta.kind,
      role: meta.role,
      instance: meta.instance,
      severity: classifySeverity(rest, meta.kind, resolvedId),
      messageId: resolvedId,
      message: rest,
      raw: trimmed,
      historical,
    });
  }

  const resolvedId = trimmed.match(MESSAGE_ID)?.[1];
  return enrich({
    id,
    ts: new Date().toISOString(),
    file,
    server: server?.id ?? "",
    serverHost: server?.host ?? "",
    kind: meta.kind,
    role: meta.role,
    instance: meta.instance,
    severity: classifySeverity(trimmed, meta.kind, resolvedId),
    messageId: resolvedId,
    message: trimmed,
    raw: trimmed,
    historical,
  });
}
