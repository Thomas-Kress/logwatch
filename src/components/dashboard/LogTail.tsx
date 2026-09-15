"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { eventTime } from "@/lib/data-window";
import type { LogLine, Severity } from "@/lib/types";
import { cn, fileLabel } from "@/lib/utils";

type LogTailProps = {
  lines: LogLine[];
  multiServer?: boolean;
};

const severityClass: Record<Severity, string> = {
  error: "text-red-300",
  warn: "text-amber-300",
  info: "text-sky-300",
  debug: "text-zinc-500",
  unknown: "text-zinc-400",
};

function formatTs(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPreview(line: LogLine) {
  const message = line.messageId
    ? `${line.messageId} ${line.message}`
    : line.message;
  const extras = [line.objectName, line.runId].filter(Boolean);
  return extras.length > 0 ? `${message} · ${extras.join(" · ")}` : message;
}

export function LogTail({ lines, multiServer = false }: LogTailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToTop = useRef(true);
  const [listOpen, setListOpen] = useState(false);

  const visible = useMemo(
    () =>
      [...lines].sort((a, b) => {
        const delta = eventTime(b) - eventTime(a);
        return delta !== 0 ? delta : b.id - a.id;
      }),
    [lines],
  );

  useEffect(() => {
    if (!listOpen || !stickToTop.current || !scrollerRef.current) {
      return;
    }
    scrollerRef.current.scrollTop = 0;
  }, [listOpen, visible]);

  return (
    <section
      className={cn(
        "flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
        listOpen && "min-h-[28rem]",
      )}
    >
      <button
        type="button"
        onClick={() => setListOpen((open) => !open)}
        aria-expanded={listOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/80"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
          {listOpen ? (
            <ChevronDown className="size-3.5 text-zinc-500" />
          ) : (
            <ChevronRight className="size-3.5 text-zinc-500" />
          )}
          Live tail
        </span>
        <span className="text-xs text-zinc-500">
          {listOpen
            ? `${visible.length} warnings & errors`
            : `${visible.length} hidden`}
        </span>
      </button>
      {listOpen ? (
        <div
          ref={scrollerRef}
          onScroll={(event) => {
            stickToTop.current = event.currentTarget.scrollTop < 40;
          }}
          className="flex-1 overflow-auto border-t border-zinc-800 font-mono text-[13px] leading-6"
        >
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-sm text-zinc-500">
              No warnings or errors match the current filters.
            </p>
          ) : (
            visible.map((line) => (
              <div
                key={line.id}
                className="group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-zinc-900/80 px-4 py-1 hover:bg-zinc-900/80 lg:grid-cols-[auto_190px_56px_88px_minmax(0,1fr)]"
              >
                <span className="whitespace-nowrap text-zinc-500">
                  {formatTs(line.ts)}
                </span>
                <span className="hidden truncate text-zinc-500 lg:block">
                  {fileLabel(line.file, line.serverHost, multiServer)}
                </span>
                <span className="hidden text-zinc-600 lg:block">{line.role}</span>
                <span
                  className={cn(
                    "hidden uppercase lg:block",
                    severityClass[line.severity],
                  )}
                >
                  {line.severity}
                </span>
                <span
                  className={cn(
                    "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap group-hover:overflow-visible group-hover:whitespace-pre-wrap group-hover:break-all",
                    severityClass[line.severity],
                  )}
                >
                  {formatPreview(line)}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
