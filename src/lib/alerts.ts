import type { Alert, LogLine } from "@/lib/types";
import { DATA_WINDOW_MS, isWithinDataWindow } from "@/lib/data-window";
import { fileKey } from "@/lib/utils";

const MAX_ALERTS = 40;
const GROUP_MS = 10 * 60_000;

export class AlertTracker {
  private alerts: Alert[] = [];
  private errorTimes: number[] = [];
  private warnTimes: number[] = [];
  private nextEventId = 1;

  record(line: LogLine, includeTraces: boolean) {
    if (line.kind === "trace" && !includeTraces) {
      return;
    }
    if (!isWithinDataWindow(line)) {
      return;
    }
    const now = Date.now();
    if (!line.historical) {
      if (line.severity === "error") {
        this.errorTimes.push(now);
      } else if (line.severity === "warn") {
        this.warnTimes.push(now);
      }
    }
    if (line.severity !== "error" && line.severity !== "warn") {
      return;
    }

    const fileId = fileKey(line.server, line.file);
    const eventTs = Date.parse(line.ts);
    const stamp = Number.isNaN(eventTs) ? now : eventTs;
    const existing = this.alerts.find((alert) => {
      if (
        alert.kind !== "event" ||
        alert.file !== fileId ||
        (alert.messageId ?? "") !== (line.messageId ?? "")
      ) {
        return false;
      }
      const alertTs = Date.parse(alert.ts);
      const other = Number.isNaN(alertTs) ? 0 : alertTs;
      return Math.abs(stamp - other) < GROUP_MS;
    });
    if (existing) {
      existing.count += 1;
      existing.ts = line.ts;
      existing.detail = line.message;
      return;
    }

    this.alerts.unshift({
      id: `event:${fileId}:${line.messageId ?? "none"}:${this.nextEventId++}`,
      ts: line.ts,
      level: line.severity === "error" ? "critical" : "warning",
      title: line.messageId
        ? `${line.messageId} in ${line.file}${line.serverHost ? ` @ ${line.serverHost}` : ""}`
        : `${line.severity} in ${line.file}${line.serverHost ? ` @ ${line.serverHost}` : ""}`,
      detail: line.objectName
        ? `${line.objectName}: ${line.message}`
        : line.message,
      count: 1,
      file: fileId,
      messageId: line.messageId,
      kind: "event",
    });
    this.trim();
  }

  evaluateRates(errorPerMin: number, warnPerMin: number) {
    const cutoff = Date.now() - 60_000;
    this.errorTimes = this.errorTimes.filter((time) => time >= cutoff);
    this.warnTimes = this.warnTimes.filter((time) => time >= cutoff);

    this.upsertRate(
      "rate:error",
      "critical",
      "Error rate high",
      `${this.errorTimes.length} errors in the last minute (threshold ${errorPerMin})`,
      this.errorTimes.length,
      errorPerMin,
    );
    this.upsertRate(
      "rate:warn",
      "warning",
      "Warning rate high",
      `${this.warnTimes.length} warnings in the last minute (threshold ${warnPerMin})`,
      this.warnTimes.length,
      warnPerMin,
    );
  }

  list(): Alert[] {
    const cutoff = Date.now() - DATA_WINDOW_MS;
    this.alerts = this.alerts.filter((alert) => {
      if (alert.kind === "rate") {
        return true;
      }
      const ts = Date.parse(alert.ts);
      return Number.isNaN(ts) || ts >= cutoff;
    });
    return this.alerts.map((alert) => ({ ...alert }));
  }

  private upsertRate(
    id: string,
    level: Alert["level"],
    title: string,
    detail: string,
    count: number,
    threshold: number,
  ) {
    const index = this.alerts.findIndex((alert) => alert.id === id);
    if (count < threshold) {
      if (index >= 0) {
        this.alerts.splice(index, 1);
      }
      return;
    }
    const alert: Alert = {
      id,
      ts: new Date().toISOString(),
      level,
      title,
      detail,
      count,
      kind: "rate",
    };
    if (index >= 0) {
      this.alerts[index] = alert;
    } else {
      this.alerts.unshift(alert);
    }
    this.trim();
  }

  private trim() {
    if (this.alerts.length > MAX_ALERTS) {
      this.alerts.length = MAX_ALERTS;
    }
  }
}
