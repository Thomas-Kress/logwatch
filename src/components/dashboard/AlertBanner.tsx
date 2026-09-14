"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, X } from "lucide-react";
import type { Alert } from "@/lib/types";
import { cn } from "@/lib/utils";

type AlertBannerProps = {
  alerts: Alert[];
};

export function AlertBanner({ alerts }: AlertBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const liveIds = useMemo(
    () => alerts.map((alert) => alert.id),
    [alerts],
  );

  useEffect(() => {
    const live = new Set(liveIds);
    setDismissedIds((current) => {
      const next = current.filter((id) => live.has(id));
      return next.length === current.length ? current : next;
    });
  }, [liveIds]);

  const visible = useMemo(() => {
    const dismissed = new Set(dismissedIds);
    return alerts.filter((alert) => !dismissed.has(alert.id));
  }, [alerts, dismissedIds]);

  if (visible.length === 0) {
    return null;
  }

  const critical = visible.filter((alert) => alert.level === "critical").length;
  const top = visible[0];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
        critical > 0
          ? "border-red-900 bg-red-950/50 text-red-100"
          : "border-amber-900 bg-amber-950/40 text-amber-100",
      )}
    >
      <Bell className="size-4 shrink-0" />
      <p className="font-medium">
        {visible.length} active alert{visible.length === 1 ? "" : "s"}
        {critical > 0 ? ` · ${critical} critical` : ""}
      </p>
      <p className="min-w-0 flex-1 truncate text-zinc-300">
        {top.title}: {top.detail}
      </p>
      <button
        type="button"
        aria-label="Dismiss alerts until new ones arrive"
        title="Dismiss until new alerts"
        onClick={() => setDismissedIds(liveIds)}
        className={cn(
          "ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
          "text-current/70 hover:bg-white/10 hover:text-current",
        )}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
