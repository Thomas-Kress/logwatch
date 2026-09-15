"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  chartColors,
  chartText,
  chartTooltip,
} from "@/components/dashboard/chartTheme";
import type { ActivationFileStat } from "@/lib/types";
import { fileKey, fileLabel } from "@/lib/utils";

type ActivationFilesChartProps = {
  files: ActivationFileStat[];
  selected?: string;
  multiServer?: boolean;
};

export default function ActivationFilesChart({
  files,
  selected,
  multiServer = false,
}: ActivationFilesChartProps) {
  const top = useMemo(
    () => [...files].sort((a, b) => b.count - a.count).slice(0, 12).reverse(),
    [files],
  );

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", ...chartTooltip },
      grid: { left: 132, right: 16, top: 8, bottom: 24 },
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: chartText,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        type: "category",
        data: top.map((file) =>
          fileLabel(file.file, file.serverHost, multiServer),
        ),
        axisLabel: { ...chartText, fontSize: 11 },
      },
      series: [
        {
          name: "Activities",
          type: "bar",
          barMaxWidth: 18,
          data: top.map((file) => ({
            value: file.count,
            itemStyle: {
              color:
                selected &&
                selected === fileKey(file.server ?? "", file.file)
                  ? "#38bdf8"
                  : chartColors.wp,
              opacity:
                selected &&
                selected !== fileKey(file.server ?? "", file.file)
                  ? 0.35
                  : 1,
            },
          })),
        },
      ],
    }),
    [multiServer, selected, top],
  );

  if (top.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No WP log files reported activities yet.
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 256 }} notMerge />;
}
