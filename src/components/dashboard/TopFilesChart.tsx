"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartColors,
  chartText,
  chartTooltip,
} from "@/components/dashboard/chartTheme";
import type { WatchedFile } from "@/lib/types";
import { fileLabel } from "@/lib/utils";

type TopFilesChartProps = {
  files: WatchedFile[];
  multiServer?: boolean;
};

export default function TopFilesChart({
  files,
  multiServer = false,
}: TopFilesChartProps) {
  const top = useMemo(() => {
    return [...files]
      .sort((a, b) => b.errors + b.warnings - (a.errors + a.warnings) || b.lines - a.lines)
      .slice(0, 8)
      .reverse();
  }, [files]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", ...chartTooltip },
      legend: {
        data: ["Errors", "Warnings"],
        textStyle: chartText,
        top: 0,
        right: 0,
      },
      grid: { left: 120, right: 16, top: 36, bottom: 24 },
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: chartText,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        type: "category",
        data: top.map((file) =>
          fileLabel(file.name, file.serverHost, multiServer),
        ),
        axisLabel: { ...chartText, fontSize: 11 },
      },
      series: [
        {
          name: "Errors",
          type: "bar",
          stack: "total",
          data: top.map((file) => file.errors),
          itemStyle: { color: chartColors.error },
        },
        {
          name: "Warnings",
          type: "bar",
          stack: "total",
          data: top.map((file) => file.warnings),
          itemStyle: { color: chartColors.warn },
        },
      ],
    }),
    [multiServer, top],
  );

  if (top.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No files to rank yet.
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 256 }} notMerge />;
}
