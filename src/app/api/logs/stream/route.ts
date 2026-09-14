import { getLogWatcher } from "@/lib/log-watcher";
import { SNAPSHOT_INTERVAL_MS } from "@/lib/data-window";
import type { HealthCycle, LogLine, WatcherSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  try {
    getLogWatcher().getSnapshot();
  } catch (error) {
    return Response.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const watcher = getLogWatcher();
  watcher.ensureStarted();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event, data)));
        } catch {
          cleanup();
        }
      };

      const onSnapshot = (snapshot: WatcherSnapshot) => send("snapshot", snapshot);
      const onLines = (lines: LogLine[]) => send("lines", lines);
      const onStatus = (status: Pick<WatcherSnapshot, "status" | "error">) =>
        send("status", status);
      const onHealth = (cycles: HealthCycle[]) => send("health", cycles);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);
      const snapshotBeat = setInterval(() => {
        try {
          send("snapshot", watcher.getSnapshot());
        } catch {
          // keep the stream open if a snapshot build fails
        }
      }, SNAPSHOT_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        clearInterval(snapshotBeat);
        watcher.off("snapshot", onSnapshot);
        watcher.off("lines", onLines);
        watcher.off("status", onStatus);
        watcher.off("health", onHealth);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      watcher.on("snapshot", onSnapshot);
      watcher.on("lines", onLines);
      watcher.on("status", onStatus);
      watcher.on("health", onHealth);
      send("snapshot", watcher.getSnapshot());
      send("health", watcher.getHealthLog());

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
