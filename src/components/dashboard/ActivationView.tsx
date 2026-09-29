"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import { FilterSearch } from "@/components/ui/FilterSearch";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { PanelCard } from "@/components/ui/PanelCard";
import { StatCard } from "@/components/ui/StatCard";
import {
  activationFingerprint,
  emptyActivationSnapshot,
  isActivationLine,
  mergeActivationHourly,
} from "@/lib/activations";
import { latestArrivalMs, latestLineArrival } from "@/lib/chart-stamp";
import {
  ACTIVATION_WINDOW_HOURS,
  eventTime,
  isWithinWindow,
  ACTIVATION_WINDOW_MS,
} from "@/lib/data-window";
import type { ActivationSnapshot, LogLine } from "@/lib/types";
import { fileKey, fileLabel } from "@/lib/utils";

const ActivationTimelineChart = dynamic(
  () => import("@/components/dashboard/ActivationTimelineChart"),
  { ssr: false },
);
const ActivationFilesChart = dynamic(
  () => import("@/components/dashboard/ActivationFilesChart"),
  { ssr: false },
);

type ActivationViewProps = {
  activations?: ActivationSnapshot;
  generatedAt?: number;
  liveLines: LogLine[];
  now: number;
  multiServer?: boolean;
};

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(undefined, { hour12: false });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
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

const mono = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
};

export function ActivationView({
  activations,
  generatedAt,
  liveLines,
  now,
  multiServer = false,
}: ActivationViewProps) {
  const [file, setFile] = useState("");
  const [query, setQuery] = useState("");

  const fallback = useMemo(() => emptyActivationSnapshot(now), [now]);
  const base = activations ?? fallback;
  const freshLive = useMemo(() => {
    const seen = new Set(base.recent.map(activationFingerprint));
    return liveLines.filter((line) => {
      if (!isActivationLine(line) || line.historical) {
        return false;
      }
      if (!isWithinWindow(line, ACTIVATION_WINDOW_MS, now)) {
        return false;
      }
      if ((line.receivedAt ?? 0) < (generatedAt ?? 0)) {
        return false;
      }
      const fingerprint = activationFingerprint(line);
      if (seen.has(fingerprint)) {
        return false;
      }
      seen.add(fingerprint);
      return true;
    });
  }, [base.recent, generatedAt, liveLines, now]);

  const hourly = useMemo(
    () => mergeActivationHourly(base.hourly, freshLive, now),
    [base.hourly, freshLive, now],
  );

  const byFile = useMemo(() => {
    const counts = new Map(
      base.byFile.map((item) => [
        fileKey(item.server ?? "", item.file),
        { ...item },
      ]),
    );
    for (const line of freshLive) {
      const key = fileKey(line.server, line.file);
      const current = counts.get(key) ?? {
        file: line.file,
        server: line.server,
        serverHost: line.serverHost,
        role: line.role,
        count: 0,
      };
      current.count += 1;
      counts.set(key, current);
    }
    return [...counts.values()].sort(
      (a, b) =>
        b.count - a.count ||
        (a.serverHost ?? "").localeCompare(b.serverHost ?? "") ||
        a.file.localeCompare(b.file),
    );
  }, [base.byFile, freshLive]);

  const byObject = useMemo(() => {
    const counts = new Map(
      base.byObject.map((item) => [item.objectName, { ...item }]),
    );
    for (const line of freshLive) {
      if (!line.objectName) {
        continue;
      }
      const current = counts.get(line.objectName) ?? {
        objectName: line.objectName,
        count: 0,
      };
      current.count += 1;
      counts.set(line.objectName, current);
    }
    const q = query.trim().toLowerCase();
    return [...counts.values()]
      .filter((item) => !q || item.objectName.toLowerCase().includes(q))
      .sort(
        (a, b) => b.count - a.count || a.objectName.localeCompare(b.objectName),
      )
      .slice(0, 20);
  }, [base.byObject, freshLive, query]);

  const recent = useMemo(() => {
    const merged = [...base.recent, ...freshLive];
    const seen = new Set<string>();
    const q = query.trim().toLowerCase();
    return merged
      .filter((line) => {
        const fingerprint = activationFingerprint(line);
        if (seen.has(fingerprint)) {
          return false;
        }
        seen.add(fingerprint);
        if (file && fileKey(line.server, line.file) !== file && line.file !== file) {
          return false;
        }
        if (q) {
          const haystack = [
            line.objectName,
            line.runId,
            line.file,
            line.message,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const delta = eventTime(b) - eventTime(a);
        return delta !== 0 ? delta : b.id - a.id;
      })
      .slice(0, 400);
  }, [base.recent, file, freshLive, query]);

  const total = base.total + freshLive.length;
  const files = byFile.length;
  const objects = base.objects;
  const perHour = total / ACTIVATION_WINDOW_HOURS;
  const arrivedAt = latestArrivalMs(
    latestLineArrival([...base.recent, ...freshLive]),
    base.scannedAt,
  );

  return (
    <Stack spacing={2.5}>
      <FilterToolbar label="WP logs">
        <FilterSelect
          value={file}
          onChange={setFile}
          sx={{ maxWidth: 288 }}
          options={[
            { value: "", label: "All WP log files" },
            ...byFile.map((item) => {
              const key = fileKey(item.server ?? "", item.file);
              return {
                value: key || item.file,
                label: `${fileLabel(item.file, item.serverHost, multiServer)} (${item.count})`,
              };
            }),
          ]}
        />
        <FilterSearch
          value={query}
          onChange={setQuery}
          placeholder="Search object or RunID…"
        />
      </FilterToolbar>

      {base.error && (
        <Alert severity="warning">Could not scan WP log files: {base.error}</Alert>
      )}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard label="Activities · 7h" value={total} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Per hour"
            value={perHour < 10 ? perHour.toFixed(1) : Math.round(perHour)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard label="WP log files" value={files} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard label="Distinct objects" value={objects} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <ChartCard
            title="Appearances over time"
            description={`WP log files · last ${ACTIVATION_WINDOW_HOURS} hours · 15-minute buckets${
              base.scannedAt ? "" : " · scanning log files…"
            }`}
            arrivedAt={arrivedAt}
          >
            <ActivationTimelineChart hourly={hourly} />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <ChartCard
            title="By log file"
            description="Click a file in the list to focus the recent activations"
            arrivedAt={arrivedAt}
          >
            <ActivationFilesChart
              files={byFile}
              selected={file}
              multiServer={multiServer}
            />
          </ChartCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 5 }}>
          <PanelCard title="Top objects" maxHeight={448}>
            {byObject.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
                No object activations match the current filters.
              </Typography>
            ) : (
              <List disablePadding>
                {byObject.map((item) => (
                  <ListItemButton
                    key={item.objectName}
                    divider
                    onClick={() => setQuery(item.objectName)}
                  >
                    <ListItemText
                      primary={item.objectName}
                      slotProps={{
                        primary: {
                          noWrap: true,
                          sx: mono,
                        },
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
        <Grid size={{ xs: 12, xl: 7 }}>
          <PanelCard
            title="Recent activities"
            maxHeight={448}
            minHeight={320}
            action={
              <Typography variant="caption" color="text.secondary">
                {recent.length} shown
              </Typography>
            }
          >
            {recent.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
                No activities in WP logs over the last {ACTIVATION_WINDOW_HOURS}{" "}
                hours.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    {recent.map((line) => {
                      const key = fileKey(line.server, line.file);
                      return (
                        <TableRow
                          key={`${line.id}-${key}-${line.ts}`}
                          hover
                          selected={file === key}
                          onClick={() => setFile(key === file ? "" : key)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell sx={{ ...mono, color: "text.secondary", whiteSpace: "nowrap" }}>
                            {formatDateTime(line.ts)}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...mono,
                              color: "text.secondary",
                              display: { xs: "none", lg: "table-cell" },
                              maxWidth: 190,
                            }}
                          >
                            <Typography noWrap variant="inherit">
                              {fileLabel(line.file, line.serverHost, multiServer)}
                            </Typography>
                          </TableCell>
                          <TableCell
                            sx={{
                              ...mono,
                              color: "text.disabled",
                              display: { xs: "none", lg: "table-cell" },
                            }}
                          >
                            {line.role}
                          </TableCell>
                          <TableCell sx={{ ...mono, color: "info.main" }}>
                            {line.objectName ?? line.message}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...mono,
                              color: "text.secondary",
                              display: { xs: "none", lg: "table-cell" },
                            }}
                          >
                            {line.runId ?? formatClock(line.ts)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </PanelCard>
        </Grid>
      </Grid>
    </Stack>
  );
}
