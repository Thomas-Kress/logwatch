"use client";

import type { ReactNode } from "react";
import { formatChartStamp } from "@/lib/chart-stamp";
import { cn } from "@/lib/utils";

type ChartStampProps = {
  at?: number;
  className?: string;
};

export function ChartStamp({ at, className }: ChartStampProps) {
  if (!at) {
    return (
      <span
        className={cn(
          "shrink-0 font-mono text-[11px] tabular-nums text-zinc-600",
          className,
        )}
      >
        No new data
      </span>
    );
  }
  const date = new Date(at);
  return (
    <time
      dateTime={date.toISOString()}
      title={`New data arrived ${date.toLocaleString(undefined, { hour12: false })}`}
      className={cn(
        "shrink-0 font-mono text-[11px] tabular-nums text-zinc-500",
        className,
      )}
    >
      New data {formatChartStamp(at)}
    </time>
  );
}

type ChartHeaderProps = {
  title: string;
  description?: ReactNode;
  arrivedAt?: number;
  titleAs?: "h2" | "h3";
};

export function ChartHeader({
  title,
  description,
  arrivedAt,
  titleAs: TitleTag = "h2",
}: ChartHeaderProps) {
  const titleClass =
    TitleTag === "h3"
      ? "text-xs font-medium text-zinc-400"
      : "text-sm font-medium text-zinc-200";
  return (
    <div className="mb-2">
      <div className="flex items-start justify-between gap-3">
        <TitleTag className={titleClass}>{title}</TitleTag>
        <ChartStamp at={arrivedAt} />
      </div>
      {description ? (
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      ) : null}
    </div>
  );
}

type ChartCardProps = {
  title: string;
  description?: ReactNode;
  arrivedAt?: number;
  children: ReactNode;
  className?: string;
};

export function ChartCard({
  title,
  description,
  arrivedAt,
  children,
  className,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4",
        className,
      )}
    >
      <ChartHeader
        title={title}
        description={description}
        arrivedAt={arrivedAt}
      />
      {children}
    </div>
  );
}
