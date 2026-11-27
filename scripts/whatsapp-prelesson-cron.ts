/**
 * Massinissa School — 24-Hour Pre-Lesson Background Cron Worker (CLI Runner)
 *
 * Usage: npx tsx scripts/whatsapp-prelesson-cron.ts
 * (In Vercel + wa-bridge mode, /api/cron/whatsapp-24h is triggered automatically every hour.)
 */

import "dotenv/config";
import { run24hPreLessonScan } from "../src/lib/whatsappTriggers";

run24hPreLessonScan()
  .then((res) => {
    console.log(`[WA 24h Worker] Scan complete. Staged ${res.stagedCount} reminder(s).`, res.skippedReason || "");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[WA 24h Worker] Fatal error:", err);
    process.exit(1);
  });
