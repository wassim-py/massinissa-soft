import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  processBiometricScan,
  getBiometricLiveFeedAction,
} from "@/lib/biometricActions";
import { ensureK50Connected } from "@/lib/zkK50Manager";

export const dynamic = "force-dynamic";

/**
 * GET /api/biometrics/scan?branchId=1&sinceId=0
 * Used by the Admin PC background monitor to poll new scans and pinned alerts with minimal overhead.
 * Also keeps the direct TCP connection to the ZKTeco K50 Pro (192.168.50.201:4370) alive.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId");
    const sinceIdParam = searchParams.get("sinceId");
    const openLessonIdParam = searchParams.get("openLessonId");

    const result = await getBiometricLiveFeedAction({
      branchId: branchIdParam ? Number(branchIdParam) : undefined,
      sinceId: sinceIdParam ? Number(sinceIdParam) : undefined,
    });

    // Only attempt direct server-to-K50 TCP socket when running locally (not on Vercel/Cloud)
    const isCloudServer = Boolean(process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER);
    const k50 = isCloudServer
      ? {
          connected: false,
          deviceIp: process.env.ZK_DEVICE_IP || "192.168.50.201",
          devicePort: Number(process.env.ZK_DEVICE_PORT || 4370),
        }
      : ensureK50Connected(
          result.branchId || (branchIdParam ? Number(branchIdParam) : undefined),
          openLessonIdParam ? Number(openLessonIdParam) : null
        );

    return NextResponse.json({
      ...result,
      hardwareConnected: k50.connected,
      deviceIp: k50.deviceIp,
      devicePort: k50.devicePort,
    });
  } catch (err: any) {
    console.error("GET /api/biometrics/scan error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/biometrics/scan
 * Receives real-time fingerprint scan events from the ZKTeco K50/ID PRO Local Bridge on the School PC.
 * Body:
 * {
 *   globalNumber?: number | null,
 *   branchId?: number,
 *   openLessonId?: number | null,
 *   deviceId?: number,
 *   deviceIp?: string,
 *   serialNumber?: string,
 *   scanTime?: string,
 *   isUnrecognizedFinger?: boolean,
 *   heartbeatOnly?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let deviceId = body.deviceId ? Number(body.deviceId) : null;
    const branchId = body.branchId ? Number(body.branchId) : 1;

    // Auto-register or update heartbeat of the K50 device if deviceIp or serialNumber is sent by the bridge
    if (!deviceId && (body.deviceIp || body.serialNumber)) {
      const existingDevice = await prisma.biometricDevice.findFirst({
        where: {
          branchId,
          ...(body.serialNumber
            ? { serialNumber: String(body.serialNumber) }
            : { ipAddress: String(body.deviceIp) }),
        },
      });

      if (existingDevice) {
        deviceId = existingDevice.id;
        await prisma.biometricDevice.update({
          where: { id: existingDevice.id },
          data: {
            lastSeenAt: new Date(),
            ipAddress: body.deviceIp ? String(body.deviceIp) : existingDevice.ipAddress,
          },
        });
      } else {
        const created = await prisma.biometricDevice.create({
          data: {
            name: body.deviceName || `ZKTeco K50 Pro (Branch #${branchId})`,
            branchId,
            ipAddress: body.deviceIp ? String(body.deviceIp) : "192.168.50.201",
            port: body.devicePort ? Number(body.devicePort) : 4370,
            serialNumber: body.serialNumber ? String(body.serialNumber) : null,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });
        deviceId = created.id;
      }
    }

    if (body.heartbeatOnly) {
      return NextResponse.json({
        success: true,
        deviceId,
        branchId,
      });
    }

    const result = await processBiometricScan({
      globalNumber:
        body.globalNumber !== undefined && body.globalNumber !== null
          ? Number(body.globalNumber)
          : null,
      branchId,
      deviceId,
      scanTime: body.scanTime || undefined,
      isUnrecognizedFinger: Boolean(body.isUnrecognizedFinger),
      openLessonId: body.openLessonId ? Number(body.openLessonId) : null,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("POST /api/biometrics/scan error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to process scan" },
      { status: 500 }
    );
  }
}
