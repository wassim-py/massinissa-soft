import { NextRequest, NextResponse } from "next/server";
import { autoSaveEndedLessonsAction } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store",
};

const AUTO_SAVE_COOLDOWN_MS = 55_000;

type AutoSaveSweepResult = Awaited<ReturnType<typeof autoSaveEndedLessonsAction>>;
type SweepEntry = {
  inFlight: Promise<AutoSaveSweepResult> | null;
  lastCompletedAt: number;
  lastResult: AutoSaveSweepResult | null;
};

function getSweepMap(): Map<string, SweepEntry> {
  const g = globalThis as unknown as { __autoSaveSweepMap?: Map<string, SweepEntry> };
  if (!g.__autoSaveSweepMap) {
    g.__autoSaveSweepMap = new Map();
  }
  return g.__autoSaveSweepMap;
}

async function runThrottledAutoSave(
  branchId: number | undefined,
  force: boolean
): Promise<AutoSaveSweepResult> {
  const key = branchId ? String(branchId) : "all";
  const map = getSweepMap();
  let entry = map.get(key);
  if (!entry) {
    entry = { inFlight: null, lastCompletedAt: 0, lastResult: null };
    map.set(key, entry);
  }

  const now = Date.now();
  if (!force && entry.inFlight) {
    return entry.inFlight;
  }
  if (!force && entry.lastResult && now - entry.lastCompletedAt < AUTO_SAVE_COOLDOWN_MS) {
    return {
      ...entry.lastResult,
      totalSaved: 0,
      processedLessonIds: [],
      checkedCount: 0,
    };
  }

  const promise = autoSaveEndedLessonsAction(branchId)
    .then((res) => {
      entry!.lastResult = res;
      entry!.lastCompletedAt = Date.now();
      return res;
    })
    .finally(() => {
      entry!.inFlight = null;
    });

  entry.inFlight = promise;
  return promise;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const branchIdParam = searchParams.get("branchId");
    const branchId = branchIdParam ? parseInt(branchIdParam, 10) : undefined;
    const force = searchParams.get("force") === "1";

    const result = await runThrottledAutoSave(
      branchId && !isNaN(branchId) ? branchId : undefined,
      force
    );
    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: true, message: err?.message || "Internal server error" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let branchId: number | undefined;
    let force = false;
    try {
      const body = await req.json();
      if (body?.branchId) {
        const parsed = parseInt(String(body.branchId), 10);
        if (!isNaN(parsed)) branchId = parsed;
      }
      if (body?.force === true) {
        force = true;
      }
    } catch {
      // Body may be empty
    }

    const result = await runThrottledAutoSave(branchId, force);
    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: true, message: err?.message || "Internal server error" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
