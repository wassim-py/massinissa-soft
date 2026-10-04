import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { mergeStudents } from "@/lib/mergeStudents";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/students/merge
 *
 * Merges a duplicate student into a keeper student.
 * Auth:
 *   1. Clerk session (must be owner or branch_admin)
 *   2. OR Bearer token matching MERGE_API_KEY / CLERK_SECRET_KEY
 *
 * Body:
 *   {
 *     "sourceId": string (optional),
 *     "sourceGlobalNumber": number (optional),
 *     "targetId": string (optional),
 *     "targetGlobalNumber": number (optional),
 *     "preferredName": string (optional)
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    let authorized = false;
    let performedBy = "unknown";

    // 1. Check Bearer token / API key
    const authHeader = req.headers.get("authorization") || "";
    const apiKeyHeader = req.headers.get("x-api-key") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || apiKeyHeader;

    const validKey =
      process.env.MERGE_API_KEY ||
      process.env.CLERK_SECRET_KEY?.slice(-16);

    if (token && validKey && token === validKey) {
      authorized = true;
      performedBy = "api_key_client";
    }

    // 2. Check Clerk Session
    if (!authorized) {
      const session = await getAuthSession();
      if (session.isOwner || session.isBranchAdmin || session.role === "owner" || session.role === "branch_admin") {
        authorized = true;
        performedBy = session.userId || session.role || "admin_user";
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized. Admin session or valid API token required." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      sourceId,
      sourceGlobalNumber,
      targetId,
      targetGlobalNumber,
      preferredName,
    } = body;

    if (!sourceId && sourceGlobalNumber === undefined) {
      return NextResponse.json(
        { error: "Missing source student (sourceId or sourceGlobalNumber is required)." },
        { status: 400 }
      );
    }

    if (!targetId && targetGlobalNumber === undefined) {
      return NextResponse.json(
        { error: "Missing target student (targetId or targetGlobalNumber is required)." },
        { status: 400 }
      );
    }

    const result = await mergeStudents({
      sourceId,
      sourceGlobalNumber: sourceGlobalNumber !== undefined ? Number(sourceGlobalNumber) : undefined,
      targetId,
      targetGlobalNumber: targetGlobalNumber !== undefined ? Number(targetGlobalNumber) : undefined,
      preferredName,
      performedBy,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Student merge error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to merge students" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/students/merge?search=term
 *
 * Search students for merge candidates (mobile autocomplete).
 */
export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search");
    if (!search || search.trim().length === 0) {
      return NextResponse.json({ students: [] });
    }

    const isNum = !isNaN(Number(search));
    if (isNum) {
      const student = await prisma.student.findUnique({
        where: { globalNumber: Number(search) },
        select: {
          id: true,
          globalNumber: true,
          name: true,
          phone: true,
          registeredBranch: { select: { id: true, name: true } },
          _count: {
            select: { vouchers: true, enrollments: true, attendances: true },
          },
        },
      });
      return NextResponse.json({ students: student ? [student] : [] });
    }

    const all = await prisma.student.findMany({
      where: {
        name: { contains: search, mode: "insensitive" },
      },
      select: {
        id: true,
        globalNumber: true,
        name: true,
        phone: true,
        registeredBranch: { select: { id: true, name: true } },
        _count: {
          select: { vouchers: true, enrollments: true, attendances: true },
        },
      },
      take: 10,
    });

    return NextResponse.json({ students: all });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
