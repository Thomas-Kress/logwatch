import type { Alert, DashboardFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

type AlertListProps = {
  alerts: Alert[];
  onFilter: (patch: Partial<DashboardFilters>) => void;
};

export function AlertList({ alerts, onFilter }: AlertListProps) {
  return (
    <div className="flex h-80 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Alerts</h2>
        <span className="text-xs text-zinc-500">{alerts.length} active</span>
      </div>
      <div className="flex-1 overflow-auto">
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No alerts. Thresholds come from `.env` (`ALERT_ERROR_PER_MIN`,
            `ALERT_WARN_PER_MIN`).
          </p>
        ) : (
          alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() =>
                onFilter({
                  file: alert.file ?? "",
                  messageId: alert.messageId ?? "",
                  severity: alert.level === "critical" ? "error" : "warn",
                })
              }
              className="flex w-full flex-col gap-1 border-b border-zinc-900 px-4 py-3 text-left hover:bg-zinc-800/70"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-xs font-medium uppercase",
                    alert.level === "critical" ? "text-red-300" : "text-amber-300",
                  )}
                >
                  {alert.level}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  ×{alert.count}
                </span>
              </div>
              <p className="text-sm text-zinc-200">{alert.title}</p>
              <p className="truncate text-xs text-zinc-500">{alert.detail}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
