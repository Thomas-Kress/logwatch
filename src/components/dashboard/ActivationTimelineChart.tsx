"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartColors,
  chartText,
  chartTooltip,
} from "@/components/dashboard/chartTheme";
import { ACTIVATION_WINDOW_HOURS } from "@/lib/data-window";
import type { ActivationHourPoint } from "@/lib/types";

type ActivationTimelineChartProps = {
  hourly: ActivationHourPoint[];
};

function formatTick(value: number) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ActivationTimelineChart({
  hourly,
}: ActivationTimelineChartProps) {
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", ...chartTooltip },
      grid: { left: 48, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: "#3f3f46" } },
        axisLabel: {
          ...chartText,
          formatter: (value: number) => formatTick(value),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Activations",
        nameTextStyle: chartText,
        minInterval: 1,
        axisLabel: chartText,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          name: "WP",
          type: "bar",
          barMaxWidth: 18,
          data: hourly.map((point) => [point.t, point.count]),
          itemStyle: { color: chartColors.wp },
        },
      ],
    }),
    [hourly],
  );

  if (hourly.every((point) => point.count === 0)) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No activities in WP logs over the last {ACTIVATION_WINDOW_HOURS} hours.
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 256 }} notMerge />;
}
