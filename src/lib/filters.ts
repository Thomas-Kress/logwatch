import { normalizeMessageId } from "@/lib/ae-meta";
import type { DashboardFilters, LogLine, WatchedFile } from "@/lib/types";
import { fileKey } from "@/lib/utils";

export function isProblemLine(line: LogLine) {
  return line.severity === "error" || line.severity === "warn";
}

export function matchesTailLine(line: LogLine, filters: DashboardFilters) {
  if (!isProblemLine(line)) {
    return false;
  }
  const severity =
    filters.severity === "error" || filters.severity === "warn"
      ? filters.severity
      : "all";
  return matchesLine(line, { ...filters, severity });
}

export const defaultFilters: DashboardFilters = {
  kind: "log",
  role: "all",
  severity: "all",
  query: "",
  messageId: "",
  runId: "",
  file: "",
  server: "",
};

function fileMatchesFilter(
  fileName: string,
  fileId: string | undefined,
  server: string | undefined,
  filters: Pick<DashboardFilters, "file" | "server">,
) {
  if (filters.server && server !== filters.server) {
    return false;
  }
  if (!filters.file) {
    return true;
  }
  return filters.file === fileId || filters.file === fileName;
}

export function matchesFile(
  file: WatchedFile,
  filters: Pick<DashboardFilters, "kind" | "role" | "file" | "server">,
) {
  if (!fileMatchesFilter(file.name, file.id, file.server, filters)) {
    return false;
  }
  if (filters.kind !== "all" && file.kind !== filters.kind) {
    return false;
  }
  if (filters.role !== "all" && file.role !== filters.role) {
    return false;
  }
  return true;
}

export function matchesLine(line: LogLine, filters: DashboardFilters) {
  if (
    !fileMatchesFilter(
      line.file,
      fileKey(line.server, line.file),
      line.server,
      filters,
    )
  ) {
    return false;
  }
  if (filters.kind !== "all" && line.kind !== filters.kind) {
    return false;
  }
  if (filters.role !== "all" && line.role !== filters.role) {
    return false;
  }
  if (filters.severity !== "all" && line.severity !== filters.severity) {
    return false;
  }
  if (filters.messageId) {
    const wanted = normalizeMessageId(filters.messageId);
    if (!line.messageId || normalizeMessageId(line.messageId) !== wanted) {
      return false;
    }
  }
  if (filters.runId && line.runId !== filters.runId && !line.raw.includes(filters.runId)) {
    return false;
  }
  if (filters.query) {
    const q = filters.query.toLowerCase();
    const haystack = [
      line.raw,
      line.message,
      line.messageId,
      line.runId,
      line.objectName,
      line.file,
      line.serverHost,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) {
      return false;
    }
  }
  return true;
}
