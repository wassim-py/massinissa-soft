import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [branches, levels, languages, formationLevels] = await Promise.all([
      prisma.branch.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
      prisma.level.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
      prisma.language.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.formationLevel.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
    ]);

    return NextResponse.json(
      {
        branches,
        levels,
        languages,
        formationLevels,
        timestamp: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("Reference data fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load reference data" },
      { status: 500 }
    );
  }
}
