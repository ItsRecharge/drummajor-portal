// Next.js calls register() once when a server instance boots. We use it to start
// the in-process announcement scheduler, guarded to the Node.js runtime so the
// node-cron import is never pulled into an Edge bundle. See
// node_modules/next/dist/docs/01-app/02-guides/instrumentation.md.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
