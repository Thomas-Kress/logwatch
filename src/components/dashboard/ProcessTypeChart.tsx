"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartText,
  chartTooltip,
  colorForProcessType,
} from "@/components/dashboard/chartTheme";
import type { AeProcessTypeStat } from "@/lib/types";

type ProcessTypeChartProps = {
  byType: AeProcessTypeStat[];
};

export default function ProcessTypeChart({ byType }: ProcessTypeChartProps) {
  const data = useMemo(
    () =>
      byType.map((item) => ({
        name: item.type,
        value: item.count,
        itemStyle: { color: colorForProcessType(item.type) },
      })),
    [byType],
  );

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", ...chartTooltip },
      legend: {
        bottom: 0,
        data: data.map((item) => item.name),
        textStyle: chartText,
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          avoidLabelOverlap: true,
          label: { color: "#d4d4d8", formatter: "{b}\n{c}" },
          data,
        },
      ],
    }),
    [data],
  );

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No process types yet.
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 256 }} notMerge />;
}
