"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartColors,
  chartText,
  chartTooltip,
} from "@/components/dashboard/chartTheme";

type SeverityChartProps = {
  info: number;
  warn: number;
  error: number;
  debug: number;
};

type SeverityLegend = {
  Info: boolean;
  Warn: boolean;
  Error: boolean;
  Debug: boolean;
};

const DEFAULT_SELECTED: SeverityLegend = {
  Info: true,
  Warn: true,
  Error: true,
  Debug: true,
};

export default function SeverityChart({
  info,
  warn,
  error,
  debug,
}: SeverityChartProps) {
  const [selected, setSelected] = useState<SeverityLegend>(DEFAULT_SELECTED);
  const data = useMemo(
    () => [
      { name: "Info", value: info, itemStyle: { color: chartColors.info } },
      { name: "Warn", value: warn, itemStyle: { color: chartColors.warn } },
      { name: "Error", value: error, itemStyle: { color: chartColors.error } },
      { name: "Debug", value: debug, itemStyle: { color: chartColors.debug } },
    ],
    [debug, error, info, warn],
  );
  const slices = useMemo(
    () => data.filter((item) => item.value > 0),
    [data],
  );

  const total = info + warn + error + debug;
  const legendSelected = useMemo(
    () =>
      Object.fromEntries(
        slices.map((item) => [
          item.name,
          selected[item.name as keyof SeverityLegend] !== false,
        ]),
      ),
    [selected, slices],
  );
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", ...chartTooltip },
      title: {
        text: String(total),
        subtext: "lines",
        left: "center",
        top: "38%",
        textStyle: {
          color: "#fafafa",
          fontSize: 22,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontWeight: 500,
        },
        subtextStyle: { color: "#a1a1aa", fontSize: 12 },
      },
      legend: {
        bottom: 0,
        data: slices.map((item) => item.name),
        selected: legendSelected,
        textStyle: chartText,
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          avoidLabelOverlap: true,
          label: { color: "#d4d4d8", formatter: "{b}\n{c}" },
          data: slices,
        },
      ],
    }),
    [legendSelected, slices, total],
  );
  const onEvents = useMemo(
    () => ({
      legendselectchanged: (params: { selected: Record<string, boolean> }) => {
        setSelected((current) => {
          const next = {
            Info: params.selected.Info !== false,
            Warn: params.selected.Warn !== false,
            Error: params.selected.Error !== false,
            Debug: params.selected.Debug !== false,
          };
          if (
            current.Info === next.Info &&
            current.Warn === next.Warn &&
            current.Error === next.Error &&
            current.Debug === next.Debug
          ) {
            return current;
          }
          return next;
        });
      },
    }),
    [],
  );

  if (slices.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No severity mix yet.
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
