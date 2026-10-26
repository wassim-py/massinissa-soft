"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getOrCreateWhatsAppConfig,
  resolveStudentWhatsAppRecipient,
  verifyCreditIsStillZeroJit,
} from "./whatsappUtils";
import { WhatsAppMode, WhatsAppTriggerType } from "@prisma/client";

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || "http://127.0.0.1:5001";
const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";

/**
 * Retrieves the global WhatsApp configuration and live bridge status.
 * Strictly OWNER-ONLY for full control, read-only status for admins.
 */
export async function getWhatsAppStatusAction() {
  const session = await getAuthSession();
  const config = await getOrCreateWhatsAppConfig();

  let liveStatus = {
    isConnected: config.isConnected,
    phone: config.connectedPhone,
    name: config.connectedName,
    qr: null as string | null,
    bridgeOnline: false,
  };

  try {
    const res = await fetch(`${BRIDGE_URL}/api/session/status`, {
      headers: { "x-api-key": BRIDGE_API_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
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
            isConnected: data.isConnected,
            connectedPhone: data.phone,
            connectedName: data.name,
          },
        });
      }
    }
  } catch (err) {
    // Bridge offline
    liveStatus.bridgeOnline = false;
  }

  return {
    isOwner: session.isOwner,
    config,
    liveStatus,
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
    const res = await fetch(`${BRIDGE_URL}/api/session/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": BRIDGE_API_KEY,
      },
    });

    await prisma.whatsAppConfig.update({
      where: { id: "GLOBAL" },
      data: {
        isConnected: false,
        connectedPhone: null,
        connectedName: null,
        lastDisconnectedAt: new Date(),
      },
    });

    revalidatePath("/admin/configuration");
    return { success: true, message: "Session WhatsApp déconnectée avec succès" };
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
      return {
        success: false,
        revoked: true,
        message: "Notification annulée : Le paiement a déjà été effectué par l'élève.",
      };
    }
  }

  // Dispatch via Bridge
  try {
    const res = await fetch(`${BRIDGE_URL}/api/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": BRIDGE_API_KEY,
      },
      body: JSON.stringify({
        to: notification.recipientPhone,
        text: notification.messageContent,
        notificationId: notification.id,
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
        },
      });

      revalidatePath("/list/whatsapp-queue");
      return { success: true, message: "Message WhatsApp envoyé avec succès / تم إرسال الرسالة بنجاح." };
    } else {
      await prisma.whatsAppNotification.update({
        where: { id: notificationId },
        data: {
          status: "FAILED_ERROR",
          errorMessage: data.error || "Erreur de passerelle",
          attemptCount: { increment: 1 },
        },
      });
      return { success: false, message: data.error || "Échec de l'envoi" };
    }
  } catch (err: any) {
    await prisma.whatsAppNotification.update({
      where: { id: notificationId },
      data: {
        status: "FAILED_ERROR",
        errorMessage: err?.message || "Passerelle WhatsApp indisponible",
        attemptCount: { increment: 1 },
      },
    });
    return { success: false, message: "Passerelle WhatsApp inaccessible. Vérifiez la connexion du mobile." };
  }
}

/**
 * Bulk dispatches all PENDING_MANUAL notifications for a specific branch.
 */
export async function sendAllPendingBranchAction(branchId: number) {
  const session = await getAuthSession();
  if (!session.isOwner && !session.branchIds.includes(branchId)) {
    return { success: false, message: "Accès non autorisé pour ce siège" };
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

  let sentCount = 0;
  let revokedCount = 0;
  let failedCount = 0;

  for (const notif of pending) {
    // Conflict Protection: JIT Check
    if (notif.triggerType === "CREDIT_ZERO_INSTANT" || notif.triggerType === "CREDIT_ZERO_PRE_LESSON_24H") {
      const isStillZero = await verifyCreditIsStillZeroJit(notif.studentId, notif.classId);
      if (!isStillZero) {
        await prisma.whatsAppNotification.update({
          where: { id: notif.id },
          data: { status: "REVOKED_PAYMENT" },
        });
        revokedCount++;
        continue;
      }
    }

    try {
      const res = await fetch(`${BRIDGE_URL}/api/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": BRIDGE_API_KEY,
        },
        body: JSON.stringify({
          to: notif.recipientPhone,
          text: notif.messageContent,
          notificationId: notif.id,
        }),
      });

      if (res.ok) {
        sentCount++;
      } else {
        failedCount++;
      }
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/list/whatsapp-queue");
  return {
    success: true,
    sentCount,
    revokedCount,
    failedCount,
    message: `Envoi groupé terminé : ${sentCount} envoyés, ${revokedCount} annulés (paiement réglé), ${failedCount} échoués.`,
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
