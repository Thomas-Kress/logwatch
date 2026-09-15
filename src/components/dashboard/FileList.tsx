import type { WatchedFile } from "@/lib/types";
import { DATA_WINDOW_DAYS } from "@/lib/data-window";
import { cn, fileLabel } from "@/lib/utils";

type FileListProps = {
  files: WatchedFile[];
  selected: string;
  multiServer?: boolean;
  onSelect: (name: string) => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({
  files,
  selected,
  multiServer = false,
  onSelect,
}: FileListProps) {
  return (
    <div className="flex h-80 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-200">Log files</h2>
        <span className="text-xs text-zinc-500">
          {files.length} in last {DATA_WINDOW_DAYS} days
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <button
          type="button"
          onClick={() => onSelect("")}
          className={cn(
            "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-zinc-800/70",
            selected === "" && "bg-zinc-800 text-zinc-50",
          )}
        >
          <span>All files</span>
        </button>
        {files.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            No files match the current filters.
          </p>
        ) : (
          files.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => onSelect(file.id)}
              className={cn(
                "flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/70",
                selected === file.id && "bg-zinc-800",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-zinc-200">
                  {fileLabel(file.name, file.serverHost, multiServer)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {multiServer ? `${file.serverHost} · ` : ""}
                  {file.role}
                  {file.instance ? ` ${file.instance}` : ""} · {formatSize(file.size)}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                {file.errors > 0 && (
                  <p className="text-red-300">{file.errors} err</p>
                )}
                {file.warnings > 0 && (
                  <p className="text-amber-300">{file.warnings} warn</p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
