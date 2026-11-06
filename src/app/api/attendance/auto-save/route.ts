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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const branchIdParam = searchParams.get("branchId");
    const branchId = branchIdParam ? parseInt(branchIdParam, 10) : undefined;

    const result = await autoSaveEndedLessonsAction(branchId && !isNaN(branchId) ? branchId : undefined);
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
    try {
      const body = await req.json();
      if (body?.branchId) {
        const parsed = parseInt(String(body.branchId), 10);
        if (!isNaN(parsed)) branchId = parsed;
      }
    } catch {
      // Body may be empty
    }

    const result = await autoSaveEndedLessonsAction(branchId);
    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: true, message: err?.message || "Internal server error" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
