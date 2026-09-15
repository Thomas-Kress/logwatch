import { getLogWatcher } from "@/lib/log-watcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const watcher = getLogWatcher();
    watcher.ensureStarted();
    return Response.json(watcher.getSnapshot({ includeHealth: true }), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
