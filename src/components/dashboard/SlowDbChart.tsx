"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartText,
  chartTooltip,
  colorForOpc,
} from "@/components/dashboard/chartTheme";
import { formatDuration } from "@/lib/ae-meta";

export type SlowDbTypeStat = {
  opc: string;
  operation: string;
  count: number;
  maxDurationMs: number;
  avgDurationMs: number;
};

type SlowDbChartProps = {
  types: SlowDbTypeStat[];
  emptyMessage?: string;
  itemNoun?: string;
};

export default function SlowDbChart({
  types,
  emptyMessage = "No slow database calls in this window.",
  itemNoun = "slow call",
}: SlowDbChartProps) {
  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        ...chartTooltip,
        formatter: (items: { dataIndex: number }[]) => {
          const item = items[0];
          if (!item) {
            return "";
          }
          const type = types[item.dataIndex];
          if (!type) {
            return "";
          }
          return [
            `<strong>${type.operation}</strong> (${type.opc})`,
            `${type.count} ${itemNoun}${type.count === 1 ? "" : "s"}`,
            type.maxDurationMs
              ? `Slowest ${formatDuration(type.maxDurationMs)}`
              : "",
            type.avgDurationMs
              ? `Average ${formatDuration(type.avgDurationMs)}`
              : "",
          ]
            .filter(Boolean)
            .join("<br/>");
        },
      },
      legend: { show: false },
      grid: { left: 44, right: 16, top: 12, bottom: 36 },
      xAxis: {
        type: "category",
        data: types.map((type) => type.operation),
        axisLine: { lineStyle: { color: "#3f3f46" } },
        axisLabel: {
          ...chartText,
          interval: 0,
          hideOverlap: false,
        },
      },
      yAxis: {
        type: "value",
        name: "Calls",
        nameTextStyle: chartText,
        minInterval: 1,
        axisLabel: chartText,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          name: "Slow calls",
          type: "bar",
          barMaxWidth: 48,
          data: types.map((type, index) => ({
            value: type.count,
            itemStyle: { color: colorForOpc(type.opc, index) },
          })),
        },
      ],
    }),
    [types, itemNoun],
  );

  if (types.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        {emptyMessage}
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 256 }} notMerge />;
}
