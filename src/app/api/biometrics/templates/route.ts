import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/biometrics/templates
 * Returns all registered student fingerprints so every branch's K50 device
 * stays synced with all students' globalNumber and biometric templates.
 */
export async function GET() {
  try {
    const [fingerprints, tombstones] = await Promise.all([
      prisma.studentFingerprint.findMany({
        include: {
          student: {
            select: {
              id: true,
              name: true,
              globalNumber: true,
            },
          },
        },
        orderBy: { globalNumber: "asc" },
      }),
      prisma.biometricHardwareTombstone.findMany({
        select: {
          globalNumber: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      templates: fingerprints.map((f) => ({
        id: f.id,
        studentId: f.studentId,
        globalNumber: f.globalNumber,
        studentName: f.student.name,
        fingerIndex: f.fingerIndex,
        templateData: f.templateData,
        updatedAt: f.updatedAt.toISOString(),
      })),
      deletedGlobalNumbers: tombstones.map((t) => t.globalNumber),
    });
  } catch (err: any) {
    console.error("GET /api/biometrics/templates error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/biometrics/templates
 * Called by the local K50 bridge when a student's fingerprint is enrolled/updated on the hardware.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const globalNumber = Number(body.globalNumber);
    const fingerIndex = body.fingerIndex !== undefined ? Number(body.fingerIndex) : 0;

    if (!globalNumber || isNaN(globalNumber)) {
      return NextResponse.json(
        { success: false, error: "Invalid globalNumber" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { globalNumber },
    });

    if (!student) {
      return NextResponse.json(
        { success: false, error: `Student with globalNumber #${globalNumber} not found` },
        { status: 404 }
      );
    }

    const record = await prisma.studentFingerprint.upsert({
      where: {
        studentId_fingerIndex: {
          studentId: student.id,
          fingerIndex,
        },
      },
      create: {
        studentId: student.id,
        globalNumber,
        fingerIndex,
        templateData: body.templateData || `ZK_K50_UID_${globalNumber}_F_${fingerIndex}`,
        enrolledBranchId: body.branchId ? Number(body.branchId) : null,
        isSyncedAllBranches: true,
      },
      update: {
        globalNumber,
        templateData: body.templateData || `ZK_K50_UID_${globalNumber}_F_${fingerIndex}`,
        enrolledBranchId: body.branchId ? Number(body.branchId) : null,
        isSyncedAllBranches: true,
      },
    });

    return NextResponse.json({
      success: true,
      studentName: student.name,
      fingerprint: {
        id: record.id,
        globalNumber: record.globalNumber,
        fingerIndex: record.fingerIndex,
        updatedAt: record.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    console.error("POST /api/biometrics/templates error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to save template" },
      { status: 500 }
    );
  }
}
