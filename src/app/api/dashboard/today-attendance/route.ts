import { NextRequest, NextResponse } from "next/server";
import { getActiveBranchId, getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import { getTodayAttendanceSummary } from "@/lib/dashboardAttendance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    const branchParam = req.nextUrl.searchParams.get("branchId");
    const requestedBranchId =
      branchParam !== null && branchParam !== "" && !Number.isNaN(Number(branchParam))
        ? Number(branchParam)
        : null;

    const targetBranchId = requestedBranchId ?? (await getActiveBranchId());

    if (
      !session.isOwner &&
      !canUserAccessBranch(session.rawRole, session.branchIds, targetBranchId)
    ) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }

    const summary = await getTodayAttendanceSummary(targetBranchId);
    return NextResponse.json(summary, { status: 200, headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[GET /api/dashboard/today-attendance] Failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
