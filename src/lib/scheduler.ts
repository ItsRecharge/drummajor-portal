import cron from "node-cron";
import { processQueue } from "@/lib/announce";
import { processPendingItems, syncDriveTree } from "@/lib/library-sync";
import { getRootFolderId, isDriveConfigured } from "@/lib/drive";
import { runDailyEventJobs } from "@/lib/event-comms";
import { DEFAULT_TZ } from "@/lib/event-schedule";

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
  // 9 AM band time: event reminders (7 days / 3 days / day-of) and, once a
  // month, the upcoming-events overview. Idempotent, so a missed day catches up.
  cron.schedule(
    "0 9 * * *",
    () => {
      runDailyEventJobs().catch((err) => console.error("[scheduler] daily event jobs failed:", err));
    },
    { timezone: DEFAULT_TZ },
  );
  console.log("[scheduler] announcement queue + library sync + daily event email workers started");
}
