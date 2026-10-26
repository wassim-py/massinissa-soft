/**
 * Massinissa School — 24-Hour Pre-Lesson Background Cron Worker
 *
 * Scans for lessons starting in 23 to 25 hours.
 * Identifies enrolled paying students whose net remaining credits are <= 0.
 * Stages or dispatches the urgent 24-Hour -1 Debt Warning.
 */

import prisma from "../src/lib/prisma";
import { formatWhatsAppMessage, DEFAULT_TEMPLATES } from "../src/lib/whatsappTemplates";
import {
  resolveStudentWhatsAppRecipient,
  getOrCreateWhatsAppConfig,
  verifyCreditIsStillZeroJit,
} from "../src/lib/whatsappUtils";

const BRIDGE_URL = process.env.WHATSAPP_BRIDGE_URL || "http://127.0.0.1:5001";
const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";

export async function run24hPreLessonWorker() {
  console.log(`[WA 24h Worker] Running scan at ${new Date().toISOString()}...`);
  const config = await getOrCreateWhatsAppConfig();

  if (config.mode === "OFF" || !config.enablePreLesson24hTrigger) {
    console.log("[WA 24h Worker] WhatsApp mode is OFF or 24h trigger disabled. Skipping.");
    return;
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Fetch upcoming lessons in the 23-25h window
  const upcomingLessons = await prisma.lesson.findMany({
    where: {
      startsAt: { gte: windowStart, lte: windowEnd },
      isFree: false,
      class: { isFormation: false },
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

  console.log(`[WA 24h Worker] Found ${upcomingLessons.length} upcoming lessons.`);
  let stagedCount = 0;

  for (const lesson of upcomingLessons) {
    const dateStr = lesson.startsAt.toLocaleDateString("ar-DZ", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const startTimeStr = lesson.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    for (const enrollment of lesson.class.enrollments) {
      try {
        const isZero = await verifyCreditIsStillZeroJit(enrollment.studentId, lesson.classId);

        if (isZero) {
          // Check cooldown: No 24h reminder sent in last 48 hours for this class
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
              checkedNumbers: recipient.checkedAudit as any,
              triggeredBy: "CRON_WORKER_24H",
            },
          });

          stagedCount++;

          if (config.mode === "AUTO" && recipient.recipientPhone) {
            try {
              await fetch(`${BRIDGE_URL}/api/send-message`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": BRIDGE_API_KEY,
                },
                body: JSON.stringify({
                  to: recipient.recipientPhone,
                  text: message,
                  notificationId: createdNotif.id,
                }),
              });
            } catch (sendErr) {
              console.error("[WA 24h Worker] Auto send error:", sendErr);
            }
          }
        }
      } catch (err) {
        console.error(`[WA 24h Worker] Error evaluating student ${enrollment.studentId}:`, err);
      }
    }
  }

  console.log(`[WA 24h Worker] Scan complete. Staged ${stagedCount} reminders.`);
}

// Run if called directly
if (require.main === module) {
  run24hPreLessonWorker()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
