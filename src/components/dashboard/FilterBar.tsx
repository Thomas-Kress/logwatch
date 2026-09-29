"use client";

import { FilterSearch } from "@/components/ui/FilterSearch";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import type { DashboardFilters, FileRole, ServerSnapshot, Severity } from "@/lib/types";

type FilterBarProps = {
  filters: DashboardFilters;
  servers?: ServerSnapshot[];
  onChange: (filters: DashboardFilters) => void;
};

export function FilterBar({ filters, servers = [], onChange }: FilterBarProps) {
  return (
    <FilterToolbar label="Filters">
      {servers.length > 1 && (
        <FilterSelect
          value={filters.server}
          onChange={(server) => onChange({ ...filters, server, file: "" })}
          options={[
            { value: "", label: "All servers" },
            ...servers.map((server) => ({
              value: server.id,
              label: server.host,
            })),
          ]}
        />
      )}
      <FilterSelect
        value={filters.role}
        onChange={(role) =>
          onChange({ ...filters, role: role as FileRole | "all" })
        }
        options={[
          { value: "all", label: "All processes" },
          { value: "CP", label: "CP" },
          { value: "WP", label: "WP" },
          { value: "JWP", label: "JWP" },
          { value: "JCP", label: "JCP" },
        ]}
      />
      <FilterSelect
        value={filters.severity}
        onChange={(severity) =>
          onChange({
            ...filters,
            severity: severity as Severity | "all",
          })
        }
        options={[
          { value: "all", label: "All levels" },
          { value: "error", label: "Error" },
          { value: "warn", label: "Warn" },
          { value: "info", label: "Info" },
          { value: "debug", label: "Debug" },
        ]}
      />
      <FilterSearch
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
        placeholder="Search message or object…"
      />
      <FilterSearch
        value={filters.messageId}
        onChange={(messageId) => onChange({ ...filters, messageId })}
        placeholder="U00… message"
        sx={{ flex: "0 0 144px", minWidth: 144 }}
      />
      <FilterSearch
        value={filters.runId}
        onChange={(runId) => onChange({ ...filters, runId })}
        placeholder="RunID"
        sx={{
          flex: "0 0 128px",
          minWidth: 128,
          "& .MuiInputBase-input": {
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          },
        }}
      />
    </FilterToolbar>
  );
}
