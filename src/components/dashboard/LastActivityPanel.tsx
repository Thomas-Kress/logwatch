"use client";

import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { PanelCard } from "@/components/ui/PanelCard";
import {
  LAST_ACTIVITY_LIVE_MS,
  activityStatus,
  formatActivityTime,
  formatAge,
  mergeFileActivity,
  processLabel,
} from "@/lib/last-activity";
import type { LogLine, WatchedFile } from "@/lib/types";
import { isCurrentRotation } from "@/lib/log-files";
import { fileLabel } from "@/lib/utils";

type LastActivityPanelProps = {
  files: WatchedFile[];
  liveLines: LogLine[];
  now: number;
  generatedAt?: number;
  multiServer?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
};

const statusColor = {
  live: "success",
  quiet: "warning",
  stale: "error",
  unknown: "default",
} as const;

const statusLabel: Record<string, string> = {
  live: "Live",
  quiet: "Quiet",
  stale: "Stale",
  unknown: "Unknown",
};

const mono = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
};

export function LastActivityPanel({
  files,
  liveLines,
  now,
  generatedAt,
  multiServer = false,
  selected = "",
  onSelect,
}: LastActivityPanelProps) {
  const [tick, setTick] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  const clock = tick > now ? tick : now;
  const rows = useMemo(
    () =>
      mergeFileActivity({
        files: files.filter((file) => isCurrentRotation(file.name)),
        liveLines,
      }),
    [files, liveLines],
  );
  const liveCount = rows.filter((row) => {
    const ageMs =
      row.lastTsMs === undefined ? undefined : clock - row.lastTsMs;
    return activityStatus(ageMs) === "live";
  }).length;

  return (
    <PanelCard
      maxHeight={448}
      title="Latest timestamps"
      action={
        <Typography variant="caption" color="text.secondary">
          {liveCount}/{rows.length} live
        </Typography>
      }
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, pt: 1.5 }}>
        Last Automic stamp in each log file
        {generatedAt
          ? ` · checked ${new Date(generatedAt).toLocaleTimeString(undefined, { hour12: false })}`
          : ""}
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
          Waiting for the next log-file scan…
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small" stickyHeader sx={{ minWidth: 576 }}>
            <TableHead>
              <TableRow>
                <TableCell>Process</TableCell>
                <TableCell>Log file</TableCell>
                <TableCell>Last log</TableCell>
                <TableCell>Age</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const rawAge =
                  row.lastTsMs === undefined ? undefined : clock - row.lastTsMs;
                const status = activityStatus(rawAge);
                const ageMs =
                  rawAge === undefined || rawAge < -LAST_ACTIVITY_LIVE_MS
                    ? undefined
                    : Math.max(0, rawAge);
                return (
                  <TableRow
                    key={row.id}
                    hover={Boolean(onSelect)}
                    selected={selected === row.id}
                    onClick={() => onSelect?.(selected === row.id ? "" : row.id)}
                    sx={{ cursor: onSelect ? "pointer" : "default" }}
                  >
                    <TableCell sx={mono}>{processLabel(row)}</TableCell>
                    <TableCell sx={{ ...mono, color: "text.secondary" }}>
                      {fileLabel(row.name, row.serverHost, multiServer)}
                    </TableCell>
                    <TableCell sx={{ ...mono, whiteSpace: "nowrap" }}>
                      {formatActivityTime(row.lastTs)}
                    </TableCell>
                    <TableCell sx={{ ...mono, whiteSpace: "nowrap" }}>
                      {ageMs === undefined ? "—" : formatAge(ageMs)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={statusColor[status]}
                        variant="outlined"
                        label={statusLabel[status]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </PanelCard>
  );
}
