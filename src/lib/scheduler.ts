import cron from "node-cron";
import { processQueue } from "@/lib/announce";
import { processPendingItems } from "@/lib/library-sync";

// In-process scheduler. Under `next start` (single self-hosted instance — the
// deployment model) this polls the DB-backed announcement queue every minute.
// State lives in Postgres, so a restart mid-send simply resumes on the next tick.
let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;
  cron.schedule("* * * * *", () => {
    processQueue().catch((err) => console.error("[scheduler] processQueue failed:", err));
    processPendingItems().catch((err) =>
      console.error("[scheduler] library sync failed:", err),
    );
  });
  console.log("[scheduler] announcement queue + library sync workers started");
}
