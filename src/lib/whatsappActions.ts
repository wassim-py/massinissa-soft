"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getOrCreateWhatsAppConfig,
  verifyCreditIsStillZeroJit,
  buildStudentPhoneCandidates,
  PhoneCandidate,
} from "./whatsappUtils";
import { WhatsAppMode, WhatsAppTriggerType } from "@prisma/client";

const DIRECT_BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL?.trim() || "";
const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";
const STATE_SETTING_KEY = "WHATSAPP_BRIDGE_STATE";
const CMD_SETTING_KEY = "WHATSAPP_BRIDGE_CMD";

async function readSyncedBridgeState(): Promise<{
  isConnected: boolean;
  phone: string | null;
  name: string | null;
  qr: string | null;
  bridgeOnline: boolean;
}> {
  try {
    const row = await prisma.setting.findUnique({ where: { id: STATE_SETTING_KEY } });
    if (!row?.value) {
      return { isConnected: false, phone: null, name: null, qr: null, bridgeOnline: false };
    }
    const parsed = JSON.parse(row.value);
    const updatedAtMs = parsed.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
    const isFresh = Date.now() - updatedAtMs < 45 * 1000;
    return {
      isConnected: Boolean(parsed.isConnected) && isFresh,
      phone: parsed.phone || null,
      name: parsed.name || null,
      qr: isFresh && !parsed.isConnected ? parsed.qr || null : null,
      bridgeOnline: isFresh,
    };
  } catch {
    return { isConnected: false, phone: null, name: null, qr: null, bridgeOnline: false };
  }
}

/**
 * Retrieves the global WhatsApp configuration and live bridge status.
 * Supports both Cloud-Sync mode (Vercel + standalone wa-bridge) and Direct mode (local/OCI).
 */
export async function getWhatsAppStatusAction() {
  const session = await getAuthSession();
  const [config, syncedState] = await Promise.all([
    getOrCreateWhatsAppConfig(),
    readSyncedBridgeState(),
  ]);

  let liveStatus = { ...syncedState };

  if (DIRECT_BRIDGE_URL) {
    try {
      const res = await fetch(`${DIRECT_BRIDGE_URL}/api/session/status`, {
        headers: { "x-api-key": BRIDGE_API_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json();
        liveStatus = {
          isConnected: Boolean(data.isConnected),
          phone: data.phone || config.connectedPhone,
          name: data.name || config.connectedName,
          qr: data.qr || null,
          bridgeOnline: true,
        };

        if (data.isConnected !== config.isConnected) {
          await prisma.whatsAppConfig.update({
            where: { id: "GLOBAL" },
            data: {
              isConnected: Boolean(data.isConnected),
              connectedPhone: data.phone || null,
              connectedName: data.name || null,
            },
          });
        }
      }
    } catch {
      // Fallback to syncedState from Cloud-Sync
    }
  }

  return {
    isOwner: session.isOwner,
    config,
    liveStatus: session.isOwner ? liveStatus : { ...liveStatus, qr: null },
  };
}

/**
 * Updates WhatsApp configuration, modes, toggles, and templates.
 * STRICTLY OWNER-ONLY.
 */
export async function updateWhatsAppConfigAction(data: {
  mode: WhatsAppMode;
  enableAbsenceTrigger: boolean;
  enableCreditZeroTrigger: boolean;
  enablePreLesson24hTrigger: boolean;
  enableSpecialLessonTrigger: boolean;
  templateAbsenceAr?: string;
  templateAbsenceFr?: string;
  templateAbsenceCorrectedAr?: string;
  templateCreditZeroAr?: string;
  templateCreditZeroFr?: string;
  templatePreLesson24hAr?: string;
  templatePreLesson24hFr?: string;
  templateSpecialLessonNewAr?: string;
  templateSpecialLessonUpdAr?: string;
  templateSpecialLessonCanAr?: string;
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}) {
  const session = await getAuthSession();
  if (!session.isOwner) {
    return {
      success: false,
      message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط.",
    };
  }

  try {
    const updated = await prisma.whatsAppConfig.upsert({
      where: { id: "GLOBAL" },
      update: {
        mode: data.mode,
        enableAbsenceTrigger: data.enableAbsenceTrigger,
        enableCreditZeroTrigger: data.enableCreditZeroTrigger,
        enablePreLesson24hTrigger: data.enablePreLesson24hTrigger,
        enableSpecialLessonTrigger: data.enableSpecialLessonTrigger,
        templateAbsenceAr: data.templateAbsenceAr,
        templateAbsenceFr: data.templateAbsenceFr,
        templateAbsenceCorrectedAr: data.templateAbsenceCorrectedAr,
        templateCreditZeroAr: data.templateCreditZeroAr,
        templateCreditZeroFr: data.templateCreditZeroFr,
        templatePreLesson24hAr: data.templatePreLesson24hAr,
        templatePreLesson24hFr: data.templatePreLesson24hFr,
        templateSpecialLessonNewAr: data.templateSpecialLessonNewAr,
        templateSpecialLessonUpdAr: data.templateSpecialLessonUpdAr,
        templateSpecialLessonCanAr: data.templateSpecialLessonCanAr,
        minIntervalSeconds: data.minIntervalSeconds ?? 4,
        maxIntervalSeconds: data.maxIntervalSeconds ?? 8,
        quietHoursEnabled: data.quietHoursEnabled ?? true,
        quietHoursStart: data.quietHoursStart ?? "22:00",
        quietHoursEnd: data.quietHoursEnd ?? "08:00",
      },
      create: {
        id: "GLOBAL",
        mode: data.mode,
        enableAbsenceTrigger: data.enableAbsenceTrigger,
        enableCreditZeroTrigger: data.enableCreditZeroTrigger,
        enablePreLesson24hTrigger: data.enablePreLesson24hTrigger,
        enableSpecialLessonTrigger: data.enableSpecialLessonTrigger,
      },
    });

    revalidatePath("/admin/configuration");
    revalidatePath("/list/whatsapp-queue");

    return {
      success: true,
      config: updated,
      message: "Configuration WhatsApp mise à jour avec succès / تم تحديث الإعدادات بنجاح.",
    };
  } catch (err: any) {
    console.error("updateWhatsAppConfigAction error:", err);
    return { success: false, message: err?.message || "Erreur de mise à jour" };
  }
}

/**
 * Disconnects the linked WhatsApp mobile device.
 * STRICTLY OWNER-ONLY.
 */
export async function disconnectWhatsAppSessionAction() {
  const session = await getAuthSession();
  if (!session.isOwner) {
    return { success: false, message: "Action réservée au propriétaire" };
  }

  try {
    // Queue remote DISCONNECT command for standalone wa-bridge (executed within ~4s)
    await Promise.all([
      prisma.setting.upsert({
        where: { id: CMD_SETTING_KEY },
        update: { value: "DISCONNECT" },
        create: { id: CMD_SETTING_KEY, value: "DISCONNECT" },
      }),
      prisma.setting
        .upsert({
          where: { id: STATE_SETTING_KEY },
          update: {
            value: JSON.stringify({
              isConnected: false,
              phone: null,
              name: null,
              qr: null,
              updatedAt: new Date().toISOString(),
            }),
          },
          create: {
            id: STATE_SETTING_KEY,
            value: JSON.stringify({
              isConnected: false,
              phone: null,
              name: null,
              qr: null,
              updatedAt: new Date().toISOString(),
            }),
          },
        })
        .catch(() => {}),
      prisma.whatsAppConfig.update({
        where: { id: "GLOBAL" },
        data: {
          isConnected: false,
          connectedPhone: null,
          connectedName: null,
          lastDisconnectedAt: new Date(),
        },
      }),
    ]);

    if (DIRECT_BRIDGE_URL) {
      await fetch(`${DIRECT_BRIDGE_URL}/api/session/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": BRIDGE_API_KEY,
        },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    revalidatePath("/admin/configuration");
    return {
      success: true,
      message:
        "Session WhatsApp déconnectée. Un nouveau QR Code va s'afficher dans quelques secondes.",
    };
  } catch (err: any) {
    return { success: false, message: err?.message || "Erreur lors de la déconnexion" };
  }
}

/**
 * Fetches the branch-scoped WhatsApp outbox queue.
 * Scoped to branch admins' branch, or all branches for Owner.
 */
export async function getBranchWhatsAppQueueAction(params: {
  branchId?: number;
  triggerType?: WhatsAppTriggerType | "ALL";
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const session = await getAuthSession();
  if (!session.userId && !session.rawRole) {
    return { success: false, items: [], total: 0, message: "Non autorisé" };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, params.pageSize || 20);
  const skip = (page - 1) * pageSize;

  let branchFilter: any = {};
  if (params.branchId && params.branchId > 0) {
    if (!session.isOwner && !session.branchIds.includes(params.branchId)) {
      return { success: false, items: [], total: 0, message: "Accès refusé pour ce siège" };
    }
    branchFilter = { branchId: params.branchId };
  } else if (!session.isOwner) {
    branchFilter = { branchId: { in: session.branchIds } };
  }

  const where: any = {
    ...branchFilter,
  };

  if (params.triggerType && params.triggerType !== "ALL") {
    where.triggerType = params.triggerType;
  }

  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }

  if (params.search?.trim()) {
    const term = params.search.trim();
    where.OR = [
      { student: { name: { contains: term, mode: "insensitive" } } },
      { recipientPhone: { contains: term } },
      { messageContent: { contains: term, mode: "insensitive" } },
    ];
  }

  const [items, total, pendingCount] = await Promise.all([
    prisma.whatsAppNotification.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, globalNumber: true, phone: true } },
        class: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        lesson: { select: { id: true, startsAt: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.whatsAppNotification.count({ where }),
    prisma.whatsAppNotification.count({
      where: {
        ...branchFilter,
        status: "PENDING_MANUAL",
      },
    }),
  ]);

  return {
    success: true,
    items,
    total,
    pendingCount,
    page,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Dispatches a single staged notification with JIT conflict protection.
 * Works via Direct Bridge if configured, or queues for instant Cloud-Sync pickup by `wa-bridge`.
 */
export async function sendSingleWhatsAppNotificationAction(notificationId: string) {
  const session = await getAuthSession();
  const notification = await prisma.whatsAppNotification.findUnique({
    where: { id: notificationId },
    include: { student: true, class: true },
  });

  if (!notification) {
    return { success: false, message: "Notification introuvable" };
  }

  if (!session.isOwner && !session.branchIds.includes(notification.branchId)) {
    return { success: false, message: "Accès non autorisé pour ce siège" };
  }

  if (!notification.recipientPhone) {
    return { success: false, message: "Aucun numéro WhatsApp associé" };
  }

  // Conflict Protection 1: JIT Payment check for credit alerts
  if (
    notification.triggerType === "CREDIT_ZERO_INSTANT" ||
    notification.triggerType === "CREDIT_ZERO_PRE_LESSON_24H"
  ) {
    const isStillZero = await verifyCreditIsStillZeroJit(notification.studentId, notification.classId);
    if (!isStillZero) {
      await prisma.whatsAppNotification.update({
        where: { id: notificationId },
        data: {
          status: "REVOKED_PAYMENT",
          errorMessage: "Paiement régularisé avant l'envoi / تم تسوية الاشتراك قبل الإرسال",
        },
      });
      revalidatePath("/list/whatsapp-queue");
      return {
        success: false,
        revoked: true,
        message: "Notification annulée : Le paiement a déjà été effectué par l'élève.",
      };
    }
  }

  // Path A: Direct Bridge configured (local dev / co-located OCI)
  if (DIRECT_BRIDGE_URL) {
    try {
      const ctx = (notification.contextData || {}) as { candidates?: PhoneCandidate[] };
      const candidates =
        Array.isArray(ctx.candidates) && ctx.candidates.length > 0
          ? ctx.candidates
          : (await buildStudentPhoneCandidates(notification.studentId)).candidates;

      const res = await fetch(`${DIRECT_BRIDGE_URL}/api/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": BRIDGE_API_KEY,
        },
        body: JSON.stringify({
          to: notification.recipientPhone,
          text: notification.messageContent,
          notificationId: notification.id,
          candidates,
        }),
        signal: AbortSignal.timeout(8000),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await prisma.whatsAppNotification.update({
          where: { id: notificationId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            approvedBy: session.userId || "BRANCH_ADMIN",
            approvedAt: new Date(),
            ...(data.recipientPhone ? { recipientPhone: data.recipientPhone } : {}),
            ...(data.recipientType ? { recipientType: data.recipientType } : {}),
            ...(data.checkedNumbers ? { checkedNumbers: data.checkedNumbers } : {}),
          },
        });
        revalidatePath("/list/whatsapp-queue");
        return {
          success: true,
          message: "Message WhatsApp envoyé avec succès / تم إرسال الرسالة بنجاح.",
        };
      }

      if (res.ok && data.noWhatsApp) {
        await prisma.whatsAppNotification.update({
          where: { id: notificationId },
          data: {
            status: "FAILED_NO_WHATSAPP",
            recipientPhone: null,
            errorMessage: "Aucun numéro WhatsApp actif",
            ...(data.checkedNumbers ? { checkedNumbers: data.checkedNumbers } : {}),
          },
        });
        revalidatePath("/list/whatsapp-queue");
        return {
          success: false,
          message: "Aucun des numéros enregistrés n'utilise WhatsApp.",
        };
      }
    } catch {
      // Fall through to Cloud-Sync queue if standalone wa-bridge is online
    }
  }

  // Path B: Cloud-Sync Queue (Vercel + standalone wa-bridge on Host PC)
  const bridgeState = await readSyncedBridgeState();
  if (!bridgeState.bridgeOnline) {
    return {
      success: false,
      message:
        "Le pont WhatsApp est hors ligne sur le PC principal. Vérifiez qu'il est démarré / جسر واتساب غير متصل على الحاسوب الرئيسي.",
    };
  }
  if (!bridgeState.isConnected) {
    return {
      success: false,
      message:
        "Aucun téléphone WhatsApp connecté. Le propriétaire doit scanner le QR Code / هاتف المؤسسة غير مرتبط بواتساب.",
    };
  }

  await prisma.whatsAppNotification.update({
    where: { id: notificationId },
    data: {
      status: "QUEUED",
      approvedBy: session.userId || "BRANCH_ADMIN",
      approvedAt: new Date(),
      errorMessage: null,
    },
  });

  revalidatePath("/list/whatsapp-queue");
  return {
    success: true,
    queued: true,
    message:
      "Message mis en file d'envoi (expédition sous quelques secondes) / تم وضع الرسالة قيد الإرسال الفوري.",
  };
}

/**
 * Bulk dispatches all PENDING_MANUAL notifications for a specific branch.
 * Queues atomically so Vercel never times out even on large batches, while
 * `wa-bridge` spaces messages 4-8s apart for Anti-Ban protection.
 */
export async function sendAllPendingBranchAction(branchId: number) {
  const session = await getAuthSession();
  if (!session.isOwner && !session.branchIds.includes(branchId)) {
    return { success: false, message: "Accès non autorisé pour ce siège" };
  }

  const bridgeState = await readSyncedBridgeState();
  if (!DIRECT_BRIDGE_URL) {
    if (!bridgeState.bridgeOnline) {
      return {
        success: false,
        message:
          "Le pont WhatsApp est hors ligne sur le PC principal / جسر واتساب غير متصل على الحاسوب الرئيسي.",
      };
    }
    if (!bridgeState.isConnected) {
      return {
        success: false,
        message:
          "Téléphone WhatsApp non connecté. Scannez d'abord le QR Code / يرجى مسح رمز QR أولاً.",
      };
    }
  }

  const pending = await prisma.whatsAppNotification.findMany({
    where: {
      branchId,
      status: "PENDING_MANUAL",
      recipientPhone: { not: null },
    },
    take: 50,
  });

  if (pending.length === 0) {
    return { success: true, count: 0, message: "Aucune notification en attente." };
  }

  let queuedCount = 0;
  let revokedCount = 0;

  for (const notif of pending) {
    if (
      notif.triggerType === "CREDIT_ZERO_INSTANT" ||
      notif.triggerType === "CREDIT_ZERO_PRE_LESSON_24H"
    ) {
      const isStillZero = await verifyCreditIsStillZeroJit(notif.studentId, notif.classId);
      if (!isStillZero) {
        await prisma.whatsAppNotification.update({
          where: { id: notif.id },
          data: {
            status: "REVOKED_PAYMENT",
            errorMessage: "Paiement régularisé avant l'envoi",
          },
        });
        revokedCount++;
        continue;
      }
    }

    await prisma.whatsAppNotification.update({
      where: { id: notif.id },
      data: {
        status: "QUEUED",
        approvedBy: session.userId || "BRANCH_ADMIN",
        approvedAt: new Date(),
        errorMessage: null,
      },
    });
    queuedCount++;
  }

  revalidatePath("/list/whatsapp-queue");
  return {
    success: true,
    sentCount: queuedCount,
    revokedCount,
    failedCount: 0,
    message: `Envoi lancé : ${queuedCount} message(s) en cours d'expédition automatique (espacés de 4 à 8s), ${revokedCount} annulé(s) car déjà payé(s).`,
  };
}

/**
 * Dismisses/cancels a pending notification.
 */
export async function dismissWhatsAppNotificationAction(notificationId: string) {
  const session = await getAuthSession();
  const notification = await prisma.whatsAppNotification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) return { success: false, message: "Notification introuvable" };
  if (!session.isOwner && !session.branchIds.includes(notification.branchId)) {
    return { success: false, message: "Non autorisé" };
  }

  await prisma.whatsAppNotification.update({
    where: { id: notificationId },
    data: { status: "DISMISSED" },
  });

  revalidatePath("/list/whatsapp-queue");
  return { success: true, message: "Notification ignorée." };
}

/**
 * Updates a pending notification message draft before sending.
 */
export async function updatePendingNotificationMessageAction(
  notificationId: string,
  messageContent: string
) {
  const session = await getAuthSession();
  const notification = await prisma.whatsAppNotification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) return { success: false, message: "Notification introuvable" };
  if (!session.isOwner && !session.branchIds.includes(notification.branchId)) {
    return { success: false, message: "Non autorisé" };
  }

  await prisma.whatsAppNotification.update({
    where: { id: notificationId },
    data: { messageContent },
  });

  revalidatePath("/list/whatsapp-queue");
  return { success: true, message: "Message mis à jour." };
}
