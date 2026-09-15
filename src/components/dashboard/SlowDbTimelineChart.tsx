"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { SlowDbTypeStat } from "@/components/dashboard/SlowDbChart";
import { ChartStamp } from "@/components/dashboard/ChartStamp";
import {
  chartText,
  chartTooltip,
  colorForOpc,
} from "@/components/dashboard/chartTheme";
import { formatDuration, OPC_LABELS, opcLabel } from "@/lib/ae-meta";

export type SlowDbTimelineEvent = {
  t: number;
  opc: string;
  operation: string;
  durationMs: number;
};

type SlowDbTimelineChartProps = {
  types: SlowDbTypeStat[];
  events: SlowDbTimelineEvent[];
  arrivedAt?: number;
  emptyMessage?: string;
};

const HOUR_MS = 3_600_000;
const WINDOW_HOURS = 12;

type OpcType = {
  opc: string;
  operation: string;
  label: string;
};

function typeLabel(opc: string, operation: string) {
  return operation && operation !== opc ? `${operation} (${opc})` : opc;
}

function legendLabel(type: OpcType, catalog: OpcType[]) {
  const operation = type.operation?.trim();
  if (!operation || operation === type.opc) {
    return type.opc;
  }
  const clashes = catalog.filter((item) => item.operation === operation).length > 1;
  return clashes ? `${operation} (${type.opc})` : operation;
}

function catalogTypes(
  types: SlowDbTypeStat[],
  events: SlowDbTimelineEvent[],
): OpcType[] {
  const seen = new Set(events.map((event) => event.opc || "UNKNOWN"));
  const byOpc = new Map<string, OpcType>();

  const add = (opc: string, operation: string) => {
    byOpc.set(opc, { opc, operation, label: typeLabel(opc, operation) });
  };

  for (const type of types) {
    if (seen.has(type.opc)) {
      add(type.opc, type.operation);
    }
  }
  for (const event of events) {
    const opc = event.opc || "UNKNOWN";
    if (!byOpc.has(opc)) {
      add(opc, event.operation || opcLabel(opc));
    }
  }
  for (const opc of seen) {
    if (!byOpc.has(opc)) {
      add(opc, OPC_LABELS[opc] ?? opcLabel(opc));
    }
  }

  return [...byOpc.values()].sort(
    (a, b) =>
      a.operation.localeCompare(b.operation) || a.opc.localeCompare(b.opc),
  );
}

function hourWindow(now: number) {
  const currentHourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const start = currentHourStart - (WINDOW_HOURS - 1) * HOUR_MS;
  const hours: number[] = [];
  for (let i = 0; i < WINDOW_HOURS; i += 1) {
    hours.push(start + i * HOUR_MS);
  }
  return { start, hours };
}

function formatHour(value: number, start: number) {
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const started = new Date(start);
  if (date.toDateString() !== started.toDateString() && date.getHours() === 0) {
    const day = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `${day} ${time}`;
  }
  return time;
}

function formatRange(start: number, end: number) {
  const from = new Date(start);
  const to = new Date(end);
  const sameDay = from.toDateString() === to.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (sameDay) {
    return `${from.toLocaleDateString(undefined, dateOpts)} ${from.toLocaleTimeString(undefined, timeOpts)} – ${to.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${from.toLocaleString(undefined, { ...dateOpts, ...timeOpts })} – ${to.toLocaleString(undefined, { ...dateOpts, ...timeOpts })}`;
}

function formatSeconds(value: number) {
  if (value <= 0) {
    return "0";
  }
  if (value >= 10) {
    return `${Math.round(value)} s`;
  }
  if (value >= 1) {
    return `${value.toFixed(1)} s`;
  }
  return `${Math.round(value * 1000)} ms`;
}

function lineSeries(
  catalog: OpcType[],
  hours: number[],
  windowEvents: SlowDbTimelineEvent[],
  valueFor: (events: SlowDbTimelineEvent[]) => number,
) {
  return catalog.map((type, index) => {
    const color = colorForOpc(type.opc, index);
    return {
      name: type.label,
      type: "line" as const,
      smooth: 0.35,
      symbol: "circle",
      symbolSize: 7,
      data: hours.map((hour) =>
        valueFor(
          windowEvents.filter(
            (event) =>
              event.opc === type.opc &&
              event.t >= hour &&
              event.t < hour + HOUR_MS,
          ),
        ),
      ),
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      emphasis: { focus: "series" as const },
    };
  });
}

type TooltipItem = {
  seriesName: string;
  value: number;
  color: string;
  axisValue: string;
};

function tooltipHtml(
  items: TooltipItem[],
  formatValue: (value: number) => string,
) {
  const hour = items[0]?.axisValue;
  const rows = items
    .filter((item) => item.value > 0)
    .map(
      (item) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:6px"></span>${item.seriesName}: ${formatValue(item.value)}`,
    );
  return [hour, ...(rows.length ? rows : ["No slow calls"])]
    .filter(Boolean)
    .join("<br/>");
}

export default function SlowDbTimelineChart({
  types,
  events,
  arrivedAt,
  emptyMessage = "No slow database calls in the last 12 hours.",
}: SlowDbTimelineChartProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { start, hours } = hourWindow(now);
  const windowEnd = Math.min(now, start + WINDOW_HOURS * HOUR_MS);
  const windowEvents = useMemo(
    () => events.filter((event) => event.t >= start && event.t <= now),
    [events, now, start],
  );
  const catalog = useMemo(
    () => catalogTypes(types, windowEvents),
    [types, windowEvents],
  );
  const hourLabels = useMemo(
    () => hours.map((hour) => formatHour(hour, start)),
    [hours, start],
  );

  const countOption = useMemo(() => {
    if (catalog.length === 0) {
      return null;
    }
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        ...chartTooltip,
        formatter: (items: TooltipItem[]) =>
          tooltipHtml(items, (value) => `${value}`),
      },
      legend: { show: false },
      grid: { left: 48, right: 16, top: 20, bottom: 32 },
      xAxis: {
        type: "category",
        data: hourLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#3f3f46" } },
        axisLabel: { ...chartText, fontSize: 10, interval: 0 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Calls",
        nameTextStyle: chartText,
        min: 0,
        minInterval: 1,
        axisLabel: chartText,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: lineSeries(catalog, hours, windowEvents, (hourEvents) => hourEvents.length),
    };
  }, [catalog, hourLabels, hours, windowEvents]);

  const durationOption = useMemo(() => {
    if (catalog.length === 0) {
      return null;
    }
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        ...chartTooltip,
        formatter: (items: TooltipItem[]) =>
          tooltipHtml(items, (value) => formatDuration(value * 1000)),
      },
      legend: { show: false },
      grid: { left: 52, right: 16, top: 20, bottom: 32 },
      xAxis: {
        type: "category",
        data: hourLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#3f3f46" } },
        axisLabel: { ...chartText, fontSize: 10, interval: 0 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Seconds",
        nameTextStyle: chartText,
        min: 0,
        axisLabel: { ...chartText, formatter: formatSeconds },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: lineSeries(catalog, hours, windowEvents, (hourEvents) =>
        hourEvents.reduce((sum, event) => sum + (event.durationMs || 0), 0) /
        1000,
      ),
    };
  }, [catalog, hourLabels, hours, windowEvents]);

  if (!countOption || !durationOption) {
    return (
      <div className="flex h-64 flex-col">
        <div className="mb-1 flex justify-end">
          <ChartStamp at={arrivedAt} />
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500">
              Calls · {formatRange(start, windowEnd)}
            </p>
            <ChartStamp at={arrivedAt} />
          </div>
          <ReactECharts option={countOption} style={{ height: 260 }} notMerge />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500">
              Time consumed · {formatRange(start, windowEnd)}
            </p>
            <ChartStamp at={arrivedAt} />
          </div>
          <ReactECharts
            option={durationOption}
            style={{ height: 260 }}
            notMerge
          />
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {catalog.map((type, index) => (
          <li
            key={type.opc}
            className="inline-flex max-w-full items-center gap-1.5 text-[11px] text-zinc-400"
            title={type.label}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorForOpc(type.opc, index) }}
            />
            <span className="truncate">{legendLabel(type, catalog)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
