import prisma from "@/lib/prisma";
import { computeStudentCreditAndSessions } from "@/lib/studentBilling";
import { DEFAULT_TEMPLATES } from "./whatsappTemplates";

export interface PhoneCandidate {
  phone: string;
  type: "STUDENT_PRIMARY" | "PARENT_PHONE" | "FAMILY_PAYER";
  name: string;
}

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
 * Checks whether the current Algiers wall-clock time falls inside Quiet Hours.
 */
export function isWithinQuietHours(config: {
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}): boolean {
  if (!config.quietHoursEnabled) return false;
  const startStr = config.quietHoursStart || "22:00";
  const endStr = config.quietHoursEnd || "08:00";

  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Algiers",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const nowStr = formatter.format(new Date());
  const [nh, nm] = nowStr.split(":").map(Number);

  const curMins = nh * 60 + nm;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  if (startMins <= endMins) {
    return curMins >= startMins && curMins < endMins;
  }
  // Wraps past midnight (e.g., 22:00 -> 08:00)
  return curMins >= startMins || curMins < endMins;
}

/**
 * Builds the deduplicated waterfall phone list for a student:
 * 1. Student primary phone (student.phone)
 * 2. Parent phone numbers (student.parentPhoneNumbers[])
 * 3. Family payer phone & parents
 */
export async function buildStudentPhoneCandidates(
  studentId: string
): Promise<{ student: any; candidates: PhoneCandidate[] }> {
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
    return { student: null, candidates: [] };
  }

  const seen = new Set<string>();
  const candidates: PhoneCandidate[] = [];

  const pushCandidate = (
    rawPhone: string | null | undefined,
    type: PhoneCandidate["type"],
    name: string
  ) => {
    const norm = normalizeAlgerianPhone(rawPhone);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      candidates.push({ phone: norm, type, name });
    }
  };

  // 1. Student Global/Primary Phone
  pushCandidate(student.phone, "STUDENT_PRIMARY", student.name);

  // 2. Parent Phone Numbers
  for (const p of student.parentPhoneNumbers) {
    pushCandidate(p.phone, "PARENT_PHONE", `ولي أمر ${student.name}`);
  }

  // 3. Family Payer Fallback
  if (student.family?.payerStudent && student.family.payerStudent.id !== student.id) {
    const payer = student.family.payerStudent;
    pushCandidate(payer.phone, "FAMILY_PAYER", `المسؤول العائلي (${payer.name})`);
    for (const p of payer.parentPhoneNumbers || []) {
      pushCandidate(p.phone, "FAMILY_PAYER", `ولي أمر العائلة (${payer.name})`);
    }
  }

  return { student, candidates };
}

export interface ResolvedRecipient {
  recipientPhone: string | null;
  recipientType: "STUDENT_PRIMARY" | "PARENT_PHONE" | "FAMILY_PAYER" | null;
  recipientName: string | null;
  checkedAudit: Array<{ phone: string; type: string; hasWhatsApp: boolean }>;
  candidates: PhoneCandidate[];
}

/**
 * Sequential waterfall contact resolution:
 * 1. Uses 14-day WhatsAppNumberCache in PostgreSQL first.
 * 2. If WHATSAPP_BRIDGE_URL is explicitly configured (direct mode), verifies uncached numbers via bridge.
 * 3. In Cloud-Sync mode (Vercel + standalone wa-bridge), tentatively selects the highest-priority
 *    non-rejected number and passes the full waterfall `candidates` list so `wa-bridge` verifies
 *    availability live via `sock.onWhatsApp()` at dispatch time.
 */
export async function resolveStudentWhatsAppRecipient(studentId: string): Promise<ResolvedRecipient> {
  const { student, candidates } = await buildStudentPhoneCandidates(studentId);

  if (!student || candidates.length === 0) {
    return {
      recipientPhone: null,
      recipientType: null,
      recipientName: null,
      checkedAudit: [],
      candidates: [],
    };
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const cachedRows = await prisma.whatsAppNumberCache.findMany({
    where: {
      phone: { in: candidates.map((c) => c.phone) },
      lastCheckedAt: { gte: fourteenDaysAgo },
    },
  });
  const cacheMap = new Map(cachedRows.map((r) => [r.phone, r.hasWhatsApp]));

  const directBridgeUrl = process.env.WHATSAPP_BRIDGE_URL?.trim();
  const apiKey = process.env.WHATSAPP_BRIDGE_SECRET || "massinissa_secret_key_2026";
  const checkedAudit: Array<{ phone: string; type: string; hasWhatsApp: boolean }> = [];
  const viableCandidates: PhoneCandidate[] = [];

  for (const cand of candidates) {
    if (cacheMap.has(cand.phone)) {
      const hasWA = Boolean(cacheMap.get(cand.phone));
      checkedAudit.push({ phone: cand.phone, type: cand.type, hasWhatsApp: hasWA });
      if (hasWA) {
        viableCandidates.push(cand);
      }
      continue;
    }

    // If direct bridge URL is explicitly configured, try synchronous verification
    if (directBridgeUrl) {
      try {
        const res = await fetch(`${directBridgeUrl}/api/check-number`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ phone: cand.phone }),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data = await res.json();
          const hasWA = Boolean(data.exists);
          checkedAudit.push({ phone: cand.phone, type: cand.type, hasWhatsApp: hasWA });
          await prisma.whatsAppNumberCache.upsert({
            where: { phone: cand.phone },
            update: {
              hasWhatsApp: hasWA,
              jid: hasWA ? `${cand.phone}@s.whatsapp.net` : null,
              lastCheckedAt: new Date(),
            },
            create: {
              phone: cand.phone,
              hasWhatsApp: hasWA,
              jid: hasWA ? `${cand.phone}@s.whatsapp.net` : null,
              lastCheckedAt: new Date(),
            },
          });
          if (hasWA) {
            viableCandidates.push(cand);
            // Since verified live, include any remaining unchecked fallbacks just in case
            const idx = candidates.indexOf(cand);
            for (let j = idx + 1; j < candidates.length; j++) {
              if (cacheMap.get(candidates[j].phone) !== false) {
                viableCandidates.push(candidates[j]);
              }
            }
            break;
          }
          continue;
        }
      } catch {
        // Direct bridge temporarily unreachable; keep candidate for async verification on send
      }
    }

    // Uncached in Cloud-Sync mode: keep in waterfall list for live verification by wa-bridge
    viableCandidates.push(cand);
  }

  if (viableCandidates.length === 0) {
    return {
      recipientPhone: null,
      recipientType: null,
      recipientName: null,
      checkedAudit,
      candidates: [],
    };
  }

  const primary = viableCandidates[0];
  return {
    recipientPhone: primary.phone,
    recipientType: primary.type,
    recipientName: primary.name,
    checkedAudit,
    candidates: viableCandidates,
  };
}

/**
 * Just-In-Time (JIT) Verification of Student Credit Balance.
 * Returns true if student still has 0 or negative credits, false if payment was settled.
 */
export async function verifyCreditIsStillZeroJit(
  studentId: string,
  classId?: number | null
): Promise<boolean> {
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
    return true;
  }
}
