"use client";

import type { DashboardFilters, FileRole, ServerSnapshot, Severity } from "@/lib/types";

type FilterBarProps = {
  filters: DashboardFilters;
  servers?: ServerSnapshot[];
  onChange: (filters: DashboardFilters) => void;
};

const selectClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none";
const inputClass =
  "h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-sky-700";

export function FilterBar({ filters, servers = [], onChange }: FilterBarProps) {
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
      <p className="mr-2 text-sm font-medium text-zinc-300">Filters</p>
      {servers.length > 1 && (
        <select
          value={filters.server}
          onChange={(event) =>
            onChange({ ...filters, server: event.target.value, file: "" })
          }
          className={selectClass}
        >
          <option value="">All servers</option>
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.host}
            </option>
          ))}
        </select>
      )}
      <select
        value={filters.role}
        onChange={(event) =>
          onChange({ ...filters, role: event.target.value as FileRole | "all" })
        }
        className={selectClass}
      >
        <option value="all">All processes</option>
        <option value="CP">CP</option>
        <option value="WP">WP</option>
        <option value="JWP">JWP</option>
        <option value="JCP">JCP</option>
      </select>
      <select
        value={filters.severity}
        onChange={(event) =>
          onChange({
            ...filters,
            severity: event.target.value as Severity | "all",
          })
        }
        className={selectClass}
      >
        <option value="all">All levels</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
      <input
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        placeholder="Search message or object…"
        className={`${inputClass} min-w-48 flex-1`}
      />
      <input
        value={filters.messageId}
        onChange={(event) =>
          onChange({ ...filters, messageId: event.target.value })
        }
        placeholder="U00… message"
        className={`${inputClass} w-36`}
      />
      <input
        value={filters.runId}
        onChange={(event) => onChange({ ...filters, runId: event.target.value })}
        placeholder="RunID"
        className={`${inputClass} w-32 font-mono`}
      />
    </section>
  );
}
