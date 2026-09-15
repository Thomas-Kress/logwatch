import { getLogWatcher } from "@/lib/log-watcher";
import type { HealthCycle, LogLine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(event: string, data: string) {
  return `event: ${event}\ndata: ${data}\n\n`;
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

  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const sendJson = (event: string, json: string) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(encodeEvent(event, json)));
        } catch {
          cleanup();
        }
      };

      const send = (event: string, data: unknown) => {
        sendJson(event, JSON.stringify(data));
      };

      const onSnapshot = () => sendJson("snapshot", watcher.getSnapshotJson());
      const onLines = (lines: LogLine[]) => send("lines", lines);
      const onHealth = (cycles: HealthCycle[]) => send("health", cycles);

      const heartbeat = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);

      cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(heartbeat);
        watcher.off("snapshot", onSnapshot);
        watcher.off("lines", onLines);
        watcher.off("health", onHealth);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      watcher.on("snapshot", onSnapshot);
      watcher.on("lines", onLines);
      watcher.on("health", onHealth);
      sendJson("snapshot", watcher.getSnapshotJson());
      send("health", watcher.getHealthLog());

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
