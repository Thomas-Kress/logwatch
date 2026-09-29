"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { SlowDbTypeStat } from "@/components/dashboard/SlowDbChart";
import { colorForOpc } from "@/components/dashboard/chartTheme";
import { ChartCard } from "@/components/dashboard/ChartStamp";
import { SlowRoutineView } from "@/components/dashboard/SlowRoutineView";
import { FilterSearch } from "@/components/ui/FilterSearch";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { PanelCard } from "@/components/ui/PanelCard";
import { StatCard } from "@/components/ui/StatCard";
import {
  formatDuration,
  isLogFile,
  opcLabel,
  parseSlowDbCall,
  SLOW_DB_MESSAGE_ID,
} from "@/lib/ae-meta";
import { latestArrivalMs } from "@/lib/chart-stamp";
import { eventTime, isWithinWindow, SLOW_DB_WINDOW_MS } from "@/lib/data-window";
import type { FileRole, LogLine } from "@/lib/types";
import { fileKey, fileLabel } from "@/lib/utils";

const SlowDbChart = dynamic(() => import("@/components/dashboard/SlowDbChart"), {
  ssr: false,
});
const SlowDbTimelineChart = dynamic(
  () => import("@/components/dashboard/SlowDbTimelineChart"),
  { ssr: false },
);

type SlowDbViewProps = {
  events: LogLine[];
  routineEvents?: LogLine[];
  routineError?: string;
  now: number;
  multiServer?: boolean;
};

type SlowDbEvent = {
  id: number;
  t: number;
  ts: string;
  opc: string;
  operation: string;
  durationMs: number;
  role: string;
  file: string;
  server: string;
  serverHost?: string;
  receivedAt?: number;
};

const SLOW_DB_WINDOW_HOURS = SLOW_DB_WINDOW_MS / (60 * 60 * 1000);

function toEvent(line: LogLine): SlowDbEvent {
  const parsed = parseSlowDbCall(line.raw) ?? parseSlowDbCall(line.message);
  const opc = (line.opc ?? parsed?.opc ?? "UNKNOWN").toUpperCase();
  return {
    id: line.id,
    t: eventTime(line),
    ts: line.ts,
    opc,
    operation: line.operation ?? parsed?.operation ?? opcLabel(opc),
    durationMs: line.durationMs ?? parsed?.durationMs ?? 0,
    role: line.role,
    file: line.file,
    server: line.server,
    serverHost: line.serverHost,
    receivedAt: line.receivedAt,
  };
}

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

export function SlowDbView({
  events,
  routineEvents = [],
  routineError,
  now,
  multiServer = false,
}: SlowDbViewProps) {
  const [file, setFile] = useState("");
  const [role, setRole] = useState("");
  const [opc, setOpc] = useState("");
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const parsed = useMemo(
    () =>
      events
        .filter(
          (line) =>
            isLogFile(line.file) &&
            isWithinWindow(line, SLOW_DB_WINDOW_MS, now),
        )
        .map(toEvent)
        .sort((a, b) => a.t - b.t),
    [events, now],
  );

  const byFile = useMemo(() => {
    const counts = new Map<
      string,
      { file: string; server: string; serverHost?: string; count: number }
    >();
    for (const event of parsed) {
      const key = fileKey(event.server, event.file);
      const current = counts.get(key) ?? {
        file: event.file,
        server: event.server,
        serverHost: event.serverHost,
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
  }, [parsed]);

  const byRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of parsed) {
      counts.set(event.role, (counts.get(event.role) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ role: value as FileRole, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.role.localeCompare(b.role),
      );
  }, [parsed]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parsed.filter((event) => {
      const key = fileKey(event.server, event.file);
      if (file && key !== file && event.file !== file) {
        return false;
      }
      if (role && event.role !== role) {
        return false;
      }
      if (opc && event.opc !== opc) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = [
        event.operation,
        event.opc,
        event.role,
        event.file,
        event.serverHost,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [file, opc, parsed, query, role]);

  const types = useMemo((): SlowDbTypeStat[] => {
    const grouped = new Map<string, SlowDbTypeStat>();
    for (const event of visible) {
      const current = grouped.get(event.opc) ?? {
        opc: event.opc,
        operation: event.operation,
        count: 0,
        maxDurationMs: 0,
        avgDurationMs: 0,
      };
      current.count += 1;
      current.maxDurationMs = Math.max(current.maxDurationMs, event.durationMs);
      current.avgDurationMs += event.durationMs;
      grouped.set(event.opc, current);
    }
    return [...grouped.values()]
      .map((type) => ({
        ...type,
        avgDurationMs: type.count ? type.avgDurationMs / type.count : 0,
      }))
      .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));
  }, [visible]);

  const allTypes = useMemo((): SlowDbTypeStat[] => {
    const grouped = new Map<string, SlowDbTypeStat>();
    for (const event of parsed) {
      const current = grouped.get(event.opc) ?? {
        opc: event.opc,
        operation: event.operation,
        count: 0,
        maxDurationMs: 0,
        avgDurationMs: 0,
      };
      current.count += 1;
      grouped.set(event.opc, current);
    }
    return [...grouped.values()].sort(
      (a, b) => b.count - a.count || a.operation.localeCompare(b.operation),
    );
  }, [parsed]);

  const slowest = visible.reduce<SlowDbEvent | undefined>((current, event) => {
    if (!current || event.durationMs > current.durationMs) {
      return event;
    }
    return current;
  }, undefined);
  const recent = [...visible].reverse().slice(0, 400);
  const arrivedAt = latestArrivalMs(
    ...visible.map((event) => event.receivedAt ?? event.t),
  );
  const perHour = visible.length / SLOW_DB_WINDOW_HOURS;

  return (
    <Stack spacing={2.5}>
      <FilterToolbar label="Slow DB">
        <FilterSelect
          value={role}
          onChange={setRole}
          options={[
            { value: "", label: "All processes" },
            ...byRole.map((item) => ({
              value: item.role,
              label: `${item.role} (${item.count})`,
            })),
          ]}
        />
        <FilterSelect
          value={file}
          onChange={setFile}
          sx={{ maxWidth: 288 }}
          options={[
            { value: "", label: "All log files" },
            ...byFile.map((item) => {
              const key = fileKey(item.server, item.file);
              return {
                value: key,
                label: `${fileLabel(item.file, item.serverHost, multiServer)} (${item.count})`,
              };
            }),
          ]}
        />
        <FilterSelect
          value={opc}
          onChange={setOpc}
          options={[
            { value: "", label: "All OPC types" },
            ...allTypes.map((type) => ({
              value: type.opc,
              label: `${type.operation} (${type.opc})`,
            })),
          ]}
        />
        <FilterSearch
          value={query}
          onChange={setQuery}
          placeholder="Search operation, OPC, or file…"
        />
      </FilterToolbar>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard label={`Calls · ${SLOW_DB_WINDOW_HOURS}h`} value={visible.length} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Per hour"
            value={perHour < 10 ? perHour.toFixed(1) : Math.round(perHour)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard
            label="Slowest"
            value={
              slowest && slowest.durationMs
                ? formatDuration(slowest.durationMs)
                : "—"
            }
            valueColor="warning.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <StatCard label="OPC types" value={types.length} />
        </Grid>
      </Grid>

      <Typography variant="caption" color="text.secondary">
        {SLOW_DB_MESSAGE_ID} · time-critical DB calls over 1 second · last{" "}
        {SLOW_DB_WINDOW_HOURS} hours
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 7.5 }}>
          <ChartCard
            title="By operation type"
            description="Counts of slow calls grouped by OPC"
            arrivedAt={arrivedAt}
          >
            <SlowDbChart types={types} />
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, xl: 4.5 }}>
          <PanelCard title="By operation" maxHeight={352}>
            {types.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
                None yet. More than about one per hour is already considered
                excessive.
              </Typography>
            ) : (
              <List disablePadding>
                {types.map((type, index) => (
                  <ListItemButton
                    key={type.opc}
                    divider
                    selected={opc === type.opc}
                    onClick={() => setOpc(type.opc === opc ? "" : type.opc)}
                  >
                    <ListItemAvatar sx={{ minWidth: 24, mt: 0.75 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: 0.5,
                          bgcolor: colorForOpc(type.opc, index),
                        }}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={type.operation}
                      secondary={`${type.opc}${
                        type.maxDurationMs
                          ? ` · slowest ${formatDuration(type.maxDurationMs)}`
                          : ""
                      }`}
                      slotProps={{
                        primary: { noWrap: true },
                        secondary: { noWrap: true },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={mono}>
                      {type.count}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </PanelCard>
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ "&:last-child": { pb: 2 } }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Over time
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Calls and time consumed · last {SLOW_DB_WINDOW_HOURS} hours
          </Typography>
          <SlowDbTimelineChart
            types={types}
            events={visible}
            arrivedAt={arrivedAt}
          />
        </CardContent>
      </Card>

      <Accordion
        expanded={listOpen}
        onChange={(_, expanded) => setListOpen(expanded)}
        variant="outlined"
        sx={{ overflow: "hidden", borderRadius: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box
            sx={{
              display: "flex",
              width: "100%",
              pr: 1,
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Recent calls
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {listOpen ? `${recent.length} shown` : `${recent.length} hidden`}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 0 }}>
          {recent.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
              No slow database calls in the last {SLOW_DB_WINDOW_HOURS} hours.
            </Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 384 }}>
              <Table size="small">
                <TableBody>
                  {recent.map((event) => {
                    const key = fileKey(event.server, event.file);
                    return (
                      <TableRow
                        key={`${event.id}-${key}-${event.ts}`}
                        hover
                        selected={file === key}
                        onClick={() => setFile(key === file ? "" : key)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell sx={{ ...mono, color: "text.secondary", whiteSpace: "nowrap" }}>
                          {formatDateTime(event.ts)}
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
                            {fileLabel(event.file, event.serverHost, multiServer)}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            ...mono,
                            color: "text.disabled",
                            display: { xs: "none", lg: "table-cell" },
                          }}
                        >
                          {event.role}
                        </TableCell>
                        <TableCell sx={mono}>
                          {event.operation}{" "}
                          <Typography component="span" color="text.secondary" variant="inherit">
                            {event.opc}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            ...mono,
                            color: "warning.main",
                            textAlign: "right",
                            display: { xs: "none", lg: "table-cell" },
                          }}
                        >
                          {event.durationMs
                            ? formatDuration(event.durationMs)
                            : formatClock(event.ts)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </AccordionDetails>
      </Accordion>

      <SlowRoutineView
        events={routineEvents}
        error={routineError}
        now={now}
        multiServer={multiServer}
      />
    </Stack>
  );
}
