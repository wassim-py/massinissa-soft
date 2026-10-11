import { NextRequest, NextResponse } from "next/server";
import {
  startK50HardwareEnrollment,
  cancelK50HardwareEnrollment,
  deleteK50HardwareUser,
  getK50Status,
} from "@/lib/zkK50Manager";
import { getNextGlobalStudentNumber } from "@/lib/actions";
import { deleteStudentFingerprintAction } from "@/lib/biometricActions";

export const dynamic = "force-dynamic";

/**
 * GET /api/biometrics/enroll
 * Polls the live 3-tap fingerprint enrollment progress from the ZKTeco K50 Pro.
 */
export async function GET() {
  try {
    const status = getK50Status();
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to read K50 status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/biometrics/enroll
 * Triggers real hardware enrollment (CMD_USER_WRQ + CMD_STARTENROLL) on the ZKTeco K50 Pro.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let globalNumber = body.globalNumber ? Number(body.globalNumber) : 0;
    const studentId = body.studentId ? String(body.studentId) : null;
    const studentName = body.studentName ? String(body.studentName) : "";
    const fingerIndex = body.fingerIndex !== undefined ? Number(body.fingerIndex) : 0;

    // If enrolling during new student creation (before student is saved), get their upcoming globalNumber
    if (!globalNumber || globalNumber <= 0) {
      globalNumber = await getNextGlobalStudentNumber();
    }

    const res = await startK50HardwareEnrollment({
      globalNumber,
      studentId,
      studentName,
      fingerIndex,
    });

    return NextResponse.json({
      ...res,
      globalNumber,
    });
  } catch (err: any) {
    console.error("POST /api/biometrics/enroll error:", err);
    return NextResponse.json(
      {
        success: false,
        message:
          err?.message ||
          "Erreur lors du lancement de l'enregistrement sur le K50 Pro.",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/biometrics/enroll
 * Cancels an active enrollment session OR deletes a student's fingerprint from K50 Pro + DB.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "cancel";
    const globalNumber = Number(searchParams.get("globalNumber") || 0);
    const studentId = searchParams.get("studentId");

    if (mode === "delete") {
      if (globalNumber > 0) {
        await deleteK50HardwareUser(globalNumber);
      }
      if (studentId) {
        const dbRes = await deleteStudentFingerprintAction(studentId);
        return NextResponse.json(dbRes);
      }
      return NextResponse.json({
        success: true,
        message: "Empreinte supprimée de l'appareil K50 Pro.",
      });
    }

    // Default: cancel active capture on K50 Pro
    await cancelK50HardwareEnrollment();
    return NextResponse.json({
      success: true,
      message: "Enregistrement annulé sur le lecteur K50 Pro.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to cancel enrollment" },
      { status: 500 }
    );
  }
}
