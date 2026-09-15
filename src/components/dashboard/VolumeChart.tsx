"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartColors,
  chartText,
  chartTooltip,
} from "@/components/dashboard/chartTheme";
import type { SeriesPoint } from "@/lib/types";

type VolumeChartProps = {
  series: SeriesPoint[];
};

type SeverityLegend = {
  Info: boolean;
  Warn: boolean;
  Error: boolean;
};

const DEFAULT_SELECTED: SeverityLegend = {
  Info: true,
  Warn: true,
  Error: true,
};

export default function VolumeChart({ series }: VolumeChartProps) {
  const [selected, setSelected] = useState<SeverityLegend>(DEFAULT_SELECTED);
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", ...chartTooltip },
      legend: {
        data: ["Info", "Warn", "Error"],
        selected,
        textStyle: chartText,
        top: 0,
        right: 0,
      },
      grid: { left: 44, right: 12, top: 36, bottom: 28 },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: "#3f3f46" } },
        axisLabel: chartText,
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: chartText,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          name: "Info",
          type: "bar",
          stack: "total",
          barMaxWidth: 18,
          data: series.map((point) => [point.t, point.info + point.debug]),
          itemStyle: { color: chartColors.info },
        },
        {
          name: "Warn",
          type: "bar",
          stack: "total",
          barMaxWidth: 18,
          data: series.map((point) => [point.t, point.warn]),
          itemStyle: { color: chartColors.warn },
        },
        {
          name: "Error",
          type: "bar",
          stack: "total",
          barMaxWidth: 18,
          data: series.map((point) => [point.t, point.error]),
          itemStyle: { color: chartColors.error },
        },
      ],
    }),
    [selected, series],
  );
  const onEvents = useMemo(
    () => ({
      legendselectchanged: (params: { selected: Record<string, boolean> }) => {
        setSelected((current) => {
          const next = {
            Info: params.selected.Info !== false,
            Warn: params.selected.Warn !== false,
            Error: params.selected.Error !== false,
          };
          if (
            current.Info === next.Info &&
            current.Warn === next.Warn &&
            current.Error === next.Error
          ) {
            return current;
          }
          return next;
        });
      },
    }),
    [],
  );

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Waiting for log volume…
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 256 }}
      notMerge
      onEvents={onEvents}
    />
  );
}
