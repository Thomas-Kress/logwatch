"use client";

import { useState } from "react";
import { MAX_HEALTH_CYCLES } from "@/lib/health-log";
import type { HealthCycle } from "@/lib/types";
import { cn, fileLabel } from "@/lib/utils";

type HealthLogProps = {
  cycles: HealthCycle[];
  multiServer?: boolean;
};

function formatCycleTime(at: number) {
  return new Date(at).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function FileNames({
  files,
  serverHost,
  multiServer,
  empty,
}: {
  files: string[];
  serverHost: string;
  multiServer: boolean;
  empty: string;
}) {
  if (files.length === 0) {
    return <p className="text-xs text-zinc-500">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5 font-mono text-xs text-zinc-300">
      {files.map((name) => (
        <li key={name} className="truncate">
          {fileLabel(name, serverHost, multiServer)}
        </li>
      ))}
    </ul>
  );
}

export function HealthLog({ cycles, multiServer = false }: HealthLogProps) {
  const [expandedId, setExpandedId] = useState<number | "none" | undefined>(
    undefined,
  );
  const latest = cycles[0];
  const openId =
    expandedId === undefined
      ? latest?.id
      : expandedId === "none"
        ? undefined
        : expandedId;

  return (
    <section
      id="health-log"
      className="flex max-h-[36rem] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70"
    >
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Health log</h2>
        {latest ? (
          <p className="mt-0.5 text-xs text-zinc-500">
            Last update cycle {formatCycleTime(latest.at)}
            {multiServer ? ` · ${latest.serverHost}` : ""} · {latest.linesSelected}{" "}
            lines selected · {latest.changedFiles.length} changed ·{" "}
            {latest.unchangedFiles.length} unchanged
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-zinc-500">
            Each file refresh is recorded here so you can see whether the watcher
            is picking up log changes. History is kept for the last{" "}
            {MAX_HEALTH_CYCLES} cycles.
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {cycles.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No update cycles yet. The log keeps a history once the watcher starts
            listing files.
          </p>
        ) : (
          cycles.map((cycle) => {
            const open = openId === cycle.id;
            return (
              <article
                key={cycle.id}
                className="border-b border-zinc-900/80"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(open ? "none" : cycle.id)
                  }
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-zinc-800/70"
                >
                  <span className="font-mono text-xs text-zinc-400">
                    {formatCycleTime(cycle.at)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                    {multiServer && (
                      <span className="text-zinc-500">{cycle.serverHost}</span>
                    )}
                    <span
                      className={cn(
                        "font-mono",
                        cycle.linesSelected > 0
                          ? "text-emerald-300"
                          : "text-zinc-500",
                      )}
                    >
                      {cycle.linesSelected} lines
                    </span>
                    <span className="text-sky-300">
                      {cycle.changedFiles.length} changed
                    </span>
                    <span className="text-zinc-500">
                      {cycle.unchangedFiles.length} unchanged
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="grid gap-4 border-t border-zinc-900 bg-zinc-950/40 px-4 py-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-sky-400">
                        Changed ({cycle.changedFiles.length})
                      </p>
                      <FileNames
                        files={cycle.changedFiles}
                        serverHost={cycle.serverHost}
                        multiServer={multiServer}
                        empty="No files changed in this cycle."
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Unchanged ({cycle.unchangedFiles.length})
                      </p>
                      <FileNames
                        files={cycle.unchangedFiles}
                        serverHost={cycle.serverHost}
                        multiServer={multiServer}
                        empty="No unchanged files in this cycle."
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
