import { EventEmitter } from "node:events";
import type { Client, ClientChannel } from "ssh2";
import { isLogFile, isWpLogFile, parseFileMeta, SLOW_ROUTINE_MESSAGE_ID } from "@/lib/ae-meta";
import { automicStamp } from "@/lib/activations";
import {
  ACTIVATION_WINDOW_MS,
  DATA_WINDOW_MINUTES,
  PROCESS_WINDOW_MS,
  SLOW_DB_WINDOW_MS,
  UPDATE_INTERVAL_MS,
  isFileWithinDataWindow,
} from "@/lib/data-window";
import type { SshTarget } from "@/lib/env";
import { getEnv } from "@/lib/env";
import {
  classifyCycleFiles,
  indexListedFiles,
} from "@/lib/health-log";
import { applyLastTimestamps, parseLastTimestampRows } from "@/lib/last-timestamps";
import { isTailHeader, parseLogLine } from "@/lib/log-parser";
import { connectSsh, execCommand } from "@/lib/ssh";
import type {
  ConnectionStatus,
  HealthCycle,
  LogLine,
  WatchedFile,
} from "@/lib/types";
import { fileKey, posixQuote } from "@/lib/utils";

const BACKFILL_MS = 1_500;
const RECONNECT_MAX_MS = 15_000;
const PROCESS_SCAN_FILES = 8;
const PROCESS_TAIL_LINES = 8_000;
const LAST_TS_TAIL_LINES = 250;
const PROCESS_AWK =
  'match($0, /[0-9]{8}\\/[0-9]{6}/) && substr($0, RSTART, RLENGTH) >= cutoff && match($0, /[A-Za-z0-9_-]+#[A-Za-z]+[0-9]+[ \\t]+[A-Za-z]+[ \\t]+[0-9]+[ \\t]+[^ \\t]+[ \\t]+[0-9]+[ \\t]+[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/) { print fname "\\t" $0 }';

export type ServerSessionHooks = {
  nextId: () => number;
  onLine: (line: LogLine) => void;
  onActivation: (line: LogLine) => void;
  onSlowRoutine: (line: LogLine) => void;
  onProcess: (line: LogLine) => void;
  onFiles: (serverId: string, files: WatchedFile[]) => void;
  onStatus: (serverId: string, status: ConnectionStatus, error?: string) => void;
  onActivationError: (serverId: string, error?: string) => void;
  onSlowRoutineError: (serverId: string, error?: string) => void;
  onProcessError: (serverId: string, error?: string) => void;
  onHealthCycle: (cycle: Omit<HealthCycle, "id">) => void;
};

export class ServerSession {
  status: ConnectionStatus = "disconnected";
  error: string | undefined;
  startedAt: string | undefined;
  private readonly events = new EventEmitter();

  private client: Client | undefined;
  private tailStream: ClientChannel | undefined;
  private lineBuffer = "";
  private currentFile = "";
  private tailedNames: string[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempt = 0;
  private running = false;
  private backfillUntil = 0;
  private scanningActivations = false;
  private activationScannedAt: number | undefined;
  private scanningSlowRoutines = false;
  private slowRoutineScannedAt: number | undefined;
  private scanningProcesses = false;
  private processScannedAt: number | undefined;
  private processScanKey: string | undefined;
  private scanningLastTimestamps = false;
  private lastTimestampScanKey: string | undefined;
  private previousFiles = new Map<string, { size: number; mtimeMs: number }>();
  private cycleLineCount = 0;
  private incoming: string[] = [];
  private remainingHistorical = 0;
  private drainHistorical = false;
  private consumePump: NodeJS.Timeout | undefined;

  constructor(
    readonly target: SshTarget,
    private readonly hooks: ServerSessionHooks,
  ) {}

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.cleanupSession();
    this.setStatus("disconnected");
  }

  private setStatus(status: ConnectionStatus, error?: string) {
    this.status = status;
    this.error = error;
    this.events.emit("status");
    this.hooks.onStatus(this.target.id, status, error);
  }

  private async loop() {
    while (this.running) {
      try {
        this.setStatus("connecting");
        this.client = await connectSsh(this.target);
        this.client.on("close", () => {
          if (this.running && this.status === "live") {
            this.scheduleReconnect("SSH connection closed");
          }
        });
        this.client.on("error", (error) => {
          if (this.running) {
            this.scheduleReconnect(error.message);
          }
        });

        this.startedAt = new Date().toISOString();
        this.reconnectAttempt = 0;
        this.setStatus("live");
        await this.refreshFilesAndTail();
        this.refreshTimer = setInterval(() => {
          void this.refreshFilesAndTail().catch((error: unknown) => {
            this.scheduleReconnect(
              error instanceof Error ? error.message : String(error),
            );
          });
        }, Math.min(getEnv().FILE_REFRESH_MS, UPDATE_INTERVAL_MS));

        await this.waitUntilStoppedOrDisconnected();
        if (this.running && this.status === "error") {
          await this.waitForReconnect();
        }
      } catch (error) {
        this.scheduleReconnect(
          error instanceof Error ? error.message : String(error),
        );
        await this.waitForReconnect();
      }
    }
  }

  private waitUntilStoppedOrDisconnected() {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (!this.running || this.status === "error" || !this.client) {
          this.events.off("status", check);
          resolve();
          return;
        }
        this.events.once("status", check);
      };
      check();
    });
  }

  private waitForReconnect() {
    return new Promise<void>((resolve) => {
      if (!this.running) {
        resolve();
        return;
      }
      const delay = Math.min(
        1000 * 2 ** this.reconnectAttempt,
        RECONNECT_MAX_MS,
      );
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(resolve, delay);
    });
  }

  private scheduleReconnect(message: string) {
    this.cleanupSession();
    if (this.running) {
      this.setStatus("error", `${this.target.host}: ${message}`);
    }
  }

  private cleanupSession() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.tailStream) {
      this.tailStream.removeAllListeners();
      this.tailStream.close();
      this.tailStream = undefined;
    }
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end();
      this.client = undefined;
    }
    this.lineBuffer = "";
    this.tailedNames = [];
    this.incoming = [];
    this.remainingHistorical = 0;
    this.drainHistorical = false;
    if (this.consumePump) {
      clearTimeout(this.consumePump);
      this.consumePump = undefined;
    }
    this.processScanKey = undefined;
    this.lastTimestampScanKey = undefined;
  }

  private async refreshFilesAndTail() {
    if (!this.client) {
      return;
    }

    const env = getEnv();
    const listed = await this.listFiles();
    const nextNames = listed.map((file) => file.name).sort();
    this.recordHealthCycle(listed);
    this.hooks.onFiles(this.target.id, listed);

    const sameTailSet =
      nextNames.length === this.tailedNames.length &&
      nextNames.every((name, index) => name === this.tailedNames[index]);

    if (!sameTailSet) {
      await this.startTail(nextNames, env.TAIL_LINES);
    }

    const scanNames = listed
      .filter(
        (file) =>
          isWpLogFile(file.name) &&
          Date.now() - file.mtimeMs <= ACTIVATION_WINDOW_MS,
      )
      .map((file) => file.name);
    const slowRoutineNames = listed
      .filter(
        (file) =>
          isLogFile(file.name) &&
          Date.now() - file.mtimeMs <= SLOW_DB_WINDOW_MS,
      )
      .map((file) => file.name);
    const processFiles = listed
      .filter(
        (file) =>
          isWpLogFile(file.name) &&
          Date.now() - file.mtimeMs <= PROCESS_WINDOW_MS,
      )
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, PROCESS_SCAN_FILES);

    setTimeout(() => {
      if (!this.running || !this.client) {
        return;
      }
      void this.scanLastTimestamps(listed);
      void this.scanActivations(scanNames);
      void this.scanSlowRoutines(slowRoutineNames);
      try {
        void this.scanProcesses(processFiles);
      } catch (error) {
        this.hooks.onProcessError(
          this.target.id,
          error instanceof Error ? error.message : String(error),
        );
      }
    }, 2_000);
  }

  private recordHealthCycle(listed: WatchedFile[]) {
    const { changedFiles, unchangedFiles } = classifyCycleFiles(
      listed,
      this.previousFiles,
    );
    const linesSelected = this.cycleLineCount;
    this.cycleLineCount = 0;
    this.previousFiles = indexListedFiles(listed);
    this.hooks.onHealthCycle({
      at: Date.now(),
      server: this.target.id,
      serverHost: this.target.host,
      linesSelected,
      changedFiles,
      unchangedFiles,
    });
  }

  private parseScanRow(row: string, fileOk: (file: string) => boolean) {
    const trimmed = row.replace(/\r$/, "");
    if (!trimmed) {
      return undefined;
    }
    const tab = trimmed.indexOf("\t");
    if (tab <= 0) {
      return undefined;
    }
    const file = trimmed
      .slice(0, tab)
      .replace(/^\.\//, "")
      .replace(/^.*[/\\]/, "");
    if (!file || !fileOk(file)) {
      return undefined;
    }
    return { file, raw: trimmed.slice(tab + 1) };
  }

  private async scanMatchingLines(options: {
    names: string[];
    scanning: boolean;
    scannedAt?: number;
    setScanning: (value: boolean) => void;
    markScanned: () => void;
    fileOk: (file: string) => boolean;
    awkBody: string;
    cutoff: string;
    onLine: (line: LogLine) => void;
    onError: (error?: string) => void;
    failLabel: string;
  }) {
    if (
      !this.client ||
      options.scanning ||
      options.names.length === 0
    ) {
      return;
    }
    if (
      options.scannedAt &&
      Date.now() - options.scannedAt < UPDATE_INTERVAL_MS
    ) {
      return;
    }

    options.setScanning(true);
    try {
      const env = getEnv();
      const files = options.names.map(posixQuote).join(" ");
      const command = `cd ${posixQuote(env.FILE_PATH)} && LC_ALL=C awk -v cutoff=${posixQuote(options.cutoff)} '${options.awkBody}' ${files}`;
      const result = await execCommand(this.client, command);
      if (result.code !== 0) {
        options.onError(
          result.stderr.trim() ||
            `${options.failLabel} on ${this.target.host} (exit ${result.code})`,
        );
        return;
      }

      const text = result.stdout;
      let offset = 0;
      let processed = 0;
      while (offset < text.length) {
        const nl = text.indexOf("\n", offset);
        const row = nl === -1 ? text.slice(offset) : text.slice(offset, nl);
        offset = nl === -1 ? text.length : nl + 1;
        const parsed = this.parseScanRow(row, options.fileOk);
        if (parsed) {
          const line = parseLogLine(
            parsed.raw,
            parsed.file,
            this.hooks.nextId(),
            true,
            { id: this.target.id, host: this.target.host },
          );
          if (line) {
            options.onLine(line);
          }
        }
        processed += 1;
        if (processed % 80 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      options.markScanned();
      options.onError(undefined);
    } catch (error) {
      options.onError(error instanceof Error ? error.message : String(error));
    } finally {
      options.setScanning(false);
    }
  }

  private async scanActivations(names: string[]) {
    const cutoff = automicStamp(Date.now() - ACTIVATION_WINDOW_MS - 3_600_000);
    await this.scanMatchingLines({
      names,
      scanning: this.scanningActivations,
      scannedAt: this.activationScannedAt,
      setScanning: (value) => {
        this.scanningActivations = value;
      },
      markScanned: () => {
        this.activationScannedAt = Date.now();
      },
      fileOk: isWpLogFile,
      cutoff,
      awkBody:
        'index($0, "U00007000") { if (match($0, /[0-9]{8}\\/[0-9]{6}/) && substr($0, RSTART, RLENGTH) >= cutoff) print FILENAME "\\t" $0 }',
      onLine: (line) => this.hooks.onActivation(line),
      onError: (error) => this.hooks.onActivationError(this.target.id, error),
      failLabel: "Activation scan failed",
    });
  }

  private async scanSlowRoutines(names: string[]) {
    const cutoff = automicStamp(Date.now() - SLOW_DB_WINDOW_MS - 3_600_000);
    await this.scanMatchingLines({
      names,
      scanning: this.scanningSlowRoutines,
      scannedAt: this.slowRoutineScannedAt,
      setScanning: (value) => {
        this.scanningSlowRoutines = value;
      },
      markScanned: () => {
        this.slowRoutineScannedAt = Date.now();
      },
      fileOk: isLogFile,
      cutoff,
      awkBody: `index($0, "${SLOW_ROUTINE_MESSAGE_ID}") { if (match($0, /[0-9]{8}\\/[0-9]{6}/) && substr($0, RSTART, RLENGTH) >= cutoff) print FILENAME "\\t" $0 }`,
      onLine: (line) => this.hooks.onSlowRoutine(line),
      onError: (error) => this.hooks.onSlowRoutineError(this.target.id, error),
      failLabel: "Slow routine scan failed",
    });
  }

  private processFilesKey(
    files: Array<Pick<WatchedFile, "name" | "size" | "mtimeMs">>,
  ) {
    return files
      .map((file) => `${file.name}:${file.size}:${file.mtimeMs}`)
      .join("|");
  }

  private async scanProcesses(
    files: Array<Pick<WatchedFile, "name" | "size" | "mtimeMs">>,
  ) {
    if (!this.client || this.scanningProcesses || files.length === 0) {
      return;
    }
    const scanKey = this.processFilesKey(files);
    if (scanKey === this.processScanKey) {
      return;
    }

    this.scanningProcesses = true;
    try {
      const env = getEnv();
      const cutoff = automicStamp(Date.now() - PROCESS_WINDOW_MS);
      const parts = files.map((entry) => {
        const file = posixQuote(entry.name);
        return `tail -n ${PROCESS_TAIL_LINES} -- ${file} | LC_ALL=C awk -v cutoff=${posixQuote(cutoff)} -v fname=${file} '${PROCESS_AWK}'`;
      });
      const command = `cd ${posixQuote(env.FILE_PATH)} && ${parts.join("; ")}`;
      const result = await execCommand(this.client, command);
      if (result.code !== 0) {
        this.hooks.onProcessError(
          this.target.id,
          result.stderr.trim() ||
            `Process table scan failed on ${this.target.host} (exit ${result.code})`,
        );
        return;
      }

      const text = result.stdout;
      let offset = 0;
      let processed = 0;
      while (offset < text.length) {
        const nl = text.indexOf("\n", offset);
        const row = nl === -1 ? text.slice(offset) : text.slice(offset, nl);
        offset = nl === -1 ? text.length : nl + 1;
        const parsed = this.parseScanRow(row, isWpLogFile);
        if (parsed) {
          const line = parseLogLine(
            parsed.raw,
            parsed.file,
            this.hooks.nextId(),
            true,
            { id: this.target.id, host: this.target.host },
          );
          if (line) {
            this.hooks.onProcess(line);
          }
        }
        processed += 1;
        if (processed % 80 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      this.processScanKey = scanKey;
      this.processScannedAt = Date.now();
      this.hooks.onProcessError(this.target.id, undefined);
    } catch (error) {
      this.hooks.onProcessError(
        this.target.id,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.scanningProcesses = false;
    }
  }

  private async scanLastTimestamps(files: WatchedFile[]) {
    if (!this.client || this.scanningLastTimestamps || files.length === 0) {
      return;
    }
    const scanKey = this.processFilesKey(files);
    if (scanKey === this.lastTimestampScanKey) {
      return;
    }

    this.scanningLastTimestamps = true;
    try {
      const env = getEnv();
      const parts = files.map((entry) => {
        const file = posixQuote(entry.name);
        return `printf '%s\\t' ${file}; tail -n ${LAST_TS_TAIL_LINES} -- ${file} | LC_ALL=C awk 'match($0, /[0-9]{8}\\/[0-9]{6}(\\.[0-9]{1,3})?/) { stamp=substr($0, RSTART, RLENGTH) } END { print stamp }'`;
      });
      const command = `cd ${posixQuote(env.FILE_PATH)} && ${parts.join("; ")}`;
      const result = await execCommand(this.client, command);
      if (result.code !== 0) {
        return;
      }
      const stamps = parseLastTimestampRows(result.stdout);
      this.lastTimestampScanKey = scanKey;
      this.hooks.onFiles(this.target.id, applyLastTimestamps(files, stamps));
    } catch {
      // file list already published; keep the dashboard live without last-ts
    } finally {
      this.scanningLastTimestamps = false;
    }
  }

  private async listFiles(): Promise<WatchedFile[]> {
    if (!this.client) {
      return [];
    }

    const env = getEnv();
    const command = `find ${posixQuote(env.FILE_PATH)} -maxdepth 1 -type f -name ${posixQuote(env.FILE_PATTERN)} -mmin -${DATA_WINDOW_MINUTES} -printf '%f\\t%s\\t%T@\\n'`;
    const result = await execCommand(this.client, command);

    if (result.code !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Unable to list log files on ${this.target.host} (exit ${result.code})`,
      );
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, size, mtime] = line.split("\t");
        const meta = parseFileMeta(name);
        const mtimeMs = Math.round(Number(mtime) * 1000) || Date.now();
        return {
          id: fileKey(this.target.id, name),
          name,
          server: this.target.id,
          serverHost: this.target.host,
          size: Number(size) || 0,
          mtimeMs,
          lines: 0,
          errors: 0,
          warnings: 0,
          kind: meta.kind,
          role: meta.role,
          instance: meta.instance,
        };
      })
      .filter(
        (file) => isLogFile(file.name) && isFileWithinDataWindow(file.mtimeMs),
      );
  }

  private async startTail(names: string[], tailLines: number) {
    if (!this.client) {
      return;
    }

    if (this.tailStream) {
      this.tailStream.removeAllListeners();
      this.tailStream.close();
      this.tailStream = undefined;
    }

    this.tailedNames = names;
    this.lineBuffer = "";
    this.currentFile = names.length === 1 ? names[0] : "";

    if (names.length === 0) {
      return;
    }

    const env = getEnv();
    const files = names.map(posixQuote).join(" ");
    const command = `cd ${posixQuote(env.FILE_PATH)} && tail -n ${tailLines} -F -- ${files}`;

    this.backfillUntil = Date.now() + BACKFILL_MS;
    this.drainHistorical = true;

    await new Promise<void>((resolve, reject) => {
      this.client!.exec(command, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        this.tailStream = stream;
        stream.on("data", (chunk: Buffer) => this.consume(chunk.toString("utf8")));
        stream.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8").trim();
          if (text && !text.startsWith("tail: ")) {
            this.scheduleReconnect(text);
          }
        });
        stream.on("close", () => {
          if (this.running && this.tailStream === stream && this.status === "live") {
            this.tailStream = undefined;
            void this.refreshFilesAndTail().catch((refreshError: unknown) => {
              this.scheduleReconnect(
                refreshError instanceof Error
                  ? refreshError.message
                  : String(refreshError),
              );
            });
          }
        });
        resolve();
      });
    });
  }

  private consume(chunk: string) {
    if (!chunk) {
      return;
    }
    this.incoming.push(chunk);
    this.scheduleConsume();
  }

  private scheduleConsume() {
    if (this.consumePump) {
      return;
    }
    this.consumePump = setTimeout(() => {
      this.consumePump = undefined;
      const start = Date.now();
      while (Date.now() - start < 8) {
        const nl = this.lineBuffer.indexOf("\n");
        if (nl === -1) {
          if (this.incoming.length === 0) {
            this.drainHistorical = false;
            break;
          }
          const next = this.incoming[0];
          const take = next.slice(0, 32 * 1024);
          this.incoming[0] = next.slice(take.length);
          if (this.incoming[0].length === 0) {
            this.incoming.shift();
          }
          if (this.drainHistorical) {
            for (let i = 0; i < take.length; i++) {
              if (take.charCodeAt(i) === 10) {
                this.remainingHistorical += 1;
              }
            }
          }
          this.lineBuffer += take;
          continue;
        }
        const part = this.lineBuffer.slice(0, nl);
        this.lineBuffer = this.lineBuffer.slice(nl + 1);
        this.consumePart(part);
      }
      if (this.incoming.length > 0 || this.lineBuffer.includes("\n")) {
        this.scheduleConsume();
      }
    }, 0);
  }

  private consumePart(part: string) {
    const header = isTailHeader(part);
    if (header) {
      this.currentFile = header;
      return;
    }
    const file = this.currentFile || this.tailedNames[0] || "unknown";
    if (!isLogFile(file)) {
      return;
    }
    const historical = this.remainingHistorical > 0;
    if (this.remainingHistorical > 0) {
      this.remainingHistorical -= 1;
    }
    const parsed = parseLogLine(part, file, this.hooks.nextId(), historical, {
      id: this.target.id,
      host: this.target.host,
    });
    if (parsed) {
      this.cycleLineCount += 1;
      this.hooks.onLine(parsed);
    }
  }
}
