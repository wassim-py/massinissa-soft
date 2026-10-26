/**
 * WhatsApp Trigger Handlers & Conflict Prevention Engine
 * Connects Massinissa School actions (attendance, credits, scheduling) to WhatsApp.
 */

import prisma from "@/lib/prisma";
import {
  getOrCreateWhatsAppConfig,
  resolveStudentWhatsAppRecipient,
} from "./whatsappUtils";
import { formatWhatsAppMessage, DEFAULT_TEMPLATES } from "./whatsappTemplates";

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || "http://127.0.0.1:5001";
const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";

async function dispatchMessageDirect(to: string, text: string, notificationId: string) {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": BRIDGE_API_KEY,
      },
      body: JSON.stringify({ to, text, notificationId }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch (err) {
    console.error("[WA Trigger] Direct dispatch failed:", err);
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
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const startTimeStr = lesson.startsAt.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // 1A. Handle Absences (Generate Notifications)
    for (const studentId of absentStudentIds) {
      // Coalescence check: avoid duplicates for same lesson
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
          checkedNumbers: recipient.checkedAudit as any,
          triggeredBy: adminId,
        },
      });

      // Auto-dispatch if mode is AUTO and recipient exists
      if (config.mode === "AUTO" && recipient.recipientPhone) {
        await dispatchMessageDirect(recipient.recipientPhone, message, createdNotif.id);
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
        // Pending draft deleted - parent never receives alarm
        await prisma.whatsAppNotification.update({
          where: { id: priorAbsence.id },
          data: {
            status: "REVOKED_CORRECTED",
            errorMessage: "Présence confirmée après saisie initiale / تأكيد الحضور بعد تسجيل أولي",
          },
        });
      } else if (priorAbsence.status === "SENT") {
        // Was already sent: stage reassuring correction message
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student || !priorAbsence.recipientPhone) continue;

        const correctionMsg = formatWhatsAppMessage(
          config.templateAbsenceCorrectedAr || DEFAULT_TEMPLATES.absenceCorrectedAr,
          {
            student_name: student.name,
            class_name: lesson.class.name,
          }
        );

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
            triggeredBy: adminId,
          },
        });

        if (config.mode === "AUTO") {
          await dispatchMessageDirect(priorAbsence.recipientPhone, correctionMsg, correctionNotif.id);
        }
      }
    }
  } catch (err) {
    console.error("[WA Trigger] handleAttendanceWhatsAppTrigger error:", err);
  }
}

// =================================================================
// 2. TRIGGER 2: ZERO-CREDIT INSTANT ALERT
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

    // Cooldown check: No credit alert in last 7 days for this class
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
        checkedNumbers: recipient.checkedAudit as any,
        triggeredBy: adminId,
      },
    });

    if (config.mode === "AUTO" && recipient.recipientPhone) {
      await dispatchMessageDirect(recipient.recipientPhone, message, createdNotif.id);
    }
  } catch (err) {
    console.error("[WA Trigger] handleCreditZeroInstantTrigger error:", err);
  }
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

    const allAssociatedClassIds = [
      lesson.classId,
      ...(lesson.lessonGroups?.map((g) => g.classId) || []),
    ];

    // Determine lesson type label
    let lessonType = "حصة خاصة";
    if (lesson.isExtra) lessonType = "حصة إضافية";
    else if (lesson.isCatchUp) lessonType = "حصة استدراكية";
    else if (lesson.isFree) lessonType = "حصة مجانية";

    const dateStr = lesson.startsAt.toLocaleDateString("ar-DZ", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const startTimeStr = lesson.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const endTimeStr = lesson.endsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    // Fetch active enrollments across all associated classes
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
      // Purge pending drafts
      await prisma.whatsAppNotification.deleteMany({
        where: {
          lessonId,
          status: "PENDING_MANUAL",
        },
      });

      // Find students who received an alert previously
      const priorSent = await prisma.whatsAppNotification.findMany({
        where: {
          lessonId,
          status: "SENT",
        },
      });

      for (const sentNotif of priorSent) {
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
            triggeredBy: adminId,
          },
        });

        if (config.mode === "AUTO" && sentNotif.recipientPhone) {
          await dispatchMessageDirect(sentNotif.recipientPhone, cancelMsg, cancelNotif.id);
        }
      }
      return;
    }

    // 3B. SPECIAL LESSON UPDATED / RESCHEDULED
    if (actionType === "UPDATE") {
      const oldDateStr = oldDetails?.startsAt
        ? oldDetails.startsAt.toLocaleDateString("ar-DZ", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : dateStr;
      const oldTimeStr = oldDetails?.startsAt
        ? oldDetails.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : startTimeStr;

      for (const enr of activeEnrollments) {
        // Check prior notification
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

        if (prior && prior.status === "PENDING_MANUAL") {
          // Update draft in place!
          await prisma.whatsAppNotification.update({
            where: { id: prior.id },
            data: {
              messageContent: updateMsg,
              revisionNumber: prior.revisionNumber + 1,
            },
          });
        } else {
          // If already sent or not drafted yet, create update revision confirmation
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
              triggeredBy: adminId,
            },
          });

          if (config.mode === "AUTO" && recipient.recipientPhone) {
            await dispatchMessageDirect(recipient.recipientPhone, updateMsg, updateNotif.id);
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
          checkedNumbers: recipient.checkedAudit as any,
          triggeredBy: adminId,
        },
      });

      if (config.mode === "AUTO" && recipient.recipientPhone) {
        await dispatchMessageDirect(recipient.recipientPhone, newMsg, createdNotif.id);
      }
    }
  } catch (err) {
    console.error("[WA Trigger] handleSpecialLessonWhatsAppTrigger error:", err);
  }
}
