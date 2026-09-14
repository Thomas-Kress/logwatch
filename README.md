# Logwatch

Logwatch is a live browser dashboard for **Automic Automation Engine** server logs. It SSHs to the AE host (or both hosts in an active-active pair), tails matching `*_log_*` files, parses Automic line format, and streams the result to a single-page dashboard.

Use it to watch CP/WP traffic, errors and warnings, and slow database calls without logging into the server or opening raw log files.

## What it shows

The dashboard covers the **last 7 days** of log data and refreshes at least once a minute.

- **Status and KPIs** — connection state, files in view, lines/min, warnings, errors, and active alerts
- **Log volume** — severity over the last 30 minutes
- **Severity mix** — info / warn / error / debug in the current filter
- **CP vs WP** — traffic split by process role
- **Top files** — files with the most warnings and errors
- **Slow database calls** (`U00003524`) — counts and time consumed by OPC type over the last 12 hours
- **Log files** — watched files modified in the last 7 days
- **Alerts** — error/warning rate thresholds and grouped problem events
- **Live tail** — warnings and errors, newest first

Filters apply across the page: process (CP, WP, JWP, JCP), severity, message id (`U00…`), RunID, file, and free text.

Only **server log files** are analyzed (`CPsrv_log_*`, `WPsrv_log_*`, and the same pattern for JWP/JCP/REST). Trace files (`*_trc_*`) are ignored.

## Setup

1. Copy `.env.example` to `.env` and set SSH plus file matching values.
2. Install dependencies if needed: `npm install`
3. Start the app: `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000)

The dashboard connects to `/api/logs/stream` (SSE). SSH credentials stay on the server.

## Configuration

Required in `.env`:

| Key | Purpose |
| --- | --- |
| `SSH_HOST` | Log host (first AE server) |
| `SSH_USERNAME` | SSH user |
| `SSH_PASSWORD` or `SSH_KEY_FILE` | Authentication |
| `FILE_PATH` | Directory that holds the AE logs (often `…/AutomationEngine/temp`) |
| `FILE_PATTERN` | File glob, typically `*_00.txt` |

Optional second AE server (leave `SSH2_HOST` empty for the default one-server setup):

| Key | Purpose |
| --- | --- |
| `SSH2_HOST` | Second AE host. When set, Logwatch tails both servers and merges the view |
| `SSH2_USERNAME` | SSH user on the second host |
| `SSH2_PASSWORD` or `SSH2_KEY_FILE` | Authentication for the second host |

Optional:

| Key | Default | Purpose |
| --- | --- | --- |
| `SSH_PORT` | `22` | SSH port |
| `SSH2_PORT` | `SSH_PORT` | SSH port on the second host |
| `TAIL_LINES` | `200` | Lines to read when a file is first tailed |
| `FILE_REFRESH_MS` | `15000` | How often to rescan the log directory (capped at 60s) |
| `ALERT_ERROR_PER_MIN` | `5` | Error-rate alert threshold |
| `ALERT_WARN_PER_MIN` | `30` | Warning-rate alert threshold |
| `ALERT_INCLUDE_TRACES` | `false` | Unused for analysis; traces stay out of scope |

## How it works

Logwatch is a read-only observer. It never writes to the AE host. Credentials stay on the Next.js server; the browser only receives parsed dashboard data.

### What you can use it for

- **Live operations watch** — keep a window open during the business day and see whether CP/WP processes are quiet, busy, or throwing errors, without `ssh` + `tail` on the server.
- **Incident triage** — when jobs fail, filter the live tail by message id (`U00…`), RunID, object name, or process role to see the related warnings and abends in one place.
- **Slow database investigation** — Automic “time critical DB call” messages (`U00003524`) are broken out by OPC type (select, insert, update, commit, and so on). Use the last-12-hours curves to spot bursts and which statement types are consuming time.
- **Rate spikes** — configurable alerts fire when errors or warnings per minute pass a threshold, so a sudden storm is visible even if you are not staring at the tail.
- **File-level heat** — see which CP/WP log files are producing the most problems, then click through to that file.
- **Recent history** — analysis is limited to the last 7 days, so the view stays on current operations rather than old rotated logs.

It is not a log archive, SIEM, or replacement for Automic’s own reporting. It does not execute jobs, change AE configuration, or read trace dumps.

### Data path

1. On startup the server reads `.env` and opens an SSH session to `SSH_HOST`. If `SSH2_HOST` is set, it opens a second session to that host as well (typical Automic active-active pair). Each session reconnects independently.
2. It lists files in `FILE_PATH` that match `FILE_PATTERN`, are `*_log_*` (not `*_trc_*`), and were modified in the last 7 days — on every connected host.
3. It follows those files with `tail -F`, starting from the last `TAIL_LINES` lines of each file.
4. Each line is parsed as Automic format (`YYYYMMDD/HHMMSS - U00… message`) when possible. The parser extracts timestamp, process (CP/WP/JWP/JCP), severity, message id, RunID, object name, and slow-DB OPC plus duration.
5. Severity for Automic `U00…` messages comes from `src/data/severty.md` (Info, Warning, Error), loaded via `src/data/message-severity.json`. Lines without a catalog match still use message-text heuristics (abend, failed, timed out, and similar wording).
6. Parsed events are pushed to the browser over Server-Sent Events (`/api/logs/stream`). A full snapshot is sent at least every 30 seconds; the file list is rescanned at `FILE_REFRESH_MS` (capped at one minute).
7. The dashboard treats the latest snapshot as the source of truth (charts, files, alerts, slow DB, live tail) and applies newly streamed lines on top until the next snapshot.

Lines older than 7 days are dropped. Slow DB charts use a tighter **12-hour** window. The live tail shows warnings and errors only, newest first. Info/debug traffic still feeds volume and CP/WP charts.

SSH reconnects automatically if a session drops. In a two-server setup the remaining host keeps streaming. The header **updated** time is the last snapshot the UI applied, so you can see that the view is still moving.
