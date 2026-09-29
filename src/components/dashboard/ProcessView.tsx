"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { colorForProcessType } from "@/components/dashboard/chartTheme";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import { FilterSearch } from "@/components/ui/FilterSearch";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { PanelCard } from "@/components/ui/PanelCard";
import { StatCard } from "@/components/ui/StatCard";
import { latestArrivalMs } from "@/lib/chart-stamp";
import { DATA_WINDOW_DAYS } from "@/lib/data-window";
import { timestampMs } from "@/lib/last-timestamps";
import {
  collectLiveProcesses,
  emptyProcessSnapshot,
  formatUptime,
  keepLatestProcesses,
  mergeProcessEvents,
  processUptimeMs,
  summarizeProcesses,
} from "@/lib/processes";
import type { AeProcessSnapshot, LogLine } from "@/lib/types";

const ProcessTypeChart = dynamic(
  () => import("@/components/dashboard/ProcessTypeChart"),
  { ssr: false },
);

type ProcessViewProps = {
  processes?: AeProcessSnapshot;
  generatedAt?: number;
  liveLines: LogLine[];
  now: number;
};

function formatDumpTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").slice(0, 19);
  }
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function countByPrefix(byType: { type: string; count: number }[], types: string[]) {
  const wanted = new Set(types);
  return byType.reduce(
    (sum, item) => sum + (wanted.has(item.type) ? item.count : 0),
    0,
  );
}

const mono = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
};

export function ProcessView({
  processes,
  generatedAt,
  liveLines,
  now,
}: ProcessViewProps) {
  const [type, setType] = useState("");
  const [host, setHost] = useState("");
  const [query, setQuery] = useState("");

  const fallback = useMemo(() => emptyProcessSnapshot(now), [now]);
  const base = processes ?? fallback;
  const baseProcesses = Array.isArray(base.processes) ? base.processes : [];
  const freshLive = useMemo(
    () => collectLiveProcesses(liveLines, generatedAt),
    [generatedAt, liveLines],
  );

  const summary = useMemo(
    () =>
      summarizeProcesses(
        mergeProcessEvents(baseProcesses, freshLive),
        now,
      ),
    [baseProcesses, freshLive, now],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keepLatestProcesses(summary.processes).filter((row) => {
      if (type && row.type !== type) {
        return false;
      }
      if (host && row.host !== host) {
        return false;
      }
      if (!q) {
        return true;
      }
      const uptimeMs = processUptimeMs(row);
      const haystack = [
        row.name,
        row.type,
        row.host,
        String(row.port),
        row.startTime,
        row.lastUpdateTime,
        uptimeMs === undefined ? "" : formatUptime(uptimeMs),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [host, query, summary.processes, type]);

  const work = countByPrefix(summary.byType, ["PWP", "WP", "DWP", "JWP"]);
  const communication = countByPrefix(summary.byType, ["CP", "JCP", "REST"]);
  const longestUptimeMs = useMemo(() => {
    let longest: number | undefined;
    for (const row of summary.processes) {
      const uptimeMs = processUptimeMs(row);
      if (uptimeMs === undefined) {
        continue;
      }
      if (longest === undefined || uptimeMs > longest) {
        longest = uptimeMs;
      }
    }
    return longest;
  }, [summary.processes]);
  const arrivedAt = latestArrivalMs(
    timestampMs(summary.dumpTs),
    base.scannedAt,
    ...freshLive.map((process) => process.receivedAt),
    ...summary.processes.map((process) => process.receivedAt),
  );

  return (
    <Stack spacing={2.5}>
      <FilterToolbar label="Processes">
        <FilterSelect
          value={type}
          onChange={setType}
          options={[
            { value: "", label: "All types" },
            ...summary.byType.map((item) => ({
              value: item.type,
              label: `${item.type} (${item.count})`,
            })),
          ]}
        />
        <FilterSelect
          value={host}
          onChange={setHost}
          options={[
            { value: "", label: "All hosts" },
            ...summary.byHost.map((item) => ({
              value: item.host,
              label: `${item.host} (${item.count})`,
            })),
          ]}
        />
        <FilterSearch
          value={query}
          onChange={setQuery}
          placeholder="Search server, host, or port…"
        />
      </FilterToolbar>

      {base.error && (
        <Alert severity="warning">Could not scan process tables: {base.error}</Alert>
      )}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, xl: "grow" }}>
          <StatCard label="Processes" value={summary.total} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: "grow" }}>
          <StatCard label="Work (WP / JWP / PWP)" value={work} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: "grow" }}>
          <StatCard label="Communication" value={communication} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: "grow" }}>
          <StatCard label="Hosts" value={summary.hosts} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: "grow" }}>
          <StatCard
            label="Longest uptime"
            value={longestUptimeMs === undefined ? "—" : formatUptime(longestUptimeMs)}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <ChartCard
            title="By type"
            description={`Latest server table in log files${
              summary.dumpTs ? ` · logged ${formatDumpTime(summary.dumpTs)}` : ""
            }${base.scannedAt ? "" : " · scanning log files…"}`}
            arrivedAt={arrivedAt}
          >
            <ProcessTypeChart byType={summary.byType} />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <PanelCard title="By host" maxHeight={352}>
            {summary.byHost.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
                No process hosts in the latest table.
              </Typography>
            ) : (
              <List disablePadding>
                {summary.byHost.map((item) => (
                  <ListItemButton
                    key={item.host}
                    divider
                    selected={host === item.host}
                    onClick={() => setHost(item.host === host ? "" : item.host)}
                  >
                    <ListItemText
                      primary={item.host}
                      slotProps={{
                        primary: { noWrap: true, sx: mono },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={mono}>
                      {item.count}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </PanelCard>
        </Grid>
      </Grid>

      <PanelCard
        title="Server processes"
        minHeight={384}
        action={
          <Typography variant="caption" color="text.secondary">
            {rows.length} shown
            {summary.dumpTs ? ` · ${formatDumpTime(summary.dumpTs)}` : ""}
          </Typography>
        }
      >
        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
            No server process table found in log files from the last{" "}
            {DATA_WINDOW_DAYS} days.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" stickyHeader sx={{ minWidth: 928 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Server</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell>C</TableCell>
                  <TableCell>Host</TableCell>
                  <TableCell>Port</TableCell>
                  <TableCell>StartTime</TableCell>
                  <TableCell>LastUpdateTime</TableCell>
                  <TableCell>Uptime</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const uptimeMs = processUptimeMs(row);
                  return (
                    <TableRow key={row.name} hover>
                      <TableCell sx={mono}>{row.name}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.type}
                          sx={{
                            color: colorForProcessType(row.type),
                            bgcolor: `${colorForProcessType(row.type)}22`,
                            minWidth: 48,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ ...mono, color: "text.secondary" }}>
                        {row.connections}
                      </TableCell>
                      <TableCell sx={mono}>{row.host}</TableCell>
                      <TableCell sx={{ ...mono, color: "text.secondary" }}>
                        {row.port}
                      </TableCell>
                      <TableCell sx={{ ...mono, color: "text.secondary", whiteSpace: "nowrap" }}>
                        {row.startTime}
                      </TableCell>
                      <TableCell sx={{ ...mono, color: "text.secondary", whiteSpace: "nowrap" }}>
                        {row.lastUpdateTime}
                      </TableCell>
                      <TableCell sx={{ ...mono, whiteSpace: "nowrap" }}>
                        {uptimeMs === undefined ? "—" : formatUptime(uptimeMs)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </PanelCard>
    </Stack>
  );
}
