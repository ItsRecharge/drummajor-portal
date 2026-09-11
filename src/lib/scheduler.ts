import cron from "node-cron";
import { processQueue } from "@/lib/announce";
import { processPendingItems, syncDriveTree } from "@/lib/library-sync";
import { getRootFolderId, isDriveConfigured } from "@/lib/drive";

// In-process scheduler. Under `next start` (single self-hosted instance — the
// deployment model) this polls the DB-backed announcement queue every minute
// and pushes staged library uploads; every 15 minutes it mirrors the Drive
// folder back into the DB so edits made in Drive by hand still show up.
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
  cron.schedule("*/15 * * * *", async () => {
    try {
      if (!(await isDriveConfigured()) || !(await getRootFolderId())) return;
      await syncDriveTree();
    } catch (err) {
      console.error("[scheduler] Drive tree sync failed:", err);
    }
  });
  console.log("[scheduler] announcement queue + library sync workers started");
}
