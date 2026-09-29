"use client";

import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import type { Alert as LogAlert } from "@/lib/types";

type AlertBannerProps = {
  alerts: LogAlert[];
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
    <Alert
      severity={critical > 0 ? "error" : "warning"}
      onClose={() => setDismissedIds(liveIds)}
      slotProps={{
        closeButton: {
          "aria-label": "Dismiss alerts until new ones arrive",
          title: "Dismiss until new alerts",
        },
      }}
    >
      <AlertTitle>
        {visible.length} active alert{visible.length === 1 ? "" : "s"}
        {critical > 0 ? ` · ${critical} critical` : ""}
      </AlertTitle>
      {top.title}: {top.detail}
    </Alert>
  );
}
