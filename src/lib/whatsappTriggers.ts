/**
 * WhatsApp Trigger Handlers & Conflict Prevention Engine
 * Connects Massinissa School actions (attendance, credits, scheduling) to WhatsApp.
 */

import prisma from "@/lib/prisma";
import {
  getOrCreateWhatsAppConfig,
  resolveStudentWhatsAppRecipient,
  verifyCreditIsStillZeroJit,
  isWithinQuietHours,
  PhoneCandidate,
} from "./whatsappUtils";
import { formatWhatsAppMessage, DEFAULT_TEMPLATES } from "./whatsappTemplates";

const DIRECT_BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL?.trim() || "";
const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";

/**
 * Attempts direct dispatch ONLY if WHATSAPP_BRIDGE_URL is explicitly configured
 * and outside Quiet Hours; otherwise leaves notification as `QUEUED` so the
 * standalone `wa-bridge` daemon pulls and sends it via Cloud-Sync within seconds.
 */
async function tryAutoDispatchOrLeaveQueued(
  notificationId: string,
  to: string,
  text: string,
  candidates: PhoneCandidate[],
  config: { quietHoursEnabled?: boolean; quietHoursStart?: string | null; quietHoursEnd?: string | null }
) {
  if (!DIRECT_BRIDGE_URL || isWithinQuietHours(config)) {
    return false;
  }

  try {
    const res = await fetch(`${DIRECT_BRIDGE_URL}/api/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": BRIDGE_API_KEY,
      },
      body: JSON.stringify({ to, text, notificationId, candidates }),
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) return false;
    const data = await res.json();

    if (data?.success) {
      await prisma.whatsAppNotification.update({
        where: { id: notificationId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          recipientPhone: data.recipientPhone || to,
          ...(data.recipientType ? { recipientType: data.recipientType } : {}),
          ...(data.recipientName ? { recipientName: data.recipientName } : {}),
          ...(data.checkedNumbers ? { checkedNumbers: data.checkedNumbers } : {}),
        },
      });
      return true;
    }

    if (data?.noWhatsApp) {
      await prisma.whatsAppNotification.update({
        where: { id: notificationId },
        data: {
          status: "FAILED_NO_WHATSAPP",
          recipientPhone: null,
          errorMessage: data.error || "Aucun numéro WhatsApp actif",
          ...(data.checkedNumbers ? { checkedNumbers: data.checkedNumbers } : {}),
        },
      });
    }
    return false;
  } catch {
    // Leave as QUEUED so Cloud-Sync picks it up automatically
    return false;
  }
}

// =================================================================
// 1. TRIGGER 1: ABSENCE & ATTENDANCE REVERSAL HANDLER
// =================================================================

export async function handleAttendanceWhatsAppTrigger({
  lessonId,
  absentStudentIds,
  presentStudentIds,
  adminId,
}: {
  lessonId: number;
  absentStudentIds: string[];
  presentStudentIds: string[];
  adminId: string;
}) {
  try {
    const config = await getOrCreateWhatsAppConfig();
    if (config.mode === "OFF" || !config.enableAbsenceTrigger) return;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        class: true,
        teacher: true,
        classroom: true,
        branch: true,
      },
    });

    if (!lesson) return;

    const dateStr = lesson.startsAt.toLocaleDateString("ar-DZ", {
      timeZone: "Africa/Algiers",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const startTimeStr = lesson.startsAt.toLocaleTimeString("fr-FR", {
      timeZone: "Africa/Algiers",
      hour: "2-digit",
      minute: "2-digit",
    });

    // 1A. Handle Absences (Generate Notifications)
    for (const studentId of absentStudentIds) {
      const existing = await prisma.whatsAppNotification.findFirst({
        where: {
          studentId,
          lessonId,
          triggerType: "ABSENCE",
        },
      });

      if (existing) continue;

      const recipient = await resolveStudentWhatsAppRecipient(studentId);
      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (!student) continue;

      const message = formatWhatsAppMessage(config.templateAbsenceAr || DEFAULT_TEMPLATES.absenceAr, {
        student_name: student.name,
        global_number: student.globalNumber,
        class_name: lesson.class.name,
        teacher_name: lesson.teacher.name,
        date: dateStr,
        start_time: startTimeStr,
        branch_name: lesson.branch.name,
      });

      const notifStatus = !recipient.recipientPhone
        ? "FAILED_NO_WHATSAPP"
        : config.mode === "AUTO"
        ? "QUEUED"
        : "PENDING_MANUAL";

      const createdNotif = await prisma.whatsAppNotification.create({
        data: {
          branchId: lesson.branchId,
          studentId,
          lessonId,
          classId: lesson.classId,
          triggerType: "ABSENCE",
          recipientPhone: recipient.recipientPhone,
          recipientType: recipient.recipientType,
          recipientName: recipient.recipientName,
          messageContent: message,
          status: notifStatus,
          contextData: { candidates: recipient.candidates } as any,
          checkedNumbers: recipient.checkedAudit as any,
          triggeredBy: adminId,
        },
      });

      if (config.mode === "AUTO" && recipient.recipientPhone) {
        await tryAutoDispatchOrLeaveQueued(
          createdNotif.id,
          recipient.recipientPhone,
          message,
          recipient.candidates,
          config
        );
      }
    }

    // 1B. Handle Reversals: Students marked PRESENT after previously being marked ABSENT
    for (const studentId of presentStudentIds) {
      const priorAbsence = await prisma.whatsAppNotification.findFirst({
        where: {
          studentId,
          lessonId,
          triggerType: "ABSENCE",
        },
      });

      if (!priorAbsence) continue;

      if (priorAbsence.status === "PENDING_MANUAL" || priorAbsence.status === "QUEUED") {
        await prisma.whatsAppNotification.update({
          where: { id: priorAbsence.id },
          data: {
            status: "REVOKED_CORRECTED",
            errorMessage: "Présence confirmée après saisie initiale / تأكيد الحضور بعد تسجيل أولي",
          },
        });
      } else if (priorAbsence.status === "SENT") {
        const alreadyCorrected = await prisma.whatsAppNotification.findFirst({
          where: { studentId, lessonId, triggerType: "ABSENCE_CORRECTION" },
        });
        if (alreadyCorrected) continue;

        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student || !priorAbsence.recipientPhone) continue;

        const correctionMsg = formatWhatsAppMessage(
          config.templateAbsenceCorrectedAr || DEFAULT_TEMPLATES.absenceCorrectedAr,
          {
            student_name: student.name,
            class_name: lesson.class.name,
          }
        );

        const candidates: PhoneCandidate[] = [
          {
            phone: priorAbsence.recipientPhone,
            type: priorAbsence.recipientType || "STUDENT_PRIMARY",
            name: priorAbsence.recipientName || student.name,
          },
        ];

        const correctionNotif = await prisma.whatsAppNotification.create({
          data: {
            branchId: lesson.branchId,
            studentId,
            lessonId,
            classId: lesson.classId,
            triggerType: "ABSENCE_CORRECTION",
            recipientPhone: priorAbsence.recipientPhone,
            recipientType: priorAbsence.recipientType,
            recipientName: priorAbsence.recipientName,
            messageContent: correctionMsg,
            status: config.mode === "AUTO" ? "QUEUED" : "PENDING_MANUAL",
            contextData: { candidates } as any,
            triggeredBy: adminId,
          },
        });

        if (config.mode === "AUTO") {
          await tryAutoDispatchOrLeaveQueued(
            correctionNotif.id,
            priorAbsence.recipientPhone,
            correctionMsg,
            candidates,
            config
          );
        }
      }
    }
  } catch (err) {
    console.error("[WA Trigger] handleAttendanceWhatsAppTrigger error:", err);
  }
}

// =================================================================
// 2. TRIGGER 2A: ZERO-CREDIT INSTANT ALERT
// =================================================================

export async function handleCreditZeroInstantTrigger({
  studentId,
  classId,
  branchId,
  adminId,
}: {
  studentId: string;
  classId: number;
  branchId: number;
  adminId: string;
}) {
  try {
    const config = await getOrCreateWhatsAppConfig();
    if (config.mode === "OFF" || !config.enableCreditZeroTrigger) return;

    const recent = await prisma.whatsAppNotification.findFirst({
      where: {
        studentId,
        classId,
        triggerType: "CREDIT_ZERO_INSTANT",
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    if (recent) return;

    const [student, classRecord, branch] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);

    if (!student || !classRecord) return;

    const recipient = await resolveStudentWhatsAppRecipient(studentId);
    const message = formatWhatsAppMessage(config.templateCreditZeroAr || DEFAULT_TEMPLATES.creditZeroAr, {
      student_name: student.name,
      global_number: student.globalNumber,
      class_name: classRecord.name,
      branch_name: branch?.name || "",
    });

    const notifStatus = !recipient.recipientPhone
      ? "FAILED_NO_WHATSAPP"
      : config.mode === "AUTO"
      ? "QUEUED"
      : "PENDING_MANUAL";

    const createdNotif = await prisma.whatsAppNotification.create({
      data: {
        branchId,
        studentId,
        classId,
        triggerType: "CREDIT_ZERO_INSTANT",
        recipientPhone: recipient.recipientPhone,
        recipientType: recipient.recipientType,
        recipientName: recipient.recipientName,
        messageContent: message,
        status: notifStatus,
        contextData: { candidates: recipient.candidates } as any,
        checkedNumbers: recipient.checkedAudit as any,
        triggeredBy: adminId,
      },
    });

    if (config.mode === "AUTO" && recipient.recipientPhone) {
      await tryAutoDispatchOrLeaveQueued(
        createdNotif.id,
        recipient.recipientPhone,
        message,
        recipient.candidates,
        config
      );
    }
  } catch (err) {
    console.error("[WA Trigger] handleCreditZeroInstantTrigger error:", err);
  }
}

// =================================================================
// 2B. TRIGGER 2B: 24-HOUR PRE-LESSON (-1 BALANCE) SCANNER
// =================================================================

export async function run24hPreLessonScan(): Promise<{ stagedCount: number; skippedReason?: string }> {
  const config = await getOrCreateWhatsAppConfig();

  if (config.mode === "OFF" || !config.enablePreLesson24hTrigger) {
    return { stagedCount: 0, skippedReason: "Mode OFF or 24h trigger disabled" };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const upcomingLessons = await prisma.lesson.findMany({
    where: {
      startsAt: { gte: windowStart, lte: windowEnd },
      isFree: false,
      OR: [{ recurrenceEndAt: null }, { recurrenceEndAt: { gte: windowEnd } }],
      class: { isFormation: false, isCompleted: false, isPaused: false },
    },
    include: {
      class: {
        include: {
          enrollments: {
            where: { status: "ACTIVE", payerStatus: "NORMAL" },
            include: { student: true },
          },
        },
      },
      branch: true,
      teacher: true,
    },
  });

  let stagedCount = 0;

  for (const lesson of upcomingLessons) {
    const dateStr = lesson.startsAt.toLocaleDateString("ar-DZ", {
      timeZone: "Africa/Algiers",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const startTimeStr = lesson.startsAt.toLocaleTimeString("fr-FR", {
      timeZone: "Africa/Algiers",
      hour: "2-digit",
      minute: "2-digit",
    });

    for (const enrollment of lesson.class.enrollments) {
      try {
        const isZero = await verifyCreditIsStillZeroJit(enrollment.studentId, lesson.classId);
        if (!isZero) continue;

        const recentReminder = await prisma.whatsAppNotification.findFirst({
          where: {
            studentId: enrollment.studentId,
            classId: lesson.classId,
            triggerType: "CREDIT_ZERO_PRE_LESSON_24H",
            createdAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
          },
        });

        if (recentReminder) continue;

        const recipient = await resolveStudentWhatsAppRecipient(enrollment.studentId);
        const message = formatWhatsAppMessage(
          config.templatePreLesson24hAr || DEFAULT_TEMPLATES.preLesson24hAr,
          {
            student_name: enrollment.student.name,
            global_number: enrollment.student.globalNumber,
            class_name: lesson.class.name,
            teacher_name: lesson.teacher.name,
            date: dateStr,
            start_time: startTimeStr,
            branch_name: lesson.branch.name,
          }
        );

        const notifStatus = !recipient.recipientPhone
          ? "FAILED_NO_WHATSAPP"
          : config.mode === "AUTO"
          ? "QUEUED"
          : "PENDING_MANUAL";

        const createdNotif = await prisma.whatsAppNotification.create({
          data: {
            branchId: lesson.branchId,
            studentId: enrollment.studentId,
            lessonId: lesson.id,
            classId: lesson.classId,
            triggerType: "CREDIT_ZERO_PRE_LESSON_24H",
            recipientPhone: recipient.recipientPhone,
            recipientType: recipient.recipientType,
            recipientName: recipient.recipientName,
            messageContent: message,
            status: notifStatus,
            contextData: { candidates: recipient.candidates } as any,
            checkedNumbers: recipient.checkedAudit as any,
            triggeredBy: "CRON_WORKER_24H",
          },
        });

        stagedCount++;

        if (config.mode === "AUTO" && recipient.recipientPhone) {
          await tryAutoDispatchOrLeaveQueued(
            createdNotif.id,
            recipient.recipientPhone,
            message,
            recipient.candidates,
            config
          );
        }
      } catch (err) {
        console.error(`[WA 24h Scan] Error evaluating student ${enrollment.studentId}:`, err);
      }
    }
  }

  return { stagedCount };
}

// =================================================================
// 3. TRIGGER 3: SPECIAL LESSON (CREATION, UPDATE, CANCELLATION)
// =================================================================

export async function handleSpecialLessonWhatsAppTrigger({
  lessonId,
  actionType,
  adminId,
  oldDetails,
}: {
  lessonId: number;
  actionType: "NEW" | "UPDATE" | "CANCEL";
  adminId: string;
  oldDetails?: {
    startsAt: Date;
    endsAt: Date;
    classroomId: number;
  };
}) {
  try {
    const config = await getOrCreateWhatsAppConfig();
    if (config.mode === "OFF" || !config.enableSpecialLessonTrigger) return;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        class: true,
        teacher: true,
        classroom: true,
        branch: true,
        lessonGroups: { select: { classId: true } },
      },
    });

    if (!lesson) return;

    const allAssociatedClassIds = Array.from(
      new Set([lesson.classId, ...(lesson.lessonGroups?.map((g) => g.classId) || [])])
    );

    let lessonType = "حصة خاصة";
    if (lesson.isExtra) lessonType = "حصة إضافية";
    else if (lesson.isCatchUp) lessonType = "حصة استدراكية";
    else if (lesson.isFree) lessonType = "حصة مجانية";

    const dateStr = lesson.startsAt.toLocaleDateString("ar-DZ", {
      timeZone: "Africa/Algiers",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const startTimeStr = lesson.startsAt.toLocaleTimeString("fr-FR", {
      timeZone: "Africa/Algiers",
      hour: "2-digit",
      minute: "2-digit",
    });
    const endTimeStr = lesson.endsAt.toLocaleTimeString("fr-FR", {
      timeZone: "Africa/Algiers",
      hour: "2-digit",
      minute: "2-digit",
    });

    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        classId: { in: allAssociatedClassIds },
        status: "ACTIVE",
      },
      include: {
        student: true,
      },
    });

    // 3A. SPECIAL LESSON CANCELLED
    if (actionType === "CANCEL") {
      await prisma.whatsAppNotification.deleteMany({
        where: {
          lessonId,
          status: { in: ["PENDING_MANUAL", "QUEUED"] },
        },
      });

      const priorSent = await prisma.whatsAppNotification.findMany({
        where: {
          lessonId,
          status: "SENT",
        },
      });

      for (const sentNotif of priorSent) {
        if (!sentNotif.recipientPhone) continue;
        const cancelMsg = formatWhatsAppMessage(
          config.templateSpecialLessonCanAr || DEFAULT_TEMPLATES.specialLessonCanAr,
          {
            student_name: sentNotif.recipientName || "التلميذ",
            class_name: lesson.class.name,
            teacher_name: lesson.teacher.name,
            lesson_type: lessonType,
            date: dateStr,
            start_time: startTimeStr,
          }
        );

        const candidates: PhoneCandidate[] = [
          {
            phone: sentNotif.recipientPhone,
            type: sentNotif.recipientType || "STUDENT_PRIMARY",
            name: sentNotif.recipientName || "",
          },
        ];

        const cancelNotif = await prisma.whatsAppNotification.create({
          data: {
            branchId: lesson.branchId,
            studentId: sentNotif.studentId,
            lessonId,
            classId: lesson.classId,
            triggerType: "SPECIAL_LESSON_CANCELLED",
            recipientPhone: sentNotif.recipientPhone,
            recipientType: sentNotif.recipientType,
            recipientName: sentNotif.recipientName,
            messageContent: cancelMsg,
            status: config.mode === "AUTO" ? "QUEUED" : "PENDING_MANUAL",
            contextData: { candidates } as any,
            triggeredBy: adminId,
          },
        });

        if (config.mode === "AUTO") {
          await tryAutoDispatchOrLeaveQueued(
            cancelNotif.id,
            sentNotif.recipientPhone,
            cancelMsg,
            candidates,
            config
          );
        }
      }
      return;
    }

    // 3B. SPECIAL LESSON UPDATED / RESCHEDULED
    if (actionType === "UPDATE") {
      const oldStarts = oldDetails?.startsAt ? new Date(oldDetails.startsAt) : null;
      const oldDateStr = oldStarts
        ? oldStarts.toLocaleDateString("ar-DZ", {
            timeZone: "Africa/Algiers",
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : dateStr;
      const oldTimeStr = oldStarts
        ? oldStarts.toLocaleTimeString("fr-FR", {
            timeZone: "Africa/Algiers",
            hour: "2-digit",
            minute: "2-digit",
          })
        : startTimeStr;

      for (const enr of activeEnrollments) {
        const prior = await prisma.whatsAppNotification.findFirst({
          where: {
            lessonId,
            studentId: enr.studentId,
          },
          orderBy: { createdAt: "desc" },
        });

        const updateMsg = formatWhatsAppMessage(
          config.templateSpecialLessonUpdAr || DEFAULT_TEMPLATES.specialLessonUpdAr,
          {
            student_name: enr.student.name,
            class_name: lesson.class.name,
            teacher_name: lesson.teacher.name,
            old_date: oldDateStr,
            old_start_time: oldTimeStr,
            new_date: dateStr,
            new_start_time: startTimeStr,
            new_end_time: endTimeStr,
            classroom_name: lesson.classroom.name,
            branch_name: lesson.branch.name,
          }
        );

        if (prior && (prior.status === "PENDING_MANUAL" || prior.status === "QUEUED")) {
          await prisma.whatsAppNotification.update({
            where: { id: prior.id },
            data: {
              messageContent: updateMsg,
              revisionNumber: prior.revisionNumber + 1,
            },
          });
        } else {
          const recipient = await resolveStudentWhatsAppRecipient(enr.studentId);
          const updateNotif = await prisma.whatsAppNotification.create({
            data: {
              branchId: lesson.branchId,
              studentId: enr.studentId,
              lessonId,
              classId: lesson.classId,
              revisionNumber: (prior?.revisionNumber || 1) + 1,
              triggerType: "SPECIAL_LESSON_UPDATE",
              recipientPhone: recipient.recipientPhone,
              recipientType: recipient.recipientType,
              recipientName: recipient.recipientName,
              messageContent: updateMsg,
              status: !recipient.recipientPhone
                ? "FAILED_NO_WHATSAPP"
                : config.mode === "AUTO"
                ? "QUEUED"
                : "PENDING_MANUAL",
              contextData: { candidates: recipient.candidates } as any,
              checkedNumbers: recipient.checkedAudit as any,
              triggeredBy: adminId,
            },
          });

          if (config.mode === "AUTO" && recipient.recipientPhone) {
            await tryAutoDispatchOrLeaveQueued(
              updateNotif.id,
              recipient.recipientPhone,
              updateMsg,
              recipient.candidates,
              config
            );
          }
        }
      }
      return;
    }

    // 3C. NEW SPECIAL LESSON CREATED
    for (const enr of activeEnrollments) {
      const recipient = await resolveStudentWhatsAppRecipient(enr.studentId);
      const newMsg = formatWhatsAppMessage(
        config.templateSpecialLessonNewAr || DEFAULT_TEMPLATES.specialLessonNewAr,
        {
          student_name: enr.student.name,
          global_number: enr.student.globalNumber,
          class_name: lesson.class.name,
          teacher_name: lesson.teacher.name,
          lesson_type: lessonType,
          date: dateStr,
          start_time: startTimeStr,
          end_time: endTimeStr,
          classroom_name: lesson.classroom.name,
          branch_name: lesson.branch.name,
        }
      );

      const notifStatus = !recipient.recipientPhone
        ? "FAILED_NO_WHATSAPP"
        : config.mode === "AUTO"
        ? "QUEUED"
        : "PENDING_MANUAL";

      const createdNotif = await prisma.whatsAppNotification.create({
        data: {
          branchId: lesson.branchId,
          studentId: enr.studentId,
          lessonId,
          classId: lesson.classId,
          triggerType: "SPECIAL_LESSON_NEW",
          recipientPhone: recipient.recipientPhone,
          recipientType: recipient.recipientType,
          recipientName: recipient.recipientName,
          messageContent: newMsg,
          status: notifStatus,
          contextData: { candidates: recipient.candidates } as any,
          checkedNumbers: recipient.checkedAudit as any,
          triggeredBy: adminId,
        },
      });

      if (config.mode === "AUTO" && recipient.recipientPhone) {
        await tryAutoDispatchOrLeaveQueued(
          createdNotif.id,
          recipient.recipientPhone,
          newMsg,
          recipient.candidates,
          config
        );
      }
    }
  } catch (err) {
    console.error("[WA Trigger] handleSpecialLessonWhatsAppTrigger error:", err);
  }
}
