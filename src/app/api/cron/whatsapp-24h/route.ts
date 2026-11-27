import { NextRequest, NextResponse } from "next/server";
import { run24hPreLessonScan } from "@/lib/whatsappTriggers";

const BRIDGE_SECRET = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";
const CRON_SECRET = process.env.CRON_SECRET || BRIDGE_SECRET;

function isCronAuthorized(req: NextRequest): boolean {
  const apiKey = req.headers.get("x-api-key") || "";
  if (apiKey && apiKey === BRIDGE_SECRET) return true;

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${CRON_SECRET}` || authHeader === `Bearer ${BRIDGE_SECRET}`) {
    return true;
  }

  return false;
}

async function handleCron(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await run24hPreLessonScan();
    return NextResponse.json({
      success: true,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[API /api/cron/whatsapp-24h] Error:", err);
    return NextResponse.json({ error: err?.message || "Cron failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
