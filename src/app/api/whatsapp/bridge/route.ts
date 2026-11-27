import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getOrCreateWhatsAppConfig,
  isWithinQuietHours,
  verifyCreditIsStillZeroJit,
  buildStudentPhoneCandidates,
  PhoneCandidate,
} from "@/lib/whatsappUtils";
import { WhatsAppNotificationStatus, WhatsAppRecipientType } from "@prisma/client";

const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";
const STATE_SETTING_KEY = "WHATSAPP_BRIDGE_STATE";
const CMD_SETTING_KEY = "WHATSAPP_BRIDGE_CMD";

function isAuthorized(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key") || "";
  return Boolean(key && key === BRIDGE_API_KEY);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body?.action;

    // ---------------------------------------------------------------
    // 1. SYNC STATUS + PULL QUEUED JOBS (Outbound Poll from wa-bridge)
    // ---------------------------------------------------------------
    if (action === "sync-status") {
      const isConnected = Boolean(body.isConnected);
      const phone = body.phone ? String(body.phone) : null;
      const name = body.name ? String(body.name) : null;
      const qr = !isConnected && body.qr ? String(body.qr) : null;
      const pullJobs = Boolean(body.pullJobs);

      const [config, cmdSetting] = await Promise.all([
        getOrCreateWhatsAppConfig(),
        prisma.setting.findUnique({ where: { id: CMD_SETTING_KEY } }),
      ]);

      // Persist live heartbeat + QR in Setting so Owner UI on Vercel sees it instantly
      const statePayload = JSON.stringify({
        isConnected,
        phone,
        name,
        qr,
        updatedAt: new Date().toISOString(),
      });

      await prisma.setting.upsert({
        where: { id: STATE_SETTING_KEY },
        update: { value: statePayload },
        create: { id: STATE_SETTING_KEY, value: statePayload },
      });

      if (
        config.isConnected !== isConnected ||
        (isConnected && phone && config.connectedPhone !== phone)
      ) {
        await prisma.whatsAppConfig.update({
          where: { id: "GLOBAL" },
          data: {
            isConnected,
            connectedPhone: isConnected ? phone : null,
            connectedName: isConnected ? name : null,
            ...(isConnected
              ? { lastConnectedAt: new Date() }
              : { lastDisconnectedAt: new Date() }),
          },
        });
      }

      // Deliver pending remote command (e.g., DISCONNECT requested by Owner)
      if (cmdSetting?.value) {
        await prisma.setting.delete({ where: { id: CMD_SETTING_KEY } }).catch(() => {});
        return NextResponse.json({
          success: true,
          command: cmdSetting.value,
          jobs: [],
        });
      }

      if (!isConnected || !pullJobs || config.mode === "OFF") {
        return NextResponse.json({ success: true, command: null, jobs: [] });
      }

      // Recover stale SENDING notifications (>5 minutes old) if host PC rebooted mid-send
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      await Promise.all([
        prisma.whatsAppNotification.updateMany({
          where: { status: "SENDING", updatedAt: { lt: fiveMinsAgo }, attemptCount: { lt: 3 } },
          data: { status: "QUEUED" },
        }),
        prisma.whatsAppNotification.updateMany({
          where: { status: "SENDING", updatedAt: { lt: fiveMinsAgo }, attemptCount: { gte: 3 } },
          data: { status: "FAILED_ERROR", errorMessage: "Délai d'expédition dépassé" },
        }),
      ]);

      // During Quiet Hours, hold automatic jobs until morning, but still send manual admin clicks
      const inQuietHours = isWithinQuietHours(config);
      const candidatesQueue = await prisma.whatsAppNotification.findMany({
        where: {
          status: "QUEUED",
          ...(inQuietHours ? { approvedBy: { not: null } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      });

      const jobs: Array<{
        id: string;
        text: string;
        recipientPhone: string | null;
        recipientType: string | null;
        recipientName: string | null;
        candidates: PhoneCandidate[];
        minIntervalSeconds: number;
        maxIntervalSeconds: number;
      }> = [];

      for (const notif of candidatesQueue) {
        // Conflict Protection: Live JIT payment check right before handing to bridge
        if (
          notif.triggerType === "CREDIT_ZERO_INSTANT" ||
          notif.triggerType === "CREDIT_ZERO_PRE_LESSON_24H"
        ) {
          const stillZero = await verifyCreditIsStillZeroJit(notif.studentId, notif.classId);
          if (!stillZero) {
            await prisma.whatsAppNotification.update({
              where: { id: notif.id },
              data: {
                status: "REVOKED_PAYMENT",
                errorMessage: "Paiement régularisé avant l'envoi / تم تسوية الاشتراك قبل الإرسال",
              },
            });
            continue;
          }
        }

        // Atomic lock so concurrent polls never claim the same notification
        const claimed = await prisma.whatsAppNotification.updateMany({
          where: { id: notif.id, status: "QUEUED" },
          data: { status: "SENDING", attemptCount: { increment: 1 } },
        });
        if (claimed.count === 0) continue;

        const ctx = (notif.contextData || {}) as { candidates?: PhoneCandidate[] };
        let phoneCandidates: PhoneCandidate[] = Array.isArray(ctx.candidates)
          ? ctx.candidates
          : [];

        if (phoneCandidates.length === 0) {
          const built = await buildStudentPhoneCandidates(notif.studentId);
          phoneCandidates = built.candidates;
        }

        jobs.push({
          id: notif.id,
          text: notif.messageContent,
          recipientPhone: notif.recipientPhone,
          recipientType: notif.recipientType,
          recipientName: notif.recipientName,
          candidates: phoneCandidates,
          minIntervalSeconds: config.minIntervalSeconds || 4,
          maxIntervalSeconds: config.maxIntervalSeconds || 8,
        });
      }

      return NextResponse.json({
        success: true,
        command: null,
        jobs,
      });
    }

    // ---------------------------------------------------------------
    // 2. REPORT SEND RESULT + CACHE VERIFIED WHATSAPP NUMBERS
    // ---------------------------------------------------------------
    if (action === "report-result") {
      const notificationId = String(body.notificationId || "");
      const status = body.status as WhatsAppNotificationStatus;
      const checkedNumbers = Array.isArray(body.checkedNumbers) ? body.checkedNumbers : [];

      // Cache every checked phone number's WhatsApp availability for 14 days
      for (const entry of checkedNumbers) {
        if (!entry?.phone) continue;
        const phone = String(entry.phone);
        const hasWhatsApp = Boolean(entry.hasWhatsApp);
        await prisma.whatsAppNumberCache
          .upsert({
            where: { phone },
            update: {
              hasWhatsApp,
              jid: hasWhatsApp ? `${phone}@s.whatsapp.net` : null,
              lastCheckedAt: new Date(),
            },
            create: {
              phone,
              hasWhatsApp,
              jid: hasWhatsApp ? `${phone}@s.whatsapp.net` : null,
              lastCheckedAt: new Date(),
            },
          })
          .catch(() => {});
      }

      if (notificationId && status) {
        const validRecipientTypes = ["STUDENT_PRIMARY", "PARENT_PHONE", "FAMILY_PAYER"];
        const recType = validRecipientTypes.includes(body.recipientType)
          ? (body.recipientType as WhatsAppRecipientType)
          : undefined;

        await prisma.whatsAppNotification.update({
          where: { id: notificationId },
          data: {
            status,
            ...(status === "SENT" ? { sentAt: new Date(), errorMessage: null } : {}),
            ...(status === "FAILED_NO_WHATSAPP" ? { recipientPhone: null } : {}),
            ...(body.recipientPhone ? { recipientPhone: String(body.recipientPhone) } : {}),
            ...(recType ? { recipientType: recType } : {}),
            ...(body.recipientName ? { recipientName: String(body.recipientName) } : {}),
            ...(checkedNumbers.length > 0 ? { checkedNumbers } : {}),
            ...(body.errorMessage ? { errorMessage: String(body.errorMessage) } : {}),
          },
        });
      }

      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // 3. INCOMING PARENT REPLY -> ATTENDANCE JUSTIFICATION SYNC
    // ---------------------------------------------------------------
    if (action === "incoming-reply") {
      const fromPhone = String(body.fromPhone || "").replace(/\D/g, "");
      const text = String(body.text || "").trim().slice(0, 300);

      if (fromPhone.length >= 8 && text) {
        const recentNotif = await prisma.whatsAppNotification.findFirst({
          where: {
            recipientPhone: { contains: fromPhone.slice(-9) },
            triggerType: "ABSENCE",
            status: "SENT",
            createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: "desc" },
        });

        if (recentNotif?.lessonId) {
          const att = await prisma.attendance.findUnique({
            where: {
              studentId_lessonId: {
                studentId: recentNotif.studentId,
                lessonId: recentNotif.lessonId,
              },
            },
          });

          if (att && att.status === "ABSENT" && !att.justification) {
            await prisma.attendance.update({
              where: { id: att.id },
              data: {
                justification: `[WhatsApp]: ${text}`,
              },
            });
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[API /api/whatsapp/bridge] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
