import prisma from "@/lib/prisma";
import { computeStudentCreditAndSessions } from "@/lib/studentBilling";
import { DEFAULT_TEMPLATES } from "./whatsappTemplates";

/**
 * Normalizes Algerian mobile numbers to WhatsApp JID format (213XXXXXXXXX)
 */
export function normalizeAlgerianPhone(rawInput?: string | null): string | null {
  if (!rawInput) return null;
  let cleaned = rawInput.replace(/[\s\.\-\(\)\+]/g, "").trim();

  if (cleaned.startsWith("00213")) {
    cleaned = cleaned.substring(2);
  }

  if (/^0[567]\d{8}$/.test(cleaned)) {
    cleaned = "213" + cleaned.substring(1);
  }

  if (/^213[567]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Retrieves the global WhatsApp configuration, seeding default templates if missing.
 */
export async function getOrCreateWhatsAppConfig() {
  let config = await prisma.whatsAppConfig.findUnique({
    where: { id: "GLOBAL" },
  });

  if (!config) {
    config = await prisma.whatsAppConfig.create({
      data: {
        id: "GLOBAL",
        mode: "OFF",
        isConnected: false,
        templateAbsenceAr: DEFAULT_TEMPLATES.absenceAr,
        templateAbsenceFr: DEFAULT_TEMPLATES.absenceFr,
        templateAbsenceCorrectedAr: DEFAULT_TEMPLATES.absenceCorrectedAr,
        templateCreditZeroAr: DEFAULT_TEMPLATES.creditZeroAr,
        templateCreditZeroFr: DEFAULT_TEMPLATES.creditZeroFr,
        templatePreLesson24hAr: DEFAULT_TEMPLATES.preLesson24hAr,
        templatePreLesson24hFr: DEFAULT_TEMPLATES.preLesson24hFr,
        templateSpecialLessonNewAr: DEFAULT_TEMPLATES.specialLessonNewAr,
        templateSpecialLessonUpdAr: DEFAULT_TEMPLATES.specialLessonUpdAr,
        templateSpecialLessonCanAr: DEFAULT_TEMPLATES.specialLessonCanAr,
      },
    });
  }

  return config;
}

/**
 * Checks WhatsApp availability with a 14-day database cache layer.
 * Calls the local Baileys bridge daemon if not cached.
 */
export async function checkWhatsAppWithCache(phone: string): Promise<boolean> {
  const normPhone = normalizeAlgerianPhone(phone);
  if (!normPhone) return false;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const cached = await prisma.whatsAppNumberCache.findUnique({
    where: { phone: normPhone },
  });

  if (cached && cached.lastCheckedAt > fourteenDaysAgo) {
    return cached.hasWhatsApp;
  }

  // Query Baileys daemon
  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL || "http://127.0.0.1:5001";
  const apiKey = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";

  let hasWhatsApp = false;
  try {
    const res = await fetch(`${bridgeUrl}/api/check-number`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ phone: normPhone }),
      // Short timeout to avoid blocking if daemon is starting
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const data = await res.json();
      hasWhatsApp = Boolean(data.exists);
    } else {
      // If bridge is offline or hasn't connected yet, default to assuming true if phone format is valid
      hasWhatsApp = true;
    }
  } catch (err) {
    // Fallback: If bridge daemon is offline, accept well-formed Algerian numbers
    hasWhatsApp = true;
  }

  await prisma.whatsAppNumberCache.upsert({
    where: { phone: normPhone },
    update: {
      hasWhatsApp,
      jid: hasWhatsApp ? `${normPhone}@s.whatsapp.net` : null,
      lastCheckedAt: new Date(),
    },
    create: {
      phone: normPhone,
      hasWhatsApp,
      jid: hasWhatsApp ? `${normPhone}@s.whatsapp.net` : null,
      lastCheckedAt: new Date(),
    },
  });

  return hasWhatsApp;
}

export interface ResolvedRecipient {
  recipientPhone: string | null;
  recipientType: "STUDENT_PRIMARY" | "PARENT_PHONE" | "FAMILY_PAYER" | null;
  recipientName: string | null;
  checkedAudit: Array<{ phone: string; type: string; hasWhatsApp: boolean }>;
}

/**
 * Sequential waterfall contact resolution:
 * 1. Student Primary Phone (student.phone)
 * 2. Parent Phone Numbers (parentPhoneNumbers[])
 * 3. Family Payer Student Phone
 */
export async function resolveStudentWhatsAppRecipient(studentId: string): Promise<ResolvedRecipient> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      parentPhoneNumbers: true,
      family: {
        include: {
          payerStudent: {
            include: { parentPhoneNumbers: true },
          },
        },
      },
    },
  });

  if (!student) {
    return {
      recipientPhone: null,
      recipientType: null,
      recipientName: null,
      checkedAudit: [],
    };
  }

  const checkedAudit: Array<{ phone: string; type: string; hasWhatsApp: boolean }> = [];

  // 1. Student Global/Primary Phone
  if (student.phone) {
    const norm = normalizeAlgerianPhone(student.phone);
    if (norm) {
      const hasWA = await checkWhatsAppWithCache(norm);
      checkedAudit.push({ phone: norm, type: "STUDENT_PRIMARY", hasWhatsApp: hasWA });
      if (hasWA) {
        return {
          recipientPhone: norm,
          recipientType: "STUDENT_PRIMARY",
          recipientName: student.name,
          checkedAudit,
        };
      }
    }
  }

  // 2. Parent Phone Numbers
  for (const p of student.parentPhoneNumbers) {
    const norm = normalizeAlgerianPhone(p.phone);
    if (norm) {
      const hasWA = await checkWhatsAppWithCache(norm);
      checkedAudit.push({ phone: norm, type: "PARENT_PHONE", hasWhatsApp: hasWA });
      if (hasWA) {
        return {
          recipientPhone: norm,
          recipientType: "PARENT_PHONE",
          recipientName: `ولي أمر ${student.name}`,
          checkedAudit,
        };
      }
    }
  }

  // 3. Family Payer Fallback
  if (student.family?.payerStudent && student.family.payerStudent.id !== student.id) {
    const payer = student.family.payerStudent;
    if (payer.phone) {
      const norm = normalizeAlgerianPhone(payer.phone);
      if (norm) {
        const hasWA = await checkWhatsAppWithCache(norm);
        checkedAudit.push({ phone: norm, type: "FAMILY_PAYER", hasWhatsApp: hasWA });
        if (hasWA) {
          return {
            recipientPhone: norm,
            recipientType: "FAMILY_PAYER",
            recipientName: `المسؤول العائلي (${payer.name})`,
            checkedAudit,
          };
        }
      }
    }
    // Also check payer's parents
    for (const p of payer.parentPhoneNumbers || []) {
      const norm = normalizeAlgerianPhone(p.phone);
      if (norm) {
        const hasWA = await checkWhatsAppWithCache(norm);
        checkedAudit.push({ phone: norm, type: "FAMILY_PAYER_PARENT", hasWhatsApp: hasWA });
        if (hasWA) {
          return {
            recipientPhone: norm,
            recipientType: "FAMILY_PAYER",
            recipientName: `ولي أمر العائلة (${payer.name})`,
            checkedAudit,
          };
        }
      }
    }
  }

  // 4. No number found on WhatsApp
  return {
    recipientPhone: null,
    recipientType: null,
    recipientName: null,
    checkedAudit,
  };
}

/**
 * Just-In-Time (JIT) Verification of Student Credit Balance.
 * Returns true if student still has 0 or negative credits, false if payment was settled.
 */
export async function verifyCreditIsStillZeroJit(studentId: string, classId?: number | null): Promise<boolean> {
  if (!classId) return true;

  try {
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
        classId,
        status: "ACTIVE",
      },
      include: {
        class: true,
      },
    });

    if (!enrollment || enrollment.payerStatus !== "NORMAL") {
      return false; // Exempt or inactive
    }

    // Live calculation of remaining credits
    const [tuitionVouchers, attendances, catchUps] = await Promise.all([
      prisma.voucher.findMany({
        where: { studentId, classId, isVoided: false, isRefund: false, paymentType: "TUITION" },
        include: { refunds: true },
      }),
      prisma.attendance.findMany({
        where: { studentId, lesson: { classId } },
        select: { lessonId: true, status: true },
      }),
      prisma.catchUpAttendance.findMany({
        where: { studentId },
        select: { missedLessonId: true, catchUpLessonId: true, recordedAt: true },
      }),
    ]);

    const creditResult = computeStudentCreditAndSessions({
      pricePerCycle: Number(enrollment.class.pricePerCycle || 0),
      isFormation: Boolean(enrollment.class.isFormation),
      payerStatus: enrollment.payerStatus,
      tuitionVouchers,
      attendances,
      catchUps,
      creditResetOffset: Number((enrollment as any).creditResetOffset || 0),
    });

    return creditResult.netSessions <= 0;
  } catch (err) {
    console.error("verifyCreditIsStillZeroJit error:", err);
    return true; // Default to allowing reminder if error
  }
}
