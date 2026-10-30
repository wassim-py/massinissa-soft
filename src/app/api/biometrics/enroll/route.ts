import { NextRequest, NextResponse } from "next/server";
import {
  startK50HardwareEnrollment,
  cancelK50HardwareEnrollment,
  deleteK50HardwareUser,
  getK50Status,
} from "@/lib/zkK50Manager";
import { getNextGlobalStudentNumber } from "@/lib/actions";
import {
  deleteStudentFingerprintAction,
  enrollStudentFingerprintAction,
} from "@/lib/biometricActions";
import { verifyBiometricApiAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/biometrics/enroll
 * Polls the live 3-tap fingerprint enrollment progress from the ZKTeco K50 Pro.
 */
export async function GET(request: NextRequest) {
  try {
    const authCheck = await verifyBiometricApiAuth(request);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized biometric API access" },
        { status: 401 }
      );
    }
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
 * Triggers real hardware enrollment (CMD_USER_WRQ + CMD_STARTENROLL) on the ZKTeco K50 Pro,
 * or handles cloud-mode helper actions (`next_number`, `save_db`) for the School PC Local Bridge.
 */
export async function POST(request: NextRequest) {
  try {
    const authCheck = await verifyBiometricApiAuth(request);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { success: false, message: "Unauthorized biometric API access" },
        { status: 401 }
      );
    }
    const body = await request.json();
    const mode = body.mode ? String(body.mode) : "hardware";
    let globalNumber = body.globalNumber ? Number(body.globalNumber) : 0;
    const studentId = body.studentId ? String(body.studentId) : null;
    const studentName = body.studentName ? String(body.studentName) : "";
    const fingerIndex = body.fingerIndex !== undefined ? Number(body.fingerIndex) : 0;

    // If enrolling during new student creation (before student is saved), get their upcoming globalNumber
    if (!globalNumber || globalNumber <= 0) {
      globalNumber = await getNextGlobalStudentNumber();
    }

    // Cloud helper 1: Return resolved globalNumber for the School PC Local Bridge
    if (mode === "next_number") {
      return NextResponse.json({
        success: true,
        globalNumber,
      });
    }

    // Cloud helper 2: Persist completed 3-tap enrollment from School PC Local Bridge to PostgreSQL
    if (mode === "save_db") {
      if (studentId && globalNumber > 0) {
        const dbRes = await enrollStudentFingerprintAction({
          studentId,
          globalNumber,
          fingerIndex,
          templateData: body.templateData ? String(body.templateData) : undefined,
        });
        return NextResponse.json({
          ...dbRes,
          globalNumber,
        });
      }
      return NextResponse.json({
        success: true,
        globalNumber,
      });
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
    const authCheck = await verifyBiometricApiAuth(request);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { success: false, message: "Unauthorized biometric API access" },
        { status: 401 }
      );
    }
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "cancel";
    const globalNumber = Number(searchParams.get("globalNumber") || 0);
    const studentId = searchParams.get("studentId");
    const fingerIndexParam = searchParams.get("fingerIndex");
    const fingerIndex =
      fingerIndexParam !== null && fingerIndexParam !== "" && !isNaN(Number(fingerIndexParam))
        ? Number(fingerIndexParam)
        : undefined;

    if (mode === "delete") {
      if (globalNumber > 0) {
        await deleteK50HardwareUser(globalNumber, fingerIndex);
      }
      if (studentId) {
        const dbRes = await deleteStudentFingerprintAction(studentId, fingerIndex);
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
