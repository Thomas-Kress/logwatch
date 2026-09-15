"use client";

import {
  Check,
  ChevronDown,
  Database,
  HeartPulse,
  LayoutDashboard,
  Radio,
  Server,
  Sparkles,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ConnectionStatus, ServerSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";

export type DashboardView =
  | "overview"
  | "slowdb"
  | "activations"
  | "processes";

const VIEWS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "slowdb", label: "Performance Metrics", icon: Database },
  { id: "activations", label: "Activities", icon: Sparkles },
  { id: "processes", label: "Processes", icon: Server },
] as const;

type AppHeaderProps = {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  status: ConnectionStatus;
  statusLabel: string;
  hostLabel: string;
  path?: string;
  pattern?: string;
  generatedAt?: number;
  servers: ServerSnapshot[];
  multiServer: boolean;
  connected: boolean;
  showProcesses?: boolean;
  showHealthLog?: boolean;
  onToggleHealthLog?: () => void;
};

export function AppHeader({
  view,
  onViewChange,
  status,
  statusLabel,
  hostLabel,
  path,
  pattern,
  generatedAt,
  servers,
  multiServer,
  connected,
  showProcesses = true,
  showHealthLog = false,
  onToggleHealthLog,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const views = VIEWS.filter((item) => item.id !== "processes" || showProcesses);
  const currentView = views.find((item) => item.id === view) ?? views[0];
  const CurrentIcon = currentView.icon;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400">
            Logwatch
          </p>
          <p className="mt-0.5 truncate text-sm text-zinc-400">
            {connected
              ? `${hostLabel} · ${path} · ${pattern}${
                  generatedAt
                    ? ` · updated ${new Date(generatedAt).toLocaleTimeString(undefined, { hour12: false })}`
                    : ""
                }`
              : "Reading .env and opening SSH…"}
          </p>
          {multiServer && (
            <div className="mt-2 flex flex-wrap gap-2">
              {servers.map((server) => (
                <span
                  key={server.id}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                    server.status === "live" &&
                      "border-emerald-800 bg-emerald-950/50 text-emerald-300",
                    server.status === "connecting" &&
                      "border-sky-800 bg-sky-950/50 text-sky-300",
                    server.status === "error" &&
                      "border-red-800 bg-red-950/50 text-red-300",
                    (server.status === "disconnected" || !server.status) &&
                      "border-zinc-700 bg-zinc-900 text-zinc-400",
                  )}
                >
                  {server.host}
                  {server.status === "live" ? "" : ` · ${server.status}`}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:text-zinc-50"
            >
              <CurrentIcon className="size-3.5" />
              {currentView.label}
              <ChevronDown
                className={cn(
                  "size-3.5 text-zinc-500 transition",
                  menuOpen && "rotate-180",
                )}
              />
            </button>
            {menuOpen && (
              <div
                id={menuId}
                role="menu"
                aria-label="Panels"
                className="absolute right-0 z-40 mt-2 min-w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
              >
                {views.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onViewChange(item.id);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                        active
                          ? "bg-zinc-800 text-zinc-50"
                          : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200",
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span className="flex-1">{item.label}</span>
                      {active && <Check className="size-3.5 text-sky-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {onToggleHealthLog && (
            <button
              type="button"
              onClick={onToggleHealthLog}
              aria-pressed={showHealthLog}
              aria-controls={showHealthLog ? "health-log" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                showHealthLog
                  ? "border-sky-800 bg-sky-950/60 text-sky-200"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
              )}
            >
              <HeartPulse className="size-3.5" />
              Health
            </button>
          )}
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
              status === "live" &&
                (multiServer && servers.some((server) => server.status !== "live")
                  ? "border-amber-800 bg-amber-950/60 text-amber-300"
                  : "border-emerald-800 bg-emerald-950/60 text-emerald-300"),
              status === "connecting" &&
                "border-sky-800 bg-sky-950/60 text-sky-300",
              status === "error" && "border-red-800 bg-red-950/60 text-red-300",
              status === "disconnected" &&
                "border-zinc-700 bg-zinc-900 text-zinc-400",
            )}
          >
            <Radio className="size-4" />
            {statusLabel}
          </div>
        </div>
      </div>
    </header>
  );
}
