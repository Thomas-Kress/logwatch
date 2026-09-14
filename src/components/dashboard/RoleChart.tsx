"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartColors,
  chartText,
  chartTooltip,
} from "@/components/dashboard/chartTheme";
import type { SeriesPoint } from "@/lib/types";

type RoleChartProps = {
  series: SeriesPoint[];
};

export default function RoleChart({ series }: RoleChartProps) {
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", ...chartTooltip },
      legend: {
        data: ["CP", "WP"],
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
          name: "CP",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: series.map((point) => [point.t, point.cp]),
          lineStyle: { color: chartColors.cp },
          itemStyle: { color: chartColors.cp },
          areaStyle: { color: "rgba(129, 140, 248, 0.15)" },
        },
        {
          name: "WP",
          type: "line",
          smooth: true,
          showSymbol: false,
          data: series.map((point) => [point.t, point.wp]),
          lineStyle: { color: chartColors.wp },
          itemStyle: { color: chartColors.wp },
          areaStyle: { color: "rgba(52, 211, 153, 0.12)" },
        },
      ],
    }),
    [series],
  );

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Waiting for CP / WP traffic…
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 256 }} notMerge />;
}
