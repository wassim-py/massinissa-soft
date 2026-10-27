"use server";

import {
  handleAttendanceWhatsAppTrigger,
  handleCreditZeroInstantTrigger,
  handleSpecialLessonWhatsAppTrigger,
} from "./whatsappTriggers";
import { verifyCreditIsStillZeroJit } from "./whatsappUtils";


import { revalidatePath } from "next/cache";
import { revalidateFinancialRoutes } from "@/lib/revalidation";

const safeRevalidatePath = (path: string) => {
  try {
    revalidatePath(path);
    revalidatePath(`/[locale]${path}`, "page");
    revalidatePath(`/ar${path}`);
    revalidatePath(`/fr${path}`);
    revalidatePath("/", "layout");
  } catch {
    // Ignore outside Next.js request contexts (e.g., CLI / test scripts)
  }
};
import {
  ClassSchema,
  StudentSchema,
  SubjectSchema,
  TeacherSchema,
  ParentSchema,
  LessonSchema,
  AnnouncementSchema,
  PaymentSchema,
  VoucherSchema,
  VoucherEditSchema,
  VoucherSeriesSchema,
  FamilySchema,
  EnrollmentTransferSchema,
  WorkshopSchema,
  RegisterParticipantSchema,
  WorkshopPaymentSchema,
  RefundSchema,
} from "./formValidationSchemas";
import prisma from "./prisma";
import { Prisma } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import * as ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { getAuthSession, getActiveBranchId } from "./auth";
import { canUserAccessBranch } from "./settings";
import { upsertDailyLedger, resolveLedgerType, normalizeDateToStartOfDay } from "./ledger";
import { getDailyRevenueDashboardData } from "./revenue";
import { getTranslations } from "next-intl/server";
import { classifyStudentAttendanceHistory, computeStudentConsumedSessions, computeStudentConsecutiveAbsences, computeStudentCreditAndSessions, resolvePayerCredit } from "./studentBilling";
import { getFixedInscriptionFeeAction, getFormationInscriptionFeeAction, getActiveTrimester } from "./configurationActions";
import { splitFullName, getLessonDateTime, getAlgiersDateInfo, getAlgiersWeekBounds, serializeForClient } from "./utils";
import {
  resolveOrCreateLessonForDate,
  findSiblingRecurringLessonIds,
  syncSiblingRecurringLessons,
} from "./lessonInstances";
import {
  cleanPhoneNumber,
  normalizeStudentName,
  tokenizeStudentName,
  evaluateDuplicateMatch,
  DuplicateStudentCandidate,
  DuplicateMatchType,
} from "./studentDeduplication";

export { normalizeStudentName };
export type { DuplicateStudentCandidate, DuplicateMatchType };

type CurrentState = { success: boolean; error: boolean; message?: string };

export const setBranchAction = async (branchId: number) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط حساب المالك يمكنه التبديل بين الفروع." };
    }
    const cookieStore = await cookies();
    cookieStore.set("x-branch-id", branchId.toString(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return { success: true, error: false, message: "تم تغيير الفرع بنجاح." };
  } catch (err) {
    console.error("setBranchAction error:", err);
    return { success: false, error: true, message: "فشل في تغيير الفرع." };
  }
};

export const setUserLocaleAction = async (locale: string) => {
  try {
    if (locale !== "fr" && locale !== "ar") {
      return { success: false, error: true, message: "Langue non valide / لغة غير صالحة" };
    }
    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 365 * 24 * 60 * 60, // 1 year persistence
      sameSite: "lax",
    });

    try {
      const { auth: clerkAuth } = await import("./auth");
      const { userId } = await clerkAuth({ treatPendingAsSignedOut: false });
      if (userId) {
        // 1. Update database UserProfile if exists
        try {
          await prisma.userProfile.updateMany({
            where: { id: userId },
            data: { localePreference: locale },
          });
        } catch {
          // UserProfile record might not exist for this user id
        }

        // 2. Synchronize to Clerk user publicMetadata if configured
        const clerkSecret = process.env.CLERK_SECRET_KEY;
        if (clerkSecret) {
          try {
            const { createClerkClient } = await import("@clerk/nextjs/server");
            const client = createClerkClient({ secretKey: clerkSecret });
            const user = await client.users.getUser(userId);
            await client.users.updateUser(userId, {
              publicMetadata: {
                ...(user.publicMetadata || {}),
                localePreference: locale,
              },
            });
          } catch {
            // Ignore Clerk sync error
          }
        }
      }
    } catch {
      // Ignore auth error in unauthenticated context
    }

    return { success: true, error: false };
  } catch (err) {
    console.error("setUserLocaleAction error:", err);
    return { success: false, error: true };
  }
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =================================================================
// SUBJECT ACTIONS (OWNER-ONLY per Phase 3 access model)
// =================================================================

export const createSubject = async (
  currentState: CurrentState,
  data: SubjectSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يمكنه إنشاء مادة جديدة." };
    }

    const res = await prisma.$queryRaw<Array<{ id: number }>>`
      INSERT INTO "Language" (name) VALUES (${data.name})
      RETURNING id
    `;
    const newId = res[0]?.id;

    if (newId && data.teachers && data.teachers.length > 0) {
      await prisma.setting.upsert({
        where: { id: `subject_teachers_${newId}` },
        create: {
          id: `subject_teachers_${newId}`,
          value: JSON.stringify(data.teachers),
        },
        update: {
          value: JSON.stringify(data.teachers),
        },
      });
    }

    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم انشاء المادة بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "فشل في انشاء المادة." };
  }
};

export const updateSubject = async (
  currentState: CurrentState,
  data: SubjectSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يمكنه تعديل المادة." };
    }

    if (!data.id) return { success: false, error: true, message: "لا يوجد معرف للمادة." };
    await prisma.$executeRaw`
      UPDATE "Language" SET name = ${data.name} WHERE id = ${data.id}
    `;

    if (data.teachers) {
      await prisma.setting.upsert({
        where: { id: `subject_teachers_${data.id}` },
        create: {
          id: `subject_teachers_${data.id}`,
          value: JSON.stringify(data.teachers),
        },
        update: {
          value: JSON.stringify(data.teachers),
        },
      });
    }

    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم تحديث المادة بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "فشل في تحديث المادة." };
  }
};

export const deleteSubject = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يمكنه حذف المادة." };
    }

    const numId = parseInt(id, 10);
    if (!isNaN(numId)) {
      await prisma.$executeRaw`DELETE FROM "FormationLevel" WHERE "languageId" = ${numId}`;
      await prisma.$executeRaw`DELETE FROM "Language" WHERE id = ${numId}`;
      await prisma.setting.deleteMany({
        where: { id: `subject_teachers_${numId}` },
      });
    }

    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم حذف المادة بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "فشل في حذف المادة." };
  }
};

// =================================================================
// CLASS ACTIONS (OWNER-ONLY per Phase 3 access model)
// =================================================================

export const createClass = async (
  currentState: CurrentState,
  data: ClassSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح لك بإنشاء فوج جديد." };
    }

    const activeBranchId = await getActiveBranchId();
    const branchId = data.branchId && Number(data.branchId) > 0
      ? Number(data.branchId)
      : (data as any).branchId && Number((data as any).branchId) > 0
      ? Number((data as any).branchId)
      : activeBranchId;

    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بإنشاء فوج في هذا الفرع." };
    }

    const pricePerCycle = data.price || 0;
    const teacherId = (data as any).teacherId || data.supervisorId || null;
    const levelId = data.gradeId ? Number(data.gradeId) : null;

    const bookCount = teacherId && levelId
      ? await prisma.book.count({
          where: { teacherId, levelId },
        })
      : 0;
    const hasBooks = Boolean(data.hasBooks) || bookCount > 0;
    const bookFee = hasBooks && data.bookFee != null && data.bookFee > 0 ? data.bookFee : null;
    const defaultInscFee = await getFixedInscriptionFeeAction();

    await prisma.$executeRaw`
      INSERT INTO "Class" (name, "branchId", "pricePerCycle", "inscriptionFee", "hasBooks", "bookFee", "isFormation", "teacherId", "levelId")
      VALUES (${data.name}, ${branchId}, ${pricePerCycle}, ${defaultInscFee}, ${hasBooks}, ${bookFee}, false, ${teacherId}, ${levelId})
    `;

    safeRevalidatePath("/list/classes");
    return { success: true, error: false, message: "Groupe créé avec succès / تم إنشاء الفوج بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de création du groupe / فشل في إنشاء الفوج." };
  }
};

export const updateClass = async (
  currentState: CurrentState,
  data: ClassSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح لك بتعديل الفوج." };
    }

    if (!data.id) return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للفوج." };

    const existing = await prisma.$queryRaw<Array<{ branchId: number; teacherId: string | null; levelId: number | null; hasBooks: boolean; bookFee: any }>>`
      SELECT "branchId", "teacherId", "levelId", "hasBooks", "bookFee" FROM "Class" WHERE id = ${data.id} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود." };
    }
    if (!canUserAccessBranch(session.rawRole, session.branchIds, existing[0].branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بتعديل فوج في هذا الفرع." };
    }

    const branchId = data.branchId && Number(data.branchId) > 0
      ? Number(data.branchId)
      : (data as any).branchId && Number((data as any).branchId) > 0
      ? Number((data as any).branchId)
      : existing[0].branchId || 1;
    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بنقل الفوج إلى هذا الفرع." };
    }

    const pricePerCycle = data.price || 0;
    const teacherId = (data as any).teacherId !== undefined
      ? (data as any).teacherId
      : data.supervisorId !== undefined
      ? data.supervisorId
      : existing[0].teacherId;
    const levelId = data.gradeId !== undefined
      ? (data.gradeId ? Number(data.gradeId) : null)
      : existing[0].levelId;

    const bookCount = teacherId && levelId
      ? await prisma.book.count({
          where: { teacherId, levelId },
        })
      : 0;
    const hasBooks = data.hasBooks !== undefined ? Boolean(data.hasBooks) : (Boolean(existing[0].hasBooks) || bookCount > 0);
    const bookFee = hasBooks
      ? (data.bookFee !== undefined ? (data.bookFee != null && data.bookFee > 0 ? data.bookFee : null) : (existing[0].bookFee != null ? Number(existing[0].bookFee) : null))
      : null;

    await prisma.$executeRaw`
      UPDATE "Class"
      SET name = ${data.name}, "branchId" = ${branchId}, "pricePerCycle" = ${pricePerCycle}, "teacherId" = ${teacherId}, "levelId" = ${levelId}, "hasBooks" = ${hasBooks}, "bookFee" = ${bookFee}
      WHERE id = ${data.id}
    `;

    safeRevalidatePath("/list/classes");
    safeRevalidatePath(`/list/classes/${data.id}`);
    return { success: true, error: false, message: "Groupe mis à jour avec succès / تم تحديث الفوج بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de mise à jour du groupe / فشل في تحديث الفوج." };
  }
};

export const deleteClass = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح لك بحذف الفوج." };
    }

    const classId = parseInt(id, 10);
    if (isNaN(classId)) {
      return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للفوج." };
    }

    const existing = await prisma.$queryRaw<Array<{ branchId: number }>>`
      SELECT "branchId" FROM "Class" WHERE id = ${classId} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود." };
    }
    if (!canUserAccessBranch(session.rawRole, session.branchIds, existing[0].branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بحذف فوج في هذا الفرع." };
    }

    await prisma.$executeRaw`DELETE FROM "Enrollment" WHERE "classId" = ${classId}`;
    await prisma.$executeRaw`DELETE FROM "Lesson" WHERE "classId" = ${classId}`;
    await prisma.$executeRaw`DELETE FROM "Class" WHERE id = ${classId}`;

    safeRevalidatePath("/list/classes");
    return { success: true, error: false, message: "Groupe supprimé avec succès / تم حذف الفوج بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de suppression du groupe / فشل في حذف الفوج." };
  }
};

// =================================================================
// TEACHER ACTIONS
// =================================================================

export const createTeacher = async (
  currentState: CurrentState,
  data: TeacherSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / إنشاء أستاذ جديد متاح للمالك فقط." };
    }

    const id = crypto.randomUUID();
    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const phone = data.phone ? data.phone.trim() : null;
    const gender = data.gender || data.sex || null;

    await prisma.teacher.create({
      data: {
        id,
        name: fullName,
        phone,
        gender,
        photocopyRatePerPage: new Prisma.Decimal(3.5),
        TeacherBranch: {
          create: { branchId: 1 }
        }
      }
    });

    if (data.subjects && data.subjects.length > 0) {
      for (const subId of data.subjects) {
        const key = `subject_teachers_${subId}`;
        const existing = await prisma.setting.findUnique({ where: { id: key } });
        let list: string[] = [];
        if (existing) {
          try {
            const parsed = JSON.parse(existing.value);
            if (Array.isArray(parsed)) list = parsed;
          } catch {}
        }
        if (!list.includes(id)) {
          list.push(id);
          await prisma.setting.upsert({
            where: { id: key },
            create: { id: key, value: JSON.stringify(list) },
            update: { value: JSON.stringify(list) },
          });
        }
      }
    }

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "Enseignant créé avec succès / تم إنشاء الأستاذ بنجاح." };
  } catch (err: any) {
    console.error("Error in createTeacher:", err);
    return { success: false, error: true, message: err?.message || "Échec de création de l'enseignant / فشل في إنشاء الأستاذ." };
  }
};

export const updateTeacher = async (
  currentState: CurrentState,
  data: TeacherSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للأستاذ." };
  }
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / تعديل الأستاذ متاح للمالك فقط." };
    }

    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const updateData: any = { name: fullName };
    if (data.phone !== undefined) {
      updateData.phone = data.phone ? data.phone.trim() : null;
    }
    if (data.gender !== undefined || data.sex !== undefined) {
      updateData.gender = data.gender || data.sex || null;
    }

    await prisma.teacher.update({
      where: { id: data.id },
      data: updateData,
    });

    if (data.subjects !== undefined) {
      const allSettings = await prisma.setting.findMany({
        where: { id: { startsWith: "subject_teachers_" } },
      });
      const processedSubIds = new Set<number>();
      for (const s of allSettings) {
        const subId = parseInt(s.id.replace("subject_teachers_", ""), 10);
        if (!isNaN(subId)) {
          processedSubIds.add(subId);
          try {
            let list: string[] = JSON.parse(s.value);
            if (!Array.isArray(list)) list = [];
            const shouldHave = data.subjects.includes(subId);
            const has = list.includes(data.id);
            if (shouldHave && !has) {
              list.push(data.id);
              await prisma.setting.update({ where: { id: s.id }, data: { value: JSON.stringify(list) } });
            } else if (!shouldHave && has) {
              list = list.filter((tid) => tid !== data.id);
              await prisma.setting.update({ where: { id: s.id }, data: { value: JSON.stringify(list) } });
            }
          } catch {}
        }
      }

      for (const subId of data.subjects) {
        if (!processedSubIds.has(subId)) {
          const key = `subject_teachers_${subId}`;
          await prisma.setting.upsert({
            where: { id: key },
            create: { id: key, value: JSON.stringify([data.id]) },
            update: { value: JSON.stringify([data.id]) },
          });
        }
      }
    }

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${data.id}`);
    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "Enseignant mis à jour avec succès / تم تحديث بيانات الأستاذ بنجاح." };
  } catch (err: any) {
    console.error("Error in updateTeacher:", err);
    return { success: false, error: true, message: err?.message || "Échec de mise à jour de l'enseignant / فشل في تحديث بيانات الأستاذ." };
  }
};

export const deleteTeacher = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للأستاذ." };
  }

  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / حذف الأستاذ متاح للمالك فقط." };
    }

    await prisma.class.updateMany({
      where: { teacherId: id },
      data: { teacherId: null },
    });
    await prisma.$executeRaw`DELETE FROM "TeacherBranch" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "TeacherPayRate" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "PhotocopyCharge" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "BookReceipt" WHERE "bookId" IN (SELECT id FROM "Book" WHERE "teacherId" = ${id})`;
    await prisma.bookDrop.deleteMany({
      where: { book: { teacherId: id } },
    });
    await prisma.book.deleteMany({
      where: { teacherId: id },
    });
    await prisma.$executeRaw`DELETE FROM "Attendance" WHERE "lessonId" IN (SELECT id FROM "Lesson" WHERE "teacherId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "Lesson" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Teacher" WHERE id = ${id}`;

    safeRevalidatePath("/list/teachers");
    return { success: true, error: false, message: "Enseignant supprimé avec succès / تم حذف الأستاذ بنجاح." };
  } catch (err: any) {
    console.error(err);
    return { success: false, error: true, message: err?.message || "Échec de suppression de l'enseignant / فشل في حذف الأستاذ." };
  }
};

// =================================================================
// STUDENT ACTIONS
// =================================================================

/**
 * Docs/architecture.md §2.10: Permanent, school-wide student ID number with slot reuse.
 *
 * - Every student gets a sequential ID number (1, 2, 3...), unique across ALL 3 branches combined.
 * - When a student is deleted, their number becomes available again.
 * - The next newly-registered student receives the lowest available deleted number in the sequence,
 *   not simply the next highest number ever used.
 * - Deleting a student does NOT renumber anyone else's ID.
 */
export async function getNextGlobalStudentNumber(tx?: any): Promise<number> {
  const client = tx || prisma;
  const result = await client.$queryRaw<Array<{ nextNumber: number | string | bigint }>>`
    SELECT s.num AS "nextNumber"
    FROM generate_series(1, (SELECT COALESCE(MAX("globalNumber"), 0) + 1 FROM "Student")) s(num)
    LEFT JOIN "Student" ON "Student"."globalNumber" = s.num
    WHERE "Student"."globalNumber" IS NULL
    ORDER BY s.num ASC
    LIMIT 1;
  `;

  if (result.length > 0 && result[0].nextNumber !== undefined && result[0].nextNumber !== null) {
    return Number(result[0].nextNumber);
  }

  return 1;
}

export const createStudent = async (
  currentState: CurrentState,
  data: StudentSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const branchId = (data as any).registeredBranchId || activeBranchId;

    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé à inscrire un élève dans cette succursale / غير مصرح لك بتسجيل تلميذ في هذا الفرع." };
    }

    if (!data.bypassDuplicateCheck) {
      const dupCheck = await checkStudentDuplicateAction({
        name: data.name,
        surname: data.surname,
        phone: data.phone,
        parentPhoneNumbers: data.parentPhoneNumbers,
        birthday: data.birthday ? new Date(data.birthday).toISOString().split("T")[0] : null,
      });
      if (dupCheck.hasDuplicate && dupCheck.isExact) {
        return {
          success: false,
          error: true,
          duplicateDetected: true,
          duplicates: dupCheck.duplicates,
          message:
            "Un élève portant exactement ce nom existe déjà / يوجد تلميذ مسجل بنفس الاسم مسبقاً. يرجى تأكيد الإنشاء.",
        };
      }
    }

    const id = crypto.randomUUID();
    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const phone = data.phone?.trim() || null;
    const globalNumber = await getNextGlobalStudentNumber(prisma);
    const birthday = data.birthday ? new Date(data.birthday) : null;
    const address = data.address?.trim() || null;
    const sex = data.sex || "MALE";

    const familyId = (data as any).familyId ? Number((data as any).familyId) : null;

    await prisma.$executeRaw`
      INSERT INTO "Student" (id, "globalNumber", name, phone, "registeredBranchId", birthday, address, sex, "familyId", "createdAt")
      VALUES (${id}, ${globalNumber}, ${fullName}, ${phone}, ${branchId}, ${birthday}, ${address}, ${sex}, ${familyId}, NOW())
    `;

    // Handle optional repeatable parent phone numbers (§7.2)
    if (data.parentPhoneNumbers && Array.isArray(data.parentPhoneNumbers)) {
      const validNumbers = data.parentPhoneNumbers
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0);

      for (const phoneNum of validNumbers) {
        await prisma.$executeRaw`
          INSERT INTO "ParentPhoneNumber" ("studentId", phone)
          VALUES (${id}, ${phoneNum})
        `;
      }
    }

    // Connect student to enrollments if classes selected
    if (data.classes && data.classes.length > 0) {
      const years = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "AcademicYear" ORDER BY "startDate" DESC LIMIT 1
      `;
      const yearId = years.length > 0 ? years[0].id : 1;

      for (const classId of data.classes) {
        await prisma.$executeRaw`
          INSERT INTO "Enrollment" ("studentId", "classId", "academicYearId", "inscriptionFeeCharged", status, "enrolledAt")
          VALUES (${id}, ${Number(classId)}, ${yearId}, true, 'ACTIVE', NOW())
        `;
      }
    }

    let familyData: any = null;
    if (familyId) {
      familyData = await prisma.family.findUnique({
        where: { id: familyId },
        select: { id: true, name: true, payerStudentId: true, discountPercentage: true },
      });
    }

    try {
      safeRevalidatePath("/list/students");
      safeRevalidatePath("/list/attendance");
      safeRevalidatePath("/list/parents");
      safeRevalidatePath("/list/formations");
      if (data.classes && data.classes.length > 0) {
        for (const classId of data.classes) {
          safeRevalidatePath(`/list/attendance/class/${classId}`);
          safeRevalidatePath(`/list/formations/${classId}`);
        }
      }
    } catch {
      // Intentionally tolerated outside Next.js request context
    }
    return {
      success: true,
      error: false,
      message: "Élève créé avec succès / تم انشاء التلميذ بنجاح.",
      student: {
        id,
        globalNumber,
        name: fullName,
        phone,
        registeredBranchId: branchId,
        familyId,
        family: familyData,
      },
    };
  } catch (err: any) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la création de l'élève / فشل في انشاء التلميذ." };
  }
};

export const updateStudent = async (
  currentState: CurrentState,
  data: StudentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant d'élève manquant / لا يوجد معرف للتلميذ." };
  }
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin && !session.can("update", "students")) {
      return { success: false, error: true, message: "Non autorisé à modifier cet élève / غير مصرح لك بتعديل بيانات هذا التلميذ." };
    }

    const existing = await prisma.$queryRaw<Array<{ registeredBranchId: number }>>`
      SELECT "registeredBranchId" FROM "Student" WHERE id = ${data.id} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود." };
    }

    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const phone = data.phone?.trim() || null;
    const branchId = (data as any).registeredBranchId || existing[0].registeredBranchId;
    const birthday = data.birthday ? new Date(data.birthday) : null;
    const address = data.address?.trim() || null;
    const sex = data.sex || "MALE";

    await prisma.$executeRaw`
      UPDATE "Student"
      SET name = ${fullName}, phone = ${phone}, "registeredBranchId" = ${branchId}, birthday = ${birthday}, address = ${address}, sex = ${sex}
      WHERE id = ${data.id}
    `;

    // Handle updating parent phone numbers (§7.2)
    if (data.parentPhoneNumbers !== undefined) {
      await prisma.$executeRaw`
        DELETE FROM "ParentPhoneNumber" WHERE "studentId" = ${data.id}
      `;

      if (Array.isArray(data.parentPhoneNumbers)) {
        const validNumbers = data.parentPhoneNumbers
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter((p) => p.length > 0);

        for (const phoneNum of validNumbers) {
          await prisma.$executeRaw`
            INSERT INTO "ParentPhoneNumber" ("studentId", phone)
            VALUES (${data.id}, ${phoneNum})
          `;
        }
      }
    }

    // Handle enrollments synchronization for selected classes
    if (data.classes !== undefined) {
      const selectedClassIds = (data.classes || [])
        .map((cid) => Number(cid))
        .filter((cid) => !isNaN(cid));

      const years = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "AcademicYear" ORDER BY "startDate" DESC LIMIT 1
      `;
      const yearId = years.length > 0 ? years[0].id : 1;

      const currentEnrollments = await prisma.enrollment.findMany({
        where: { studentId: data.id },
        include: {
          transfersFrom: true,
          transfersTo: true,
        },
      });

      // 1. Un-enroll or delete classes not selected
      for (const enr of currentEnrollments) {
        if (!selectedClassIds.includes(enr.classId)) {
          if (enr.transfersFrom.length > 0 || enr.transfersTo.length > 0) {
            if (enr.status !== "UNENROLLED" && enr.status !== "TRANSFERRED") {
              await prisma.enrollment.update({
                where: { id: enr.id },
                data: { status: "UNENROLLED" },
              });
            }
          } else {
            await prisma.enrollment.delete({
              where: { id: enr.id },
            });
          }
          try {
            safeRevalidatePath(`/list/attendance/class/${enr.classId}`);
            safeRevalidatePath(`/list/payments/class/${enr.classId}`);
          } catch {}
        }
      }

      // 2. Reactivate or insert selected classes
      const { paidClassIds: paidInscClassIds } = await getStudentPaidInscriptionGroups(prisma, data.id);
      const shouldChargeNewInsc = paidInscClassIds.size < 3;

      for (const classId of selectedClassIds) {
        const clsInfo = await prisma.class.findUnique({
          where: { id: classId },
          select: { isFormation: true, inscriptionFee: true },
        });
        const isFormation = Boolean(clsInfo?.isFormation);
        const shouldCharge = isFormation ? true : (shouldChargeNewInsc || paidInscClassIds.has(classId));
        const defaultFee = isFormation
          ? await getFormationInscriptionFeeAction()
          : await getFixedInscriptionFeeAction();
        const effectiveFee =
          Number(clsInfo?.inscriptionFee || 0) > 0
            ? clsInfo?.inscriptionFee
            : new Prisma.Decimal(defaultFee);

        const existingEnr = currentEnrollments.find((e) => e.classId === classId);
        if (!existingEnr) {
          await prisma.enrollment.create({
            data: {
              studentId: data.id,
              classId,
              academicYearId: yearId,
              inscriptionFeeCharged: shouldCharge,
              inscriptionFeeAmount: shouldCharge ? effectiveFee : null,
              status: "ACTIVE",
            },
          });
        } else if (existingEnr.status !== "ACTIVE") {
          await prisma.enrollment.update({
            where: { id: existingEnr.id },
            data: {
              status: "ACTIVE",
              ...(existingEnr.status === "REFUNDED"
                ? {
                    inscriptionFeeCharged: shouldCharge,
                    inscriptionFeeAmount: shouldCharge ? effectiveFee : null,
                  }
                : !isFormation && paidInscClassIds.size >= 3 && !paidInscClassIds.has(classId)
                ? { inscriptionFeeCharged: false, inscriptionFeeAmount: null }
                : {}),
            },
          });
        }
        try {
          safeRevalidatePath(`/list/attendance/class/${classId}`);
          safeRevalidatePath(`/list/payments/class/${classId}`);
        } catch {}
      }
    }

    // Handle family assignment
    const rawFamilyId = (data as any).familyId;
    if (rawFamilyId !== undefined) {
      const newFamilyId =
        rawFamilyId && rawFamilyId !== "" && !isNaN(Number(rawFamilyId))
          ? Number(rawFamilyId)
          : null;

      const currentStudent = await prisma.student.findUnique({
        where: { id: data.id },
        select: { familyId: true, payerOfFamily: { select: { id: true } } },
      });

      if (currentStudent?.payerOfFamily && currentStudent.familyId !== newFamilyId) {
        // Reassign to remaining sibling in the old family if any (Decision #4)
        const remainingInOldFam = await prisma.student.findFirst({
          where: { familyId: currentStudent.familyId, id: { not: data.id } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        await prisma.family.update({
          where: { id: currentStudent.payerOfFamily.id },
          data: { payerStudentId: remainingInOldFam?.id || null },
        });
      }

      await prisma.$executeRaw`
        UPDATE "Student"
        SET "familyId" = ${newFamilyId}
        WHERE id = ${data.id}
      `;
    }

    try {
      safeRevalidatePath("/list/students");
      safeRevalidatePath(`/list/students/${data.id}`);
      safeRevalidatePath("/list/parents");
    } catch {
      // Intentionally tolerated outside Next.js request context
    }
    return { success: true, error: false, message: "Élève mis à jour avec succès / تم تحديث التلميذ بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la mise à jour de l'élève / فشل في تحديث التلميذ." };
  }
};

const getPublicIdFromUrl = (url: string): string | null => {
  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1 || uploadIndex + 2 >= parts.length) {
      return null;
    }
    const publicIdWithExtension = parts.slice(uploadIndex + 2).join('/');
    return publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));
  } catch (e) {
    console.error("Could not parse public_id from URL:", e);
    return null;
  }
};

export const deleteStudent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }

  try {
    const session = await getAuthSession();
    if (!session.isOwner || !session.can("delete", "students")) {
      return { success: false, error: true, message: "Action réservée au propriétaire / حذف التلميذ متاح للمالك فقط." };
    }
    const existing = await prisma.$queryRaw<
      Array<{ registeredBranchId: number; globalNumber: number }>
    >`
      SELECT "registeredBranchId", "globalNumber" FROM "Student" WHERE id = ${id} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود." };
    }
    const deletedGlobalNumber = Number(existing[0].globalNumber || 0);

    // Clean up all referencing foreign keys safely (including Biometric tables & K50 Pro hardware)
    await prisma.$executeRaw`DELETE FROM "StudentFingerprint" WHERE "studentId" = ${id} OR "globalNumber" = ${deletedGlobalNumber}`;
    await prisma.$executeRaw`DELETE FROM "BiometricScanLog" WHERE "studentId" = ${id} OR "globalNumber" = ${deletedGlobalNumber}`;
    await prisma.$executeRaw`DELETE FROM "ParentPhoneNumber" WHERE "studentId" = ${id}`;

    // Reassign primary payer role to remaining sibling in the family if any (Decision #4)
    const payerFamily = await prisma.family.findUnique({
      where: { payerStudentId: id },
      include: {
        students: {
          where: { id: { not: id } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        },
      },
    });
    if (payerFamily) {
      const nextPayer = payerFamily.students[0]?.id || null;
      await prisma.family.update({
        where: { id: payerFamily.id },
        data: { payerStudentId: nextPayer },
      });
    } else {
      await prisma.$executeRaw`UPDATE "Family" SET "payerStudentId" = NULL WHERE "payerStudentId" = ${id}`;
    }

    await prisma.$executeRaw`DELETE FROM "BookReceipt" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "BookCopyDistribution" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "LevelTest" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "WorkshopAttendance" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "WorkshopParticipant" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "EnrollmentTransfer" WHERE "fromEnrollmentId" IN (SELECT id FROM "Enrollment" WHERE "studentId" = ${id}) OR "toEnrollmentId" IN (SELECT id FROM "Enrollment" WHERE "studentId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "Enrollment" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Attendance" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Refund" WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE "studentId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "VoucherEdit" WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE "studentId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "Voucher" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Student" WHERE id = ${id}`;

    // Also delete the student's user & fingerprint template from the physical ZKTeco K50 Pro hardware
    if (deletedGlobalNumber > 0) {
      try {
        const { deleteK50HardwareUser } = await import("./zkK50Manager");
        await deleteK50HardwareUser(deletedGlobalNumber);
      } catch {
        // Non-blocking if K50 Pro is offline at the moment of deletion
      }
    }

    // IMPORTANT: Deleting a student does NOT renumber anyone else's ID (§2.10).
    // The freed slot will be reused by getNextGlobalStudentNumber on the next registration.

    safeRevalidatePath("/list/students");
    return { success: true, error: false, message: "Élève supprimé avec succès / تم حذف التلميذ بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de suppression de l'élève / فشل في حذف التلميذ." };
  }
};

// =================================================================
// PARENT ACTIONS
// =================================================================

export const createParent = async (
  currentState: CurrentState,
  data: ParentSchema
) => {
  try {
    const studentIds = (data.students || []).filter(Boolean);
    const payerStudentId =
      data.payerStudentId && studentIds.includes(data.payerStudentId)
        ? data.payerStudentId
        : studentIds.length > 0
        ? studentIds[0]
        : null;

    const discountPct =
      data.discountPercentage != null && !isNaN(Number(data.discountPercentage))
        ? Math.min(100, Math.max(0, Number(data.discountPercentage)))
        : 50;

    let familyName: string | null = (data.name || "").trim() || null;
    if (!familyName && studentIds.length > 0) {
      const student = await prisma.student.findUnique({
        where: { id: payerStudentId || studentIds[0] },
        select: { name: true },
      });
      if (student) {
        const { surname } = splitFullName(student.name);
        familyName = surname || student.name;
      }
    }
    if (!familyName) {
      familyName = [data.surname, data.name].filter(Boolean).join(" ").trim() || null;
    }

    if (payerStudentId) {
      const existingPayer = await prisma.family.findUnique({
        where: { payerStudentId },
        select: { id: true, name: true },
      });
      if (existingPayer) {
        return {
          success: false,
          error: true,
          message: `Cet élève est déjà le payeur principal de la famille "${existingPayer.name || `#${existingPayer.id}`}". / هذا التلميذ هو بالفعل الدافع الرئيسي لعائلة أخرى.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      const newFam = await tx.family.create({
        data: {
          name: familyName,
          payerStudentId,
          discountPercentage: discountPct,
        },
      });

      if (studentIds.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: studentIds } },
          data: { familyId: newFam.id },
        });
      }
    });

    safeRevalidatePath("/list/parents");
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath("/list/attendance");
    return { success: true, error: false, message: "Famille créée avec succès / تم انشاء العائلة بنجاح." };
  } catch (err: any) {
    console.error("createParent error:", err);
    return { success: false, error: true, message: "Échec de la création de la famille / فشل في انشاء العائلة." };
  }
};

export const updateParent = async (
  currentState: CurrentState,
  data: ParentSchema
) => {
  try {
    const familyId = data.id ? parseInt(String(data.id), 10) : NaN;
    if (isNaN(familyId)) {
      return { success: false, error: true, message: "Identifiant de la famille manquant / معرف العائلة مفقود." };
    }

    const studentIds = (data.students || []).filter(Boolean);
    const payerStudentId =
      data.payerStudentId && studentIds.includes(data.payerStudentId)
        ? data.payerStudentId
        : studentIds.length > 0
        ? studentIds[0]
        : null;

    const discountPct =
      data.discountPercentage != null && !isNaN(Number(data.discountPercentage))
        ? Math.min(100, Math.max(0, Number(data.discountPercentage)))
        : 50;

    let familyName: string | null = (data.name || "").trim() || null;
    if (!familyName && studentIds.length > 0) {
      const student = await prisma.student.findUnique({
        where: { id: payerStudentId || studentIds[0] },
        select: { name: true },
      });
      if (student) {
        const { surname } = splitFullName(student.name);
        familyName = surname || student.name;
      }
    }
    if (!familyName) {
      familyName = [data.surname, data.name].filter(Boolean).join(" ").trim() || null;
    }

    if (payerStudentId) {
      const existingPayer = await prisma.family.findUnique({
        where: { payerStudentId },
        select: { id: true, name: true },
      });
      if (existingPayer && existingPayer.id !== familyId) {
        return {
          success: false,
          error: true,
          message: `Cet élève est déjà le payeur principal de la famille "${existingPayer.name || `#${existingPayer.id}`}". / هذا التلميذ هو بالفعل الدافع الرئيسي لعائلة أخرى.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      // Find current students linked to this family
      const currentStudents = await tx.student.findMany({
        where: { familyId },
        select: { id: true },
      });
      const currentIds = currentStudents.map((s) => s.id);

      // Unlink removed students
      const toRemove = currentIds.filter((id) => !studentIds.includes(id));
      if (toRemove.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: toRemove } },
          data: { familyId: null },
        });
      }

      // Link newly selected students
      if (studentIds.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: studentIds } },
          data: { familyId },
        });
      }

      // Update Family record
      await tx.family.update({
        where: { id: familyId },
        data: {
          name: familyName,
          payerStudentId,
          discountPercentage: discountPct,
        },
      });
    });

    safeRevalidatePath("/list/parents");
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath("/list/attendance");
    return { success: true, error: false, message: "Famille mise à jour avec succès / تم تحديث العائلة بنجاح." };
  } catch (err: any) {
    console.error("updateParent error:", err);
    return { success: false, error: true, message: "Échec de la mise à jour de la famille / فشل في تحديث العائلة." };
  }
};

export const deleteParent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "Identifiant du parent manquant / لا يوجد معرف لولي الامر." };
  }

  try {
    const numId = parseInt(id, 10);
    if (!isNaN(numId)) {
      await prisma.$executeRaw`UPDATE "Student" SET "familyId" = NULL WHERE "familyId" = ${numId}`;
      await prisma.$executeRaw`DELETE FROM "Family" WHERE id = ${numId}`;
    }

    safeRevalidatePath("/list/parents");
    return { success: true, error: false, message: "Parent supprimé avec succès / تم حذف ولي الامر بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la suppression du parent / فشل في حذف ولي الامر." };
  }
};

// =================================================================
// LESSON ACTIONS
// =================================================================

export const checkForConflicts = async ({
  classId,
  teacherId,
  classroomId,
  day,
  startTime,
  endTime,
  excludeId = -1,
  startsAt: explicitStartsAt,
  endsAt: explicitEndsAt,
  isExtra = false,
  isCatchUp = false,
  isFree = false,
}: {
  classId: number | number[];
  teacherId: string;
  classroomId?: number | null;
  day: string;
  startTime: string;
  endTime: string;
  excludeId?: number;
  startsAt?: Date;
  endsAt?: Date;
  isExtra?: boolean;
  isCatchUp?: boolean;
  isFree?: boolean;
}) => {
  try {
    const startsAt = explicitStartsAt || getLessonDateTime(day, startTime);
    const endsAt = explicitEndsAt || getLessonDateTime(day, endTime);
    const excludedIds =
      excludeId && excludeId > 0
        ? await findSiblingRecurringLessonIds(excludeId)
        : [-1];

    // 1. Teacher conflict check:
    // Full start-end time range comparison. Flag overlapping-but-offset lessons:
    // - Overlaps if startsAt < otherEndsAt AND endsAt > otherStartsAt
    // - Also checks same day of week across active recurring lessons by comparing time ranges
    if (teacherId) {
      const teacherConflict = await prisma.$queryRaw<any[]>`
        SELECT l.id FROM "Lesson" l
        LEFT JOIN "Class" c ON c.id = l."classId"
        WHERE l."teacherId" = ${teacherId}
          AND l.id NOT IN (${Prisma.join(excludedIds)})
          AND (c."isCompleted" = false OR c."isCompleted" IS NULL)
          AND (
            (l."startsAt" < ${endsAt} AND l."endsAt" > ${startsAt})
            OR
            (
              l."isExtra" = false AND l."isCatchUp" = false AND l."isFree" = false
              AND EXTRACT(DOW FROM l."startsAt") = EXTRACT(DOW FROM ${startsAt}::timestamp)
              AND l."startsAt"::time < ${endsAt}::time
              AND l."endsAt"::time > ${startsAt}::time
            )
          )
        LIMIT 1
      `;
      if (teacherConflict.length > 0) {
        return "Conflit d'emploi du temps : cet enseignant a déjà une séance à cet horaire / تعارض في الجدول: هذا الأستاذ لديه حصة مجدولة بالفعل في هذا الوقت.";
      }
    }

    // 2. Class (group) conflict check for single or multiple groups
    const classIds = Array.isArray(classId)
      ? classId.map(Number).filter((id) => !isNaN(id) && id > 0)
      : classId
      ? [Number(classId)]
      : [];

    if (classIds.length > 0) {
      const classConflict = await prisma.$queryRaw<any[]>`
        SELECT l.id, c.name as "className"
        FROM "Lesson" l
        LEFT JOIN "Class" c ON c.id = l."classId"
        WHERE (
          l."classId" IN (${Prisma.join(classIds)})
          OR EXISTS (
            SELECT 1 FROM "LessonGroup" lg
            WHERE lg."lessonId" = l.id AND lg."classId" IN (${Prisma.join(classIds)})
          )
        )
          AND l.id NOT IN (${Prisma.join(excludedIds)})
          AND (c."isCompleted" = false OR c."isCompleted" IS NULL)
          AND (
            (l."startsAt" < ${endsAt} AND l."endsAt" > ${startsAt})
            OR
            (
              l."isExtra" = false AND l."isCatchUp" = false AND l."isFree" = false
              AND EXTRACT(DOW FROM l."startsAt") = EXTRACT(DOW FROM ${startsAt}::timestamp)
              AND l."startsAt"::time < ${endsAt}::time
              AND l."endsAt"::time > ${startsAt}::time
            )
          )
        LIMIT 1
      `;
      if (classConflict.length > 0) {
        const cName = classConflict[0]?.className || "أحد الأفواج";
        return `Conflit d'emploi du temps : le groupe "${cName}" a déjà une séance à cet horaire / تعارض في الجدول: الفوج "${cName}" لديه حصة مجدولة بالفعل في هذا الوقت.`;
      }
    }

    // 3. Classroom conflict check
    if (classroomId) {
      const classroomConflict = await prisma.$queryRaw<any[]>`
        SELECT l.id FROM "Lesson" l
        LEFT JOIN "Class" c ON c.id = l."classId"
        WHERE l."classroomId" = ${Number(classroomId)}
          AND l.id NOT IN (${Prisma.join(excludedIds)})
          AND (c."isCompleted" = false OR c."isCompleted" IS NULL)
          AND l."isTeacherAbsent" = false
          AND (
            (l."startsAt" < ${endsAt} AND l."endsAt" > ${startsAt})
            OR
            (
              l."isExtra" = false AND l."isCatchUp" = false AND l."isFree" = false
              AND EXTRACT(DOW FROM l."startsAt") = EXTRACT(DOW FROM ${startsAt}::timestamp)
              AND l."startsAt"::time < ${endsAt}::time
              AND l."endsAt"::time > ${startsAt}::time
            )
          )
        LIMIT 1
      `;
      if (classroomConflict.length > 0) {
        const cr = await prisma.$queryRaw<any[]>`
          SELECT name FROM "Classroom" WHERE id = ${Number(classroomId)} LIMIT 1
        `;
        const roomName = cr[0]?.name || "المحددة";
        return `Conflit de salle : la salle "${roomName}" est déjà occupée à cet horaire / تعارض في القاعة: القاعة "${roomName}" محجوزة بالفعل في هذا الوقت.`;
      }
    }
  } catch (err) {
    console.error("checkForConflicts error:", err);
  }

  return null;
};

export const createLesson = async (
  currentState: CurrentState,
  data: LessonSchema
) => {
  try {
    // 1. Single lesson type validation: exactly one of (normal / extra / catch-up / free)
    const activeTypeFlags = [Boolean(data.isExtra), Boolean(data.isCatchUp), Boolean(data.isFree)].filter(Boolean);
    if (activeTypeFlags.length > 1) {
      return {
        success: false,
        error: true,
        message: "Un seul type de séance autorisé (normale, supplémentaire, rattrapage, gratuite) / لا يمكن أن تكون الحصة أكثر من نوع واحد (عادية، إضافية، استدراكية، مجانية).",
      };
    }

    const classId = Number(data.classId);
    if (!classId) {
      return { success: false, error: true, message: "Veuillez sélectionner une classe / الرجاء تحديد الفوج." };
    }

    // 2. Fetch class and auto-fetch head teacher (docs/architecture.md §7.5)
    const classRows = await prisma.$queryRaw<any[]>`
      SELECT id, name, "teacherId", "branchId", "levelId", "formationLevelId" FROM "Class" WHERE id = ${classId} LIMIT 1
    `;
    if (classRows.length === 0) {
      return { success: false, error: true, message: "Classe introuvable / الفوج المحدد غير موجود." };
    }
    const classRecord = classRows[0];
    const teacherId = classRecord.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Aucun enseignant principal assigné à cette classe / هذا الفوج ليس لديه أستاذ رئيسي معين." };
    }

    const classroomId = Number(data.classroomId);
    const isExtra = Boolean(data.isExtra);
    const isCatchUp = Boolean(data.isCatchUp);
    const isFree = Boolean(data.isFree);
    const isSpecialLesson = Boolean(isExtra || isCatchUp || isFree);

    // 3. Branch resolution:
    // - Owner can choose any branch or auto-assign to classroom branch.
    // - Branch Admin:
    //   * Group must belong to admin's branch.
    //   * For SPECIAL lessons (extra, catch-up, free): if out of classrooms in their own branch,
    //     the admin can book ANY classroom in ANY other branch.
    //     The lesson is hosted at the chosen classroom's branch so that branch admin can take attendance!
    //   * For NORMAL lessons: classroom must belong to admin's own branch.
    const session = await getAuthSession();
    let branchId: number;

    let crBranchId: number | null = null;
    if (classroomId) {
      const crRows = await prisma.$queryRaw<any[]>`
        SELECT "branchId" FROM "Classroom" WHERE id = ${classroomId} LIMIT 1
      `;
      if (crRows.length === 0) {
        return { success: false, error: true, message: "Salle introuvable / القاعة غير موجودة." };
      }
      crBranchId = crRows[0].branchId;
    }

    if (session.isOwner) {
      if (crBranchId) {
        branchId = crBranchId;
      } else if (data.branchId) {
        branchId = Number(data.branchId);
      } else if (classRecord.branchId) {
        branchId = classRecord.branchId;
      } else {
        branchId = 1;
      }
    } else {
      const adminBranchId = session.branchIds[0];
      if (!adminBranchId) {
        return { success: false, error: true, message: "Compte non rattaché à une succursale / حسابك غير مرتبط بأي فرع." };
      }

      // Fully cross-branch: Host branch admin, home branch admin, or any admin can schedule special lessons
      // or schedule groups hosted in their branch classrooms!
      branchId = crBranchId || (data.branchId ? Number(data.branchId) : null) || classRecord.branchId || adminBranchId;
    }

    if (data.date) {
      const parts = data.date.trim().split("-").map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
        const dayNames = [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ] as const;
        data.day = dayNames[d.getUTCDay()];
      }
    }

    const startsAt = getLessonDateTime(data.day, data.startTime, data.date);
    const endsAt = getLessonDateTime(data.day, data.endTime, data.date);

    let validAdditionalClassIds: number[] = [];
    if (isSpecialLesson && Array.isArray(data.additionalClassIds)) {
      const parsedIds = data.additionalClassIds
        .map(Number)
        .filter((id) => !isNaN(id) && id > 0 && id !== classId);
      if (parsedIds.length > 0) {
        const additionalRows = await prisma.$queryRaw<any[]>`
          SELECT id, name, "teacherId", "levelId", "formationLevelId"
          FROM "Class"
          WHERE id IN (${Prisma.join(parsedIds)})
        `;
        for (const ar of additionalRows) {
          if (ar.teacherId !== teacherId) {
            return {
              success: false,
              error: true,
              message: `Le groupe "${ar.name}" n'a pas le même enseignant / الفوج "${ar.name}" ليس لديه نفس الأستاذ.`,
            };
          }
          const sameLevel =
            (classRecord.levelId && ar.levelId === classRecord.levelId) ||
            (classRecord.formationLevelId && ar.formationLevelId === classRecord.formationLevelId);
          if (!sameLevel) {
            return {
              success: false,
              error: true,
              message: `Le groupe "${ar.name}" n'est pas dans le même niveau / الفوج "${ar.name}" ليس في نفس المستوى.`,
            };
          }
        }
        validAdditionalClassIds = additionalRows.map((r) => r.id);
      }
    }

    const allAssociatedClassIds = [classId, ...validAdditionalClassIds];

    // 4. Time-conflict check with full start-end range comparison
    const conflict = await checkForConflicts({
      classId: allAssociatedClassIds,
      teacherId,
      classroomId,
      day: data.day,
      startTime: data.startTime,
      endTime: data.endTime,
      startsAt,
      endsAt,
      isExtra,
      isCatchUp,
      isFree,
    });
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const newLesson = await prisma.lesson.create({
      data: {
        classId,
        teacherId,
        classroomId,
        branchId,
        startsAt,
        endsAt,
        isExtra,
        isCatchUp,
        isFree,
        extraFee: null,
        lessonGroups: {
          create: allAssociatedClassIds.map((cid) => ({ classId: cid })),
        },
      },
      include: {
        branch: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        lessonGroups: { include: { class: { select: { id: true, name: true } } } },
      },
    });

    if (newLesson?.id) {
      try {
        const startsDateStr = startsAt.toLocaleDateString("ar-DZ", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const startTimeStr = data.startTime || "";
        const endTimeStr = data.endTime || "";

        let annTitle = "حصة جديدة";
        let typePrefix = "حصة جديدة";
        if (isExtra) {
          annTitle = "حصة إضافية جديدة";
          typePrefix = "حصة إضافية";
        } else if (isCatchUp) {
          annTitle = "حصة استدراكية جديدة";
          typePrefix = "حصة استدراكية";
        } else if (isFree) {
          annTitle = "حصة مجانية جديدة";
          typePrefix = "حصة مجانية";
        }

        const bName = (newLesson as any).branch?.name || "";
        const crName = (newLesson as any).classroom?.name ? `- قاعة ${(newLesson as any).classroom.name}` : "";
        const allGroupNames = [
          (newLesson as any).class?.name || classRecord.name,
          ...((newLesson as any).lessonGroups || [])
            .map((lg: any) => lg.class?.name)
            .filter((n: string) => n && n !== classRecord.name),
        ].join(" + ");
        const cName = allGroupNames || (newLesson as any).class?.name || classRecord.name;
        const desc = `${typePrefix} لفوج ${cName} في ${bName} ${crName} بتاريخ ${startsDateStr} من ${startTimeStr} إلى ${endTimeStr}`.trim();

        await prisma.announcement.create({
          data: {
            title: annTitle,
            description: desc,
            classId,
            branchId: null, // school-wide
            authorBranchId: branchId,
            lessonId: newLesson.id,
            createdBy: session.userId || "admin",
            pinned: true,
            expiresAt: endsAt,
          },
        });
        safeRevalidatePath("/list/announcements");
        safeRevalidatePath("/admin");
        safeRevalidatePath("/teacher");
        safeRevalidatePath("/student");
        safeRevalidatePath("/parent");
      } catch (annErr) {
        console.warn("Could not create automatic timetable announcement:", annErr);
      }
    }

    if (isSpecialLesson && newLesson?.id) {
      try {
        await handleSpecialLessonWhatsAppTrigger({
          lessonId: newLesson.id,
          actionType: "NEW",
          adminId: session.userId || "admin",
        });
      } catch (waErr) {
        console.error("[WA Trigger] Special lesson create trigger failed:", waErr);
      }
    }

    safeRevalidatePath("/list/lessons");
    for (const cid of allAssociatedClassIds) {
      safeRevalidatePath(`/list/attendance/class/${cid}`);
    }
    if (newLesson?.id) {
      safeRevalidatePath(`/list/attendance/take/${newLesson.id}`);
    }
    return { success: true, error: false, message: "Séance programmée avec succès / تم برمجة الحصة بنجاح." };
  } catch (err) {
    console.error("createLesson error:", err);
    return { success: false, error: true, message: "Échec de la programmation de la séance / فشل في برمجة الحصة." };
  }
};

export const updateLesson = async (
  currentState: CurrentState,
  data: LessonSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant de séance manquant / لا يوجد معرف للحصة." };
  }
  try {
    const lessonId = Number(data.id);
    const session = await getAuthSession();

    // 1. Check existing lesson and permission
    const existing = await prisma.$queryRaw<Array<{ branchId: number; classId: number; classroomId: number; classBranchId: number }>>`
      SELECT l."branchId", l."classId", l."classroomId", l."startsAt", l."endsAt", c."branchId" as "classBranchId"
      FROM "Lesson" l
      LEFT JOIN "Class" c ON c.id = l."classId"
      WHERE l.id = ${lessonId} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    if (!session.isOwner && !session.isOwnerOrAdmin) {
      const isHomeBranchAdmin = existing[0].classBranchId && session.branchIds.includes(existing[0].classBranchId);
      const isHostingBranchAdmin = existing[0].branchId && session.branchIds.includes(existing[0].branchId);
      if (!isHomeBranchAdmin && !isHostingBranchAdmin) {
        return { success: false, error: true, message: "Non autorisé à modifier une séance d'une autre succursale / غير مصرح لك بتعديل حصة لا تنتمي إلى فرعك." };
      }
    }

    // 2. Single lesson type validation
    const activeTypeFlags = [Boolean(data.isExtra), Boolean(data.isCatchUp), Boolean(data.isFree)].filter(Boolean);
    if (activeTypeFlags.length > 1) {
      return {
        success: false,
        error: true,
        message: "Un seul type de séance autorisé (normale, supplémentaire, rattrapage, gratuite) / لا يمكن أن تكون الحصة أكثر من نوع واحد (عادية، إضافية، استدراكية، مجانية).",
      };
    }

    const classId = Number(data.classId);
    if (!classId) {
      return { success: false, error: true, message: "Veuillez sélectionner une classe / الرجاء تحديد الفوج." };
    }

    // 3. Fetch class and auto-fetch head teacher
    const classRows = await prisma.$queryRaw<any[]>`
      SELECT id, name, "teacherId", "branchId", "levelId", "formationLevelId" FROM "Class" WHERE id = ${classId} LIMIT 1
    `;
    if (classRows.length === 0) {
      return { success: false, error: true, message: "Classe introuvable / الفوج المحدد غير موجود." };
    }
    const classRecord = classRows[0];
    const teacherId = classRecord.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Aucun enseignant principal assigné à cette classe / هذا الفوج ليس لديه أستاذ رئيسي معين." };
    }

    const classroomId = Number(data.classroomId);
    const isExtra = Boolean(data.isExtra);
    const isCatchUp = Boolean(data.isCatchUp);
    const isFree = Boolean(data.isFree);
    const isSpecialLesson = Boolean(isExtra || isCatchUp || isFree);

    let crBranchId: number | null = null;
    if (classroomId) {
      const crRows = await prisma.$queryRaw<any[]>`
        SELECT "branchId" FROM "Classroom" WHERE id = ${classroomId} LIMIT 1
      `;
      if (crRows.length === 0) {
        return { success: false, error: true, message: "Salle introuvable / القاعة غير موجودة." };
      }
      crBranchId = crRows[0].branchId;
    }

    // 4. Branch resolution on update
    let branchId: number;
    if (session.isOwner) {
      branchId = crBranchId || Number(data.branchId) || existing[0].branchId;
    } else {
      const adminBranchId = session.branchIds[0];
      branchId = crBranchId || (data.branchId ? Number(data.branchId) : null) || existing[0].branchId || adminBranchId;
    }

    if (data.date) {
      const parts = data.date.trim().split("-").map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
        const dayNames = [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ] as const;
        data.day = dayNames[d.getUTCDay()];
      }
    }

    const startsAt = getLessonDateTime(data.day, data.startTime, data.date);
    const endsAt = getLessonDateTime(data.day, data.endTime, data.date);

    let validAdditionalClassIds: number[] = [];
    if (isSpecialLesson && Array.isArray(data.additionalClassIds)) {
      const parsedIds = data.additionalClassIds
        .map(Number)
        .filter((id) => !isNaN(id) && id > 0 && id !== classId);
      if (parsedIds.length > 0) {
        const additionalRows = await prisma.$queryRaw<any[]>`
          SELECT id, name, "teacherId", "levelId", "formationLevelId"
          FROM "Class"
          WHERE id IN (${Prisma.join(parsedIds)})
        `;
        for (const ar of additionalRows) {
          if (ar.teacherId !== teacherId) {
            return {
              success: false,
              error: true,
              message: `Le groupe "${ar.name}" n'a pas le même enseignant / الفوج "${ar.name}" ليس لديه نفس الأستاذ.`,
            };
          }
          const sameLevel =
            (classRecord.levelId && ar.levelId === classRecord.levelId) ||
            (classRecord.formationLevelId && ar.formationLevelId === classRecord.formationLevelId);
          if (!sameLevel) {
            return {
              success: false,
              error: true,
              message: `Le groupe "${ar.name}" n'est pas dans le même niveau / الفوج "${ar.name}" ليس في نفس المستوى.`,
            };
          }
        }
        validAdditionalClassIds = additionalRows.map((r) => r.id);
      }
    }

    const allAssociatedClassIds = [classId, ...validAdditionalClassIds];

    // 5. Conflict check with excludeId = lessonId
    const conflict = await checkForConflicts({
      classId: allAssociatedClassIds,
      teacherId,
      classroomId,
      day: data.day,
      startTime: data.startTime,
      endTime: data.endTime,
      excludeId: lessonId,
      startsAt,
      endsAt,
      isExtra,
      isCatchUp,
      isFree,
    });
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const siblingIds =
      !isExtra && !isCatchUp && !isFree
        ? await findSiblingRecurringLessonIds(lessonId)
        : [lessonId];

    const updatedLesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        classId,
        teacherId,
        classroomId,
        branchId,
        startsAt,
        endsAt,
        isExtra,
        isCatchUp,
        isFree,
        extraFee: null,
      },
      include: {
        branch: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    // Synchronize LessonGroup entries
    await prisma.lessonGroup.deleteMany({ where: { lessonId } });
    if (allAssociatedClassIds.length > 0) {
      await prisma.lessonGroup.createMany({
        data: allAssociatedClassIds.map((cid) => ({ lessonId, classId: cid })),
      });
    }

    if (!isExtra && !isCatchUp && !isFree && siblingIds.length > 1) {
      await syncSiblingRecurringLessons({
        siblingIds,
        updatedLessonId: lessonId,
        classId,
        teacherId,
        classroomId,
        branchId,
        newStartsAt: startsAt,
        newEndsAt: endsAt,
      });
    }

    // Sync automatic announcement if exists, or create if missing
    try {
      const startsDateStr = startsAt.toLocaleDateString("ar-DZ", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const startTimeStr = data.startTime || "";
      const endTimeStr = data.endTime || "";

      let annTitle = "حصة جديدة";
      let typePrefix = "حصة جديدة";
      if (isExtra) {
        annTitle = "حصة إضافية جديدة";
        typePrefix = "حصة إضافية";
      } else if (isCatchUp) {
        annTitle = "حصة استدراكية جديدة";
        typePrefix = "حصة استدراكية";
      } else if (isFree) {
        annTitle = "حصة مجانية جديدة";
        typePrefix = "حصة مجانية";
      }

      const bName = (updatedLesson as any).branch?.name || "";
      const crName = (updatedLesson as any).classroom?.name ? `- قاعة ${(updatedLesson as any).classroom.name}` : "";
      const otherGroupRows = await prisma.lessonGroup.findMany({
        where: { lessonId },
        include: { class: { select: { name: true } } },
      });
      const allGroupNames = [
        (updatedLesson as any).class?.name || classRecord.name,
        ...otherGroupRows.map((lg) => lg.class?.name).filter((n) => n && n !== classRecord.name),
      ].join(" + ");
      const cName = allGroupNames || (updatedLesson as any).class?.name || classRecord.name;
      const desc = `${typePrefix} لفوج ${cName} في ${bName} ${crName} بتاريخ ${startsDateStr} من ${startTimeStr} إلى ${endTimeStr}`.trim();

      const existingAnnouncement = await prisma.announcement.findFirst({
        where: { lessonId },
      });

      if (existingAnnouncement) {
        await prisma.announcement.update({
          where: { id: existingAnnouncement.id },
          data: {
            title: annTitle,
            description: desc,
            classId,
            authorBranchId: branchId,
            expiresAt: endsAt,
          },
        });
      } else {
        await prisma.announcement.create({
          data: {
            title: annTitle,
            description: desc,
            classId,
            branchId: null,
            authorBranchId: branchId,
            lessonId,
            createdBy: session.userId || "admin",
            pinned: true,
            expiresAt: endsAt,
          },
        });
      }
      safeRevalidatePath("/list/announcements");
      safeRevalidatePath("/admin");
      safeRevalidatePath("/teacher");
      safeRevalidatePath("/student");
      safeRevalidatePath("/parent");
    } catch (annErr) {
      console.warn("Could not sync announcement on lesson update:", annErr);
    }

    if (isSpecialLesson && updatedLesson?.id) {
      try {
        await handleSpecialLessonWhatsAppTrigger({
          lessonId: updatedLesson.id,
          actionType: "UPDATE",
          adminId: session.userId || "admin",
          oldDetails: {
            startsAt: (existing[0] as any).startsAt || startsAt,
            endsAt: (existing[0] as any).endsAt || endsAt,
            classroomId: existing[0].classroomId,
          },
        });
      } catch (waErr) {
        console.error("[WA Trigger] Special lesson update trigger failed:", waErr);
      }
    }

    safeRevalidatePath("/list/lessons");
    for (const cid of allAssociatedClassIds) {
      safeRevalidatePath(`/list/attendance/class/${cid}`);
    }
    safeRevalidatePath(`/list/attendance/take/${lessonId}`);
    return { success: true, error: false, message: "Séance mise à jour avec succès / تم تحديث الحصة بنجاح." };
  } catch (err) {
    console.error("updateLesson error:", err);
    return { success: false, error: true, message: "Échec de la mise à jour de la séance / فشل في تحديث الحصة." };
  }
};

export const deleteLesson = async (
  currentState: CurrentState,
  data: FormData | { id: string | number }
) => {
  let idVal: string | number | null = null;
  if (data instanceof FormData) {
    idVal = data.get("id") as string;
  } else if (data && typeof data === "object" && "id" in data) {
    idVal = (data as any).id;
  }
  const id = parseInt(String(idVal), 10);
  if (isNaN(id)) {
    return { success: false, error: true, message: "معرف الحصة غير صالح." };
  }

  try {
    const session = await getAuthSession();
    const existing = await prisma.lesson.findUnique({
      where: { id },
      select: {
        branchId: true,
        classId: true,
        isExtra: true,
        isCatchUp: true,
        isFree: true,
        class: { select: { branchId: true } },
      },
    });
    if (!existing) {
      return { success: false, error: true, message: "Leçon introuvable / الحصة غير موجودة." };
    }
    const hasBranchPerm =
      session.isOwner ||
      session.isOwnerOrAdmin ||
      canUserAccessBranch(session.rawRole, session.branchIds, existing.branchId) ||
      (existing.class?.branchId && canUserAccessBranch(session.rawRole, session.branchIds, existing.class.branchId));
    if (!hasBranchPerm) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بحذف حصة في هذا الفرع." };
    }

    if (existing.isExtra || existing.isCatchUp || existing.isFree) {
      try {
        await handleSpecialLessonWhatsAppTrigger({
          lessonId: id,
          actionType: "CANCEL",
          adminId: session.userId || "admin",
        });
      } catch (waErr) {
        console.error("[WA Trigger] Special lesson cancel trigger failed:", waErr);
      }
    }

    const siblingIds =
      !existing.isExtra && !existing.isCatchUp && !existing.isFree
        ? await findSiblingRecurringLessonIds(id)
        : [id];

    // Automatically delete associated announcement, attendances, and lesson
    await prisma.announcement.deleteMany({ where: { lessonId: { in: siblingIds } } });
    await prisma.catchUpAttendance.deleteMany({ where: { OR: [{ missedLessonId: id }, { catchUpLessonId: id }] } });
    await prisma.attendance.deleteMany({ where: { lessonId: id } });
    await prisma.lesson.delete({ where: { id } });

    // Also remove any unused sibling recurring rows of this slot
    const otherSiblings = siblingIds.filter((sid) => sid !== id);
    if (otherSiblings.length > 0) {
      const unusedSiblings = await prisma.lesson.findMany({
        where: {
          id: { in: otherSiblings },
          isTeacherAbsent: false,
          attendances: { none: {} },
          missedByCatchUps: { none: {} },
          catchUpVisitsHosted: { none: {} },
        },
        select: { id: true },
      });
      if (unusedSiblings.length > 0) {
        await prisma.lesson.deleteMany({
          where: { id: { in: unusedSiblings.map((u) => u.id) } },
        });
      }
    }

    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    safeRevalidatePath("/list/lessons");
    if (existing.classId) {
      safeRevalidatePath("/list/formations");
      safeRevalidatePath(`/list/formations/${existing.classId}`);
    }
    return { success: true, error: false, message: "Leçon supprimée avec succès / تم حذف الحصة بنجاح." };
  } catch (err) {
    console.error("deleteLesson error:", err);
    return { success: false, error: true, message: "Échec de suppression de la leçon / فشل في حذف الحصة." };
  }
};

export const toggleTeacherLessonAbsenceAction = async (input: {
  lessonId: number;
  isTeacherAbsent: boolean;
  dateStr?: string;
}) => {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح" };
    }

    const baseCheck = await prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: {
        id: true,
        branchId: true,
        classroomId: true,
        classroom: { select: { branchId: true } },
      },
    });

    if (!baseCheck) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    const hostBranchId = baseCheck.branchId || baseCheck.classroom?.branchId;
    const hasAbsenceBranchPerm =
      session.isOwner ||
      canUserAccessBranch(session.rawRole, session.branchIds, hostBranchId);

    if (!hasAbsenceBranchPerm) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette succursale / غير مصرح لك بتعديل حصة في هذا الفرع.",
      };
    }

    const targetLessonId = await resolveOrCreateLessonForDate(
      input.lessonId,
      input.dateStr
    );

    const lesson = await prisma.lesson.findUnique({
      where: { id: targetLessonId },
      select: {
        id: true,
        branchId: true,
        classId: true,
        teacherId: true,
        isTeacherAbsent: true,
      },
    });

    if (!lesson) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    const updated = await prisma.lesson.update({
      where: { id: targetLessonId },
      data: { isTeacherAbsent: input.isTeacherAbsent },
      select: { id: true, isTeacherAbsent: true },
    });

    const adminId = session.userId || session.rawRole || "admin";
    await prisma.auditLog.create({
      data: {
        action: input.isTeacherAbsent ? "TEACHER_ABSENCE_MARKED" : "TEACHER_ABSENCE_UNMARKED",
        entityType: "Lesson",
        entityId: String(targetLessonId),
        branchId: lesson.branchId,
        userId: adminId,
        userName: adminId,
        details: JSON.stringify({
          lessonId: targetLessonId,
          teacherId: lesson.teacherId,
          classId: lesson.classId,
          isTeacherAbsent: input.isTeacherAbsent,
          dateStr: input.dateStr,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    safeRevalidatePath("/list/lessons");
    safeRevalidatePath(`/list/attendance/take/${targetLessonId}`);
    if (lesson.classId) {
      safeRevalidatePath(`/list/attendance/class/${lesson.classId}`);
      safeRevalidatePath(`/list/payments/class/${lesson.classId}`);
    }
    safeRevalidatePath(`/list/teachers/${lesson.teacherId}`);
    safeRevalidatePath("/list/finance");
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/admin");

    return {
      success: true,
      error: false,
      lessonId: targetLessonId,
      isTeacherAbsent: updated.isTeacherAbsent,
      message: input.isTeacherAbsent
        ? "Absence de l'enseignant enregistrée / تم تسجيل غياب الأستاذ بنجاح."
        : "Présence de l'enseignant rétablie / تم إلغاء تسجيل غياب الأستاذ بنجاح.",
    };
  } catch (err: any) {
    console.error("toggleTeacherLessonAbsenceAction error:", err);
    return {
      success: false,
      error: true,
      message: "Erreur lors de la modification du statut / خطأ أثناء تحديث حالة الأستاذ.",
    };
  }
};

// =================================================================
// ATTENDANCE ACTIONS
// =================================================================

export const saveAttendance = async (
  lessonId: number,
  currentState: CurrentState,
  data: FormData
) => {
  // Extract all the attendance entries from the form data
  const attendanceEntries = Array.from(data.entries()).filter(([key]) =>
    key.startsWith("attendance[")
  );

  if (attendanceEntries.length === 0) {
    return { success: false, error: true, message: "Aucune donnée de présence fournie / لم يتم تقديم أي بيانات حضور." };
  }

  // Validate that all NOT_DEFINED entries have a non-empty justification
  for (const [key, value] of attendanceEntries) {
    if (value === "NOT_DEFINED") {
      const studentId = key.substring(key.indexOf("[") + 1, key.indexOf("]"));
      const justification = (data.get(`justification[${studentId}]`) as string)?.trim();
      if (!justification) {
        return {
          success: false,
          error: true,
          message: "La justification est obligatoire pour le statut non défini / تبرير الغياب إلزامي لكل تلميذ محدد كغير محدد.",
        };
      }
    }
  }

  try {
    const session = await getAuthSession();
    const adminId = session.userId || session.rawRole || "admin";

    const lessonInfo = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        branchId: true,
        classroomId: true,
        teacherId: true,
        classId: true,
        classroom: { select: { branchId: true } },
        lessonGroups: { select: { classId: true } },
      },
    });

    if (!lessonInfo) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    const attendanceBranchId = lessonInfo.branchId || lessonInfo.classroom?.branchId;
    const isTeacherOfLesson = session.rawRole === "teacher" && lessonInfo.teacherId === session.userId;
    const hasBranchPermission =
      session.isOwner ||
      isTeacherOfLesson ||
      canUserAccessBranch(session.rawRole, session.branchIds, attendanceBranchId);

    if (!hasBranchPermission) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé pour ce siège / غير مصرح لك بتسجيل الحضور لهذا الفرع.",
      };
    }

    await prisma.$transaction(
      async (tx) => {
        const existingRecords = await tx.attendance.findMany({
          where: { lessonId },
          select: { id: true, studentId: true, status: true, justification: true },
        });

        const recordsMap = new Map(existingRecords.map((r) => [r.studentId, r]));

        const toCreate: Array<{
          lessonId: number;
          studentId: string;
          status: string;
          justification: string | null;
        }> = [];

        const toUpdate: Array<{
          id: number;
          status: string;
          justification: string | null;
        }> = [];

        const visitorRecords = await tx.catchUpAttendance.findMany({
          where: { catchUpLessonId: lessonId },
          select: { studentId: true, missedLesson: { select: { classId: true } } },
        });
        const externalVisitorStudentIds = new Set(
          visitorRecords
            .filter((v) => v.missedLesson.classId !== lessonInfo?.classId)
            .map((v) => v.studentId)
        );

        for (const [key, value] of attendanceEntries) {
          const studentId = key.substring(key.indexOf("[") + 1, key.indexOf("]"));
          if (externalVisitorStudentIds.has(studentId)) {
            // External catch-up visitors are tracked via CatchUpAttendance
            continue;
          }
          const status = value === "PRESENT" ? "PRESENT" : value === "NOT_DEFINED" ? "NOT_DEFINED" : "ABSENT";
          const justification = status === "NOT_DEFINED" ? (data.get(`justification[${studentId}]`) as string)?.trim() || null : null;
          const existingRecord = recordsMap.get(studentId);

          if (existingRecord) {
            if (existingRecord.status !== status || (existingRecord.justification || null) !== justification) {
              toUpdate.push({
                id: existingRecord.id,
                status,
                justification,
              });
            }
          } else {
            toCreate.push({
              lessonId,
              studentId,
              status,
              justification,
            });
          }
        }

        if (toCreate.length > 0) {
          await tx.attendance.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }

        if (toUpdate.length > 0) {
          await Promise.all(
            toUpdate.map((item) =>
              tx.attendance.update({
                where: { id: item.id },
                data: {
                  status: item.status,
                  justification: item.justification,
                },
              })
            )
          );
        }

      // Handle book distribution checkboxes (FIFO drop assignment per §2.11)
      const bookEntries = Array.from(data.entries()).filter(([key, val]) =>
        key.startsWith("bookDistribution[") && (val === "true" || val === "on" || val === "1")
      );

      for (const [key] of bookEntries) {
        const match = key.match(/^bookDistribution\[(.*?)\]\[(.*?)\]$/);
        if (match) {
          const studentId = match[1];
          const bookId = parseInt(match[2], 10);
          if (studentId && !isNaN(bookId)) {
            // Check if student already received a copy of this book
            const alreadyReceived = await tx.bookCopyDistribution.findFirst({
              where: {
                studentId,
                bookDrop: {
                  bookId,
                },
              },
            });

            if (!alreadyReceived) {
              // Find oldest BookDrop for this book that still has remaining capacity (FIFO by dropDate, id)
              const drops = await tx.bookDrop.findMany({
                where: { bookId },
                orderBy: [{ dropDate: "asc" }, { id: "asc" }],
                include: {
                  _count: {
                    select: { distributions: true },
                  },
                },
              });

              const availableDrop = drops.find((d) => d.quantity > d._count.distributions);
              if (availableDrop) {
                await tx.bookCopyDistribution.create({
                  data: {
                    bookDropId: availableDrop.id,
                    studentId,
                    distributedAt: new Date(),
                    distributedBy: adminId,
                  },
                });
              }

              // Also record into single source of truth BookReceipt (§7.20 / Phase 36)
              await tx.bookReceipt.upsert({
                where: {
                  studentId_bookId: {
                    studentId,
                    bookId,
                  },
                },
                update: {
                  receivedAt: new Date(),
                  receivedBy: adminId,
                },
                create: {
                  studentId,
                  bookId,
                  receivedAt: new Date(),
                  receivedBy: adminId,
                },
              });
            }
          }
        }
      }
    },
    {
      timeout: 30000,
      maxWait: 10000,
    }
  );

  // Auto-suspension and restoration logic (Rules 5 & 9)
  if (lessonInfo?.classId) {
    try {
      const presentStudentIds: string[] = [];
      const absentStudentIds: string[] = [];

      for (const [key, value] of attendanceEntries) {
        const studentId = key.substring(key.indexOf("[") + 1, key.indexOf("]"));
        if (value === "PRESENT") presentStudentIds.push(studentId);
        else if (value === "ABSENT") absentStudentIds.push(studentId);
      }

      // Restore ACTIVE status for attending students who were SUSPENDED
      if (presentStudentIds.length > 0) {
        const targetClassIds = [
          ...(lessonInfo.classId ? [lessonInfo.classId] : []),
          ...(lessonInfo.lessonGroups?.map((lg: any) => lg.classId) || []),
        ];
        const suspendedEnrollments = await prisma.enrollment.findMany({
          where: {
            studentId: { in: presentStudentIds },
            classId: { in: targetClassIds },
            status: "SUSPENDED",
          },
          select: { id: true, studentId: true, classId: true },
        });
        for (const enr of suspendedEnrollments) {
          await unsuspendEnrollmentWithDebtClearance(prisma, {
            studentId: enr.studentId,
            classId: enr.classId,
            enrollmentId: enr.id,
            trigger: "ATTENDANCE",
            actorId: adminId,
            actorName: adminId,
            excludeLessonIds: [lessonId],
            referenceDate: new Date(),
          });
        }
      }

      // Check for 4+ consecutive absences among absent students
      if (absentStudentIds.length > 0) {
        const [classLessons, allAttendances, allCatchUps] = await Promise.all([
          prisma.lesson.findMany({
            where: { classId: lessonInfo.classId, isFree: false, isTeacherAbsent: false },
            select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
            orderBy: { startsAt: "asc" },
          }),
          prisma.attendance.findMany({
            where: {
              studentId: { in: absentStudentIds },
              lesson: { classId: lessonInfo.classId },
            },
            select: { studentId: true, lessonId: true, status: true },
          }),
          prisma.catchUpAttendance.findMany({
            where: {
              studentId: { in: absentStudentIds },
              missedLesson: { classId: lessonInfo.classId },
            },
            select: { studentId: true, missedLessonId: true },
          }),
        ]);

        const toSuspendStudentIds: string[] = [];
        for (const sid of absentStudentIds) {
          const sAtts = allAttendances.filter((a) => a.studentId === sid);
          const sCatchUps = allCatchUps.filter((c) => c.studentId === sid);
          const consecutive = computeStudentConsecutiveAbsences({
            lessons: classLessons,
            attendances: sAtts,
            catchUps: sCatchUps,
          });
          if (consecutive >= 4) {
            toSuspendStudentIds.push(sid);
          }
        }

        if (toSuspendStudentIds.length > 0) {
          await prisma.enrollment.updateMany({
            where: {
              studentId: { in: toSuspendStudentIds },
              classId: lessonInfo.classId,
              status: "ACTIVE",
            },
            data: { status: "SUSPENDED" },
          });
        }
      }
    } catch (autoErr) {
      console.warn("Auto-suspension evaluation error:", autoErr);
    }
  }

  // Revalidate the path to the dashboard, the main attendance page, this lesson's roster, and the class records table
  safeRevalidatePath("/admin");
  safeRevalidatePath("/list/attendance");
  safeRevalidatePath(`/list/attendance/take/${lessonId}`);
  const affectedClassIds = new Set<number>();
  if (lessonInfo?.classId) affectedClassIds.add(lessonInfo.classId);
  if (lessonInfo?.lessonGroups) {
    for (const lg of lessonInfo.lessonGroups) {
      affectedClassIds.add(lg.classId);
    }
  }
  for (const cId of affectedClassIds) {
    safeRevalidatePath(`/list/attendance/class/${cId}`);
    safeRevalidatePath(`/list/payments/class/${cId}`);
    safeRevalidatePath(`/list/formations/${cId}`);
  }
  if (affectedClassIds.size > 0) {
    safeRevalidatePath("/list/formations");
  }
  safeRevalidatePath("/list/students");

  try {
    const absentStudentIds = attendanceEntries
      .filter(([_, v]) => v === "ABSENT")
      .map(([k]) => k.substring(k.indexOf("[") + 1, k.indexOf("]")));
    const presentStudentIds = attendanceEntries
      .filter(([_, v]) => v === "PRESENT")
      .map(([k]) => k.substring(k.indexOf("[") + 1, k.indexOf("]")));

    await handleAttendanceWhatsAppTrigger({
      lessonId,
      absentStudentIds,
      presentStudentIds,
      adminId,
    });

    if (attendanceBranchId && lessonInfo.classId) {
      for (const sId of presentStudentIds) {
        const isZero = await verifyCreditIsStillZeroJit(sId, lessonInfo.classId);
        if (isZero) {
          await handleCreditZeroInstantTrigger({
            studentId: sId,
            classId: lessonInfo.classId,
            branchId: attendanceBranchId,
            adminId,
          });
        }
      }
    }
  } catch (waErr) {
    console.error("[WA Trigger] Attendance save trigger failed:", waErr);
  }

  return { success: true, error: false, message: "Présences et distribution des livres enregistrées avec succès / تم حفظ بيانات الحضور وتوزيع الكتب بنجاح." };

  } catch (err: any) {
    console.error("saveAttendance error:", err);
    return { success: false, error: true, message: "Échec de l'enregistrement des présences / فشل في حفظ بيانات الحضور." };
  }
};

/**
 * Optimistic single attendance toggling with immediate DB write (§7.21).
 */
export const markSingleAttendanceAction = async (input: {
  lessonId: number;
  studentId: string;
  status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
  justification?: string | null;
}) => {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح" };
    }

    const lessonInfo = await prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: {
        branchId: true,
        classroomId: true,
        teacherId: true,
        classId: true,
        classroom: { select: { branchId: true } },
        lessonGroups: { select: { classId: true } },
      },
    });

    if (!lessonInfo) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    const attendanceBranchId = lessonInfo.branchId || lessonInfo.classroom?.branchId;
    const isTeacherOfLesson = session.rawRole === "teacher" && lessonInfo.teacherId === session.userId;
    const hasBranchPermission =
      session.isOwner ||
      isTeacherOfLesson ||
      canUserAccessBranch(session.rawRole, session.branchIds, attendanceBranchId);

    if (!hasBranchPermission) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé pour ce siège / غير مصرح لك بتسجيل الحضور لهذا الفرع.",
      };
    }

    if (input.status === "NOT_DEFINED" && !input.justification?.trim()) {
      return {
        success: false,
        error: true,
        message: "La justification est obligatoire pour le statut non défini / تبرير الغياب إلزامي لكل تلميذ محدد كغير محدد.",
      };
    }

    const adminId = session.userId || session.rawRole || "admin";

    await prisma.$transaction(async (tx) => {
      await tx.attendance.upsert({
        where: {
          studentId_lessonId: {
            studentId: input.studentId,
            lessonId: input.lessonId,
          },
        },
        update: {
          status: input.status,
          justification: input.justification?.trim() || null,
        },
        create: {
          lessonId: input.lessonId,
          studentId: input.studentId,
          status: input.status,
          justification: input.justification?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "ATTENDANCE_MARKED",
          entityType: "Attendance",
          entityId: `${input.lessonId}_${input.studentId}`,
          userId: adminId,
          userName: adminId,
          details: JSON.stringify({
            lessonId: input.lessonId,
            studentId: input.studentId,
            status: input.status,
            adminId,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    });

    try {
      await handleAttendanceWhatsAppTrigger({
        lessonId: input.lessonId,
        absentStudentIds: input.status === "ABSENT" ? [input.studentId] : [],
        presentStudentIds: input.status === "PRESENT" ? [input.studentId] : [],
        adminId,
      });

      if (input.status === "PRESENT" && attendanceBranchId && lessonInfo?.classId) {
        const isZero = await verifyCreditIsStillZeroJit(input.studentId, lessonInfo.classId);
        if (isZero) {
          await handleCreditZeroInstantTrigger({
            studentId: input.studentId,
            classId: lessonInfo.classId,
            branchId: attendanceBranchId,
            adminId,
          });
        }
      }
    } catch (waErr) {
      console.error("[WA Trigger] Single attendance trigger failed:", waErr);
    }

    if (lessonInfo?.classId) {
      try {
        const targetClassIds = [
          ...(lessonInfo.classId ? [lessonInfo.classId] : []),
          ...(lessonInfo.lessonGroups?.map((lg: any) => lg.classId) || []),
        ];
        if (input.status === "PRESENT") {
          // Restore ACTIVE status if student was SUSPENDED
          const suspendedEnrollments = await prisma.enrollment.findMany({
            where: {
              studentId: input.studentId,
              classId: { in: targetClassIds },
              status: "SUSPENDED",
            },
            select: { id: true, studentId: true, classId: true },
          });
          for (const enr of suspendedEnrollments) {
            await unsuspendEnrollmentWithDebtClearance(prisma, {
              studentId: enr.studentId,
              classId: enr.classId,
              enrollmentId: enr.id,
              trigger: "ATTENDANCE",
              actorId: session.userId || "admin",
              actorName: session.userId || "Admin",
              excludeLessonIds: [input.lessonId],
              referenceDate: new Date(),
            });
          }
        } else if (input.status === "NOT_DEFINED") {
          // If student was SUSPENDED and the absence was justified, restore ACTIVE if consecutive unexcused absences are now < 4
          const [classLessons, studentAtts, studentCatchUps] = await Promise.all([
            prisma.lesson.findMany({
              where: { classId: lessonInfo.classId, isFree: false, isTeacherAbsent: false },
              select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
              orderBy: { startsAt: "asc" },
            }),
            prisma.attendance.findMany({
              where: {
                studentId: input.studentId,
                lesson: { classId: lessonInfo.classId },
              },
              select: { lessonId: true, status: true },
            }),
            prisma.catchUpAttendance.findMany({
              where: {
                studentId: input.studentId,
                missedLesson: { classId: lessonInfo.classId },
              },
              select: { missedLessonId: true },
            }),
          ]);

          const consecutiveAbsences = computeStudentConsecutiveAbsences({
            lessons: classLessons,
            attendances: studentAtts,
            catchUps: studentCatchUps,
          });

          if (consecutiveAbsences < 4) {
            const suspendedEnrollments = await prisma.enrollment.findMany({
              where: {
                studentId: input.studentId,
                classId: { in: targetClassIds },
                status: "SUSPENDED",
              },
              select: { id: true, studentId: true, classId: true },
            });
            for (const enr of suspendedEnrollments) {
              await unsuspendEnrollmentWithDebtClearance(prisma, {
                studentId: enr.studentId,
                classId: enr.classId,
                enrollmentId: enr.id,
                trigger: "ATTENDANCE",
                actorId: session.userId || "admin",
                actorName: session.userId || "Admin",
                excludeLessonIds: [input.lessonId],
                referenceDate: new Date(),
              });
            }
          }
        } else if (input.status === "ABSENT") {
          // Check for >= 4 consecutive absences (Rules 5 & 9)
          const [classLessons, studentAtts, studentCatchUps] = await Promise.all([
            prisma.lesson.findMany({
              where: { classId: lessonInfo.classId, isFree: false, isTeacherAbsent: false },
              select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
              orderBy: { startsAt: "asc" },
            }),
            prisma.attendance.findMany({
              where: {
                studentId: input.studentId,
                lesson: { classId: lessonInfo.classId },
              },
              select: { lessonId: true, status: true },
            }),
            prisma.catchUpAttendance.findMany({
              where: {
                studentId: input.studentId,
                missedLesson: { classId: lessonInfo.classId },
              },
              select: { missedLessonId: true },
            }),
          ]);

          const consecutiveAbsences = computeStudentConsecutiveAbsences({
            lessons: classLessons,
            attendances: studentAtts,
            catchUps: studentCatchUps,
          });

          if (consecutiveAbsences >= 4) {
            await prisma.enrollment.updateMany({
              where: {
                studentId: input.studentId,
                classId: lessonInfo.classId,
                status: "ACTIVE",
              },
              data: { status: "SUSPENDED" },
            });
          }
        }
      } catch (autoErr) {
        console.warn("Auto-suspension evaluation error in markSingleAttendance:", autoErr);
      }

      safeRevalidatePath("/admin");
      safeRevalidatePath("/list/attendance");
      const affectedClassIds = new Set<number>();
      if (lessonInfo?.classId) affectedClassIds.add(lessonInfo.classId);
      if (lessonInfo?.lessonGroups) {
        for (const lg of lessonInfo.lessonGroups) {
          affectedClassIds.add(lg.classId);
        }
      }
      for (const cId of affectedClassIds) {
        safeRevalidatePath(`/list/attendance/class/${cId}`);
        safeRevalidatePath(`/list/payments/class/${cId}`);
        safeRevalidatePath(`/list/formations/${cId}`);
      }
      if (affectedClassIds.size > 0) {
        safeRevalidatePath("/list/formations");
      }
      safeRevalidatePath(`/list/students/${input.studentId}`);
    }

    return {
      success: true,
      error: false,
      message:
        input.status === "PRESENT"
          ? "Présence marquée / تم تسجيل الحضور"
          : input.status === "ABSENT"
          ? "Absence marquée / تم تسجيل الغياب"
          : "Statut mis à jour / تم تحديث الحالة",
    };
  } catch (err: any) {
    console.error("markSingleAttendanceAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Échec de l'enregistrement / فشل في حفظ الحضور",
    };
  }
};

export const deleteSingleAttendanceAction = async (input: {
  lessonId: number;
  studentId: string;
}) => {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح" };
    }

    const lessonInfo = await prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: {
        branchId: true,
        classroomId: true,
        teacherId: true,
        classId: true,
        classroom: { select: { branchId: true } },
        lessonGroups: { select: { classId: true } },
      },
    });

    if (!lessonInfo) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    const attendanceBranchId = lessonInfo.branchId || lessonInfo.classroom?.branchId;
    const isTeacherOfLesson = session.rawRole === "teacher" && lessonInfo.teacherId === session.userId;
    const hasBranchPermission =
      session.isOwner ||
      isTeacherOfLesson ||
      canUserAccessBranch(session.rawRole, session.branchIds, attendanceBranchId);

    if (!hasBranchPermission) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé pour ce siège / غير مصرح لك بتسجيل الحضور لهذا الفرع.",
      };
    }

    const adminId = session.userId || session.rawRole || "admin";

    await prisma.$transaction(async (tx) => {
      await tx.attendance.deleteMany({
        where: { lessonId: input.lessonId, studentId: input.studentId },
      });

      await tx.auditLog.create({
        data: {
          action: "ATTENDANCE_DELETED",
          entityType: "Attendance",
          entityId: `${input.lessonId}_${input.studentId}`,
          userId: adminId,
          userName: adminId,
          details: JSON.stringify({
            lessonId: input.lessonId,
            studentId: input.studentId,
            adminId,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    });

    if (lessonInfo) {
      safeRevalidatePath("/admin");
      safeRevalidatePath("/list/attendance");
      const affectedClassIds = new Set<number>();
      if (lessonInfo.classId) affectedClassIds.add(lessonInfo.classId);
      if (lessonInfo.lessonGroups) {
        for (const lg of lessonInfo.lessonGroups) {
          affectedClassIds.add(lg.classId);
        }
      }
      for (const cId of affectedClassIds) {
        safeRevalidatePath(`/list/attendance/class/${cId}`);
        safeRevalidatePath(`/list/payments/class/${cId}`);
        safeRevalidatePath(`/list/formations/${cId}`);
      }
      if (affectedClassIds.size > 0) {
        safeRevalidatePath("/list/formations");
      }
      safeRevalidatePath(`/list/students/${input.studentId}`);
    }

    return {
      success: true,
      error: false,
      message: "Présence réinitialisée / تم إلغاء تسجيل الحضور",
    };
  } catch (err: any) {
    console.error("deleteSingleAttendanceAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Échec de la réinitialisation / فشل في إلغاء الحضور",
    };
  }
};

/**
 * Search students who are NOT enrolled in the current lesson's class,
 * and fetch their uncaught-up missed lessons (Attendance status = 'ABSENT' in their own classes).
 */
function getArabicSearchVariants(word: string): string[] {
  const base = word.replace(/[\u064B-\u065F\u0670]/g, "").trim();
  if (!base) return [];

  const variants = new Set<string>();
  variants.add(base);

  // If word contains alef variants, add bare alef and hamza variants
  if (/[اأإآٱ]/.test(base)) {
    const bare = base.replace(/[أإآٱ]/g, "ا");
    variants.add(bare);
    if (/^[اأإآٱ]/.test(base)) {
      const rest = base.slice(1);
      variants.add("أ" + rest);
      variants.add("إ" + rest);
      variants.add("آ" + rest);
      variants.add("ا" + rest);
    }
  }

  // Taa marbuta / Haa variants at end of word
  if (/[ةه]$/.test(base)) {
    variants.add(base.replace(/ة$/, "ه"));
    variants.add(base.replace(/ه$/, "ة"));
  }

  // Yaa / Alef maqsura at end of word
  if (/[يى]$/.test(base)) {
    variants.add(base.replace(/ي$/, "ى"));
    variants.add(base.replace(/ى$/, "ي"));
  }

  return Array.from(variants);
}

/**
 * Search students who are NOT enrolled in the current lesson's class,
 * and fetch their uncaught-up missed lessons (Attendance status = 'ABSENT' in their own classes).
 */
export async function searchCatchUpCandidatesAction(
  currentLessonId: number,
  searchQuery: string
) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "غير مصرح لك.", candidates: [] };
    }

    const currentLesson = await prisma.lesson.findUnique({
      where: { id: currentLessonId },
      select: {
        id: true,
        classId: true,
        branchId: true,
        startsAt: true,
        teacherId: true,
        class: {
          select: {
            id: true,
            teacherId: true,
            levelId: true,
            formationLevelId: true,
            isFormation: true,
            name: true,
          },
        },
      },
    });

    if (!currentLesson) {
      return { success: false, error: true, message: "الحصة غير موجودة.", candidates: [] };
    }

    const targetTeacherId = currentLesson.teacherId || currentLesson.class?.teacherId;
    const targetLevelId = currentLesson.class?.levelId;
    const targetFormationLevelId = currentLesson.class?.formationLevelId;
    const isFormation = Boolean(currentLesson.class?.isFormation);

    if (!targetTeacherId || (!targetLevelId && !targetFormationLevelId)) {
      return { success: true, candidates: [] };
    }

    // Find all active groups with the SAME teacher and SAME level
    const matchingClasses = await prisma.class.findMany({
      where: {
        teacherId: targetTeacherId,
        isCompleted: false,
        ...(isFormation
          ? { isFormation: true, formationLevelId: targetFormationLevelId }
          : { isFormation: false, levelId: targetLevelId }),
      },
      select: { id: true, name: true },
    });
    const matchingClassIds = matchingClasses.map((c) => c.id);

    if (matchingClassIds.length === 0) {
      return { success: true, candidates: [] };
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return { success: true, candidates: [] };
    }

    const cleanNumeric = trimmedQuery.replace(/[^0-9]/g, "");
    const hasNumeric = cleanNumeric.length > 0;
    const tokens = trimmedQuery.split(/\s+/).filter(Boolean);

    const searchConditions: any[] = [];

    // 1. Direct name phrase match
    searchConditions.push({ name: { contains: trimmedQuery, mode: "insensitive" } });

    // 2. Multi-word name match with Arabic letter tolerance
    if (tokens.length > 1) {
      const tokenConditions = tokens.map((tok) => {
        const variants = getArabicSearchVariants(tok);
        if (variants.length <= 1) {
          return { name: { contains: tok, mode: "insensitive" as const } };
        }
        return {
          OR: variants.map((v) => ({ name: { contains: v, mode: "insensitive" as const } })),
        };
      });
      searchConditions.push({ AND: tokenConditions });
    } else if (tokens.length === 1) {
      const singleVariants = getArabicSearchVariants(tokens[0]);
      if (singleVariants.length > 1) {
        searchConditions.push({
          OR: singleVariants.map((v) => ({ name: { contains: v, mode: "insensitive" as const } })),
        });
      }
    }

    // 3. Numeric matches: ID / globalNumber or phone
    if (hasNumeric) {
      const numVal = parseInt(cleanNumeric, 10);
      if (!isNaN(numVal) && numVal > 0 && numVal <= 2147483647) {
        searchConditions.push({ globalNumber: numVal });
      }
      if (cleanNumeric.length >= 2) {
        searchConditions.push({ phone: { contains: cleanNumeric } });
      }
    } else {
      searchConditions.push({ phone: { contains: trimmedQuery } });
    }

    // Search students matching query who are enrolled in a group of the SAME TEACHER and SAME LEVEL
    const students = await prisma.student.findMany({
      where: {
        AND: [
          { OR: searchConditions },
          {
            enrollments: {
              some: {
                classId: { in: matchingClassIds },
                status: "ACTIVE",
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        globalNumber: true,
        phone: true,
        payerStatus: true,
        registeredBranch: {
          select: { name: true },
        },
        attendances: {
          where: {
            lessonId: { not: currentLessonId },
            lesson: {
              classId: { in: matchingClassIds },
            },
          },
          select: {
            id: true,
            lessonId: true,
            status: true,
            lesson: {
              select: {
                id: true,
                startsAt: true,
                class: {
                  select: { id: true, name: true },
                },
                teacher: {
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: {
            lesson: {
              startsAt: "desc",
            },
          },
          take: 30,
        },
        family: true,
        vouchers: {
          where: {
            isVoided: false,
            paymentType: "TUITION_4SESSION",
          },
          include: {
            refunds: true,
          },
        },
        catchUpAttendances: {
          select: {
            missedLessonId: true,
            missedLesson: {
              select: { classId: true },
            },
          },
        },
        enrollments: {
          where: {
            classId: { in: matchingClassIds },
            class: {
              isCompleted: false,
            },
          },
          select: {
            payerStatus: true,
            creditResetOffset: true,
            transfersFrom: true,
            transfersTo: true,
            class: {
              select: {
                id: true,
                name: true,
                pricePerCycle: true,
                isFormation: true,
                teacher: {
                  select: {
                    id: true,
                    name: true,
                    TeacherPayRate: {
                      orderBy: { effectiveFrom: "desc" },
                      take: 1,
                    },
                  },
                },
                teacherClassRates: true,
                lessons: {
                  where: {
                    id: { not: currentLessonId },
                    isFree: false,
                  },
                  select: {
                    id: true,
                    startsAt: true,
                    endsAt: true,
                    isExtra: true,
                    isCatchUp: true,
                    isFree: true,
                  },
                  orderBy: {
                    startsAt: "desc",
                  },
                  take: 30,
                },
              },
            },
          },
        },
      },
      take: 25,
    });

    // Resolve upcoming recurring lesson instances for enrolled classes so that
    // students can attend in advance (anticipatory catch-up) without requiring the admin
    // to open the other group's attendance roster first.
    const currentWeekBounds = getAlgiersWeekBounds(0, currentLesson.startsAt);
    const nextWeekBounds = getAlgiersWeekBounds(1, currentLesson.startsAt);
    const currentLessonDateStr = getAlgiersDateInfo(currentLesson.startsAt).dateStr;

    const resolvedSlotKeys = new Set<string>();
    const classesToCheck = new Map<number, any>();
    for (const s of students) {
      for (const enr of s.enrollments || []) {
        if (enr.class && !classesToCheck.has(enr.class.id)) {
          classesToCheck.set(enr.class.id, enr.class);
        }
      }
    }

    for (const [classId, cls] of classesToCheck.entries()) {
      const classLessons = cls.lessons || [];
      const recurringTemplates = classLessons.filter(
        (l: any) => !l.isExtra && !l.isCatchUp && !l.isFree
      );

      for (const tmpl of recurringTemplates) {
        const tmplInfo = getAlgiersDateInfo(tmpl.startsAt);
        const thisWeekDateStr = currentWeekBounds.dayDates[tmplInfo.weekday];
        const nextWeekDateStr = nextWeekBounds.dayDates[tmplInfo.weekday];

        const targetDates: string[] = [];
        if (thisWeekDateStr && thisWeekDateStr >= currentLessonDateStr) {
          targetDates.push(thisWeekDateStr);
        }
        if (nextWeekDateStr) {
          targetDates.push(nextWeekDateStr);
        }

        for (const tDate of targetDates) {
          const slotKey = `${classId}-${tDate}-${tmplInfo.timeStr}`;
          if (resolvedSlotKeys.has(slotKey)) continue;
          resolvedSlotKeys.add(slotKey);

          const alreadyInClass = classLessons.some((l: any) => {
            const lInfo = getAlgiersDateInfo(l.startsAt);
            return lInfo.dateStr === tDate && lInfo.timeStr === tmplInfo.timeStr;
          });

          if (!alreadyInClass) {
            try {
              const newLessonId = await resolveOrCreateLessonForDate(tmpl.id, tDate);
              const newlyCreated = await prisma.lesson.findUnique({
                where: { id: newLessonId },
                select: {
                  id: true,
                  startsAt: true,
                  endsAt: true,
                  isExtra: true,
                  isCatchUp: true,
                  isFree: true,
                },
              });
              if (newlyCreated && !classLessons.some((l: any) => l.id === newlyCreated.id)) {
                classLessons.push(newlyCreated);
              }
            } catch (err) {
              console.warn(`Could not resolve recurring lesson for class ${classId} on ${tDate}:`, err);
            }
          }
        }
      }
    }

    // Collect eligible lessons for each student:
    // 1. Past uncompensated absences (status: "ABSENT" and not caught up)
    // 2. Upcoming / unrecorded lessons of their enrolled classes (anticipatory catch-up before absence is marked)
    const candidates = students.map((s) => {
      const alreadyCaughtUpLessonIds = new Set(s.catchUpAttendances.map((c) => c.missedLessonId));
      const studentAttendanceMap = new Map(s.attendances.map((a) => [a.lessonId, a]));
      const seenLessonIds = new Set<number>();

      const isSiblingDiscount = Boolean(s.family?.payerStudentId && s.family.payerStudentId !== s.id);
      const siblingDiscountPct = isSiblingDiscount ? Number((s.family as any)?.discountPercentage ?? 50) : 0;
      const isSiblingWaived100 = siblingDiscountPct >= 100;

      // Precalculate credit per enrolled class
      const classCreditsMap = new Map<number, number>();
      (s.enrollments || []).forEach((enr: any) => {
        const cls = enr.class;
        const vTuition = (s.vouchers || []).filter(
          (v: any) => v.classId === cls.id || !v.classId
        );
        const vAtts = (s.attendances || []).filter((a: any) => a.lesson.class.id === cls.id);
        const vCatchUps = (s.catchUpAttendances || []).filter(
          (cu: any) => cu.missedLesson?.classId === cls.id
        );
        const teacherClassOverride = (cls.teacherClassRates as any[])?.find(
          (tcr: any) => tcr.teacherId === cls.teacher?.id
        )?.percentage;
        const teacherPercentage = teacherClassOverride != null
          ? Number(teacherClassOverride)
          : cls.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee
            ? Number(cls.teacher.TeacherPayRate[0].percentageOfSessionFee)
            : null;
        const metrics = computeStudentCreditAndSessions({
          pricePerCycle: Number(cls.pricePerCycle || 0),
          isFormation: Boolean(cls.isFormation),
          payerStatus: enr.payerStatus || s.payerStatus || "NORMAL",
          siblingDiscountPercentage: siblingDiscountPct,
          isSiblingWaived: isSiblingWaived100,
          tuitionVouchers: vTuition,
          transfersIn: enr.transfersTo || [],
          transfersOut: enr.transfersFrom || [],
          creditResetOffset: Number(enr.creditResetOffset || 0),
          attendances: vAtts,
          catchUps: vCatchUps,
          teacherPercentage,
        });
        classCreditsMap.set(cls.id, Math.max(metrics.netSessions, metrics.transferableSessions));
      });

      const eligiblePastLessons: Array<{
        attendanceId: number | null;
        lessonId: number;
        classId: number;
        className: string;
        teacherName: string;
        startsAt: Date | string;
        isUpcoming: boolean;
        remainingCredits: number | null;
      }> = [];

      // 1. Existing marked absences
      s.attendances.forEach((a) => {
        if (
          (a.status === "ABSENT" || a.status === "NOT_DEFINED") &&
          !alreadyCaughtUpLessonIds.has(a.lessonId) &&
          a.lessonId !== currentLessonId &&
          !seenLessonIds.has(a.lessonId)
        ) {
          seenLessonIds.add(a.lessonId);
          const clsId = a.lesson.class.id;
          eligiblePastLessons.push({
            attendanceId: a.id,
            lessonId: a.lesson.id,
            classId: clsId,
            className: a.lesson.class.name,
            teacherName: a.lesson.teacher?.name || "",
            startsAt: a.lesson.startsAt,
            isUpcoming: false,
            remainingCredits: classCreditsMap.get(clsId) ?? null,
          });
        }
      });

      // 2. Upcoming / unrecorded lessons from enrolled classes
      const eligibleUpcomingLessons: Array<{
        attendanceId: number | null;
        lessonId: number;
        classId: number;
        className: string;
        teacherName: string;
        startsAt: Date | string;
        isUpcoming: boolean;
        remainingCredits: number | null;
      }> = [];

      (s.enrollments || []).forEach((enr) => {
        const cls = enr.class;
        (cls.lessons || []).forEach((l) => {
          if (
            l.id !== currentLessonId &&
            !alreadyCaughtUpLessonIds.has(l.id) &&
            !seenLessonIds.has(l.id)
          ) {
            const att = studentAttendanceMap.get(l.id);
            // If already marked PRESENT, they attended this class so no catch-up needed
            if (att?.status === "PRESENT") return;

            seenLessonIds.add(l.id);
            eligibleUpcomingLessons.push({
              attendanceId: att?.id || null,
              lessonId: l.id,
              classId: cls.id,
              className: cls.name,
              teacherName: cls.teacher?.name || "",
              startsAt: l.startsAt,
              isUpcoming: true,
              remainingCredits: classCreditsMap.get(cls.id) ?? null,
            });
          }
        });
      });

      // Sort upcoming lessons so the closest future lesson (e.g. next Monday) is first
      eligibleUpcomingLessons.sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      );

      const combinedLessons = [...eligiblePastLessons, ...eligibleUpcomingLessons];

      return {
        id: s.id,
        name: s.name,
        globalNumber: s.globalNumber,
        phone: s.phone,
        branchName: s.registeredBranch?.name || null,
        remainingCredits: classCreditsMap.size > 0 ? Array.from(classCreditsMap.values())[0] : null,
        isEnrolledInCurrentClass: (s.enrollments || []).some((e: any) => e.class?.id === currentLesson.classId),
        missedLessons: combinedLessons,
      };
    });

    // Smart ranking:
    // 1. Students WITH eligible lessons first!
    // 2. Exact globalNumber match at the top
    // 3. Name starts with search query
    // 4. Higher number of missed/eligible lessons first
    const lowerQuery = trimmedQuery.toLowerCase();
    const queryNum = hasNumeric ? parseInt(cleanNumeric, 10) : null;

    candidates.sort((a, b) => {
      const aHas = a.missedLessons.length > 0 ? 1 : 0;
      const bHas = b.missedLessons.length > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;

      if (queryNum !== null) {
        const aExact = a.globalNumber === queryNum ? 1 : 0;
        const bExact = b.globalNumber === queryNum ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
      }

      const aStarts = a.name.toLowerCase().startsWith(lowerQuery) ? 1 : 0;
      const bStarts = b.name.toLowerCase().startsWith(lowerQuery) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;

      if (a.missedLessons.length !== b.missedLessons.length) {
        return b.missedLessons.length - a.missedLessons.length;
      }

      return a.name.localeCompare(b.name);
    });

    return { success: true, candidates };
  } catch (error: any) {
    console.error("Error in searchCatchUpCandidatesAction:", error);
    return { success: false, error: true, message: error.message || "فشل البحث عن التلاميذ.", candidates: [] };
  }
}

/**
 * Record a CatchUpAttendance for a visiting student (§2.12).
 * Does NOT decrement session credit, does NOT require payment in this host class,
 * and leaves the original missed lesson record as ABSENT.
 * Can happen BEFORE the absence is marked (e.g. student visits Saturday because they will miss Monday).
 */
export async function recordCatchUpAttendanceAction(data: {
  catchUpLessonId: number;
  studentId: string;
  missedLessonId: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "غير مصرح لك." };
    }

    const { catchUpLessonId, studentId, missedLessonId } = data;

    // Verify catch-up lesson exists
    const catchUpLesson = await prisma.lesson.findUnique({
      where: { id: catchUpLessonId },
      include: { class: true },
    });

    if (!catchUpLesson) {
      return { success: false, error: true, message: "الحصة الحالية غير موجودة." };
    }

    // Verify missed lesson exists
    const missedLesson = await prisma.lesson.findUnique({
      where: { id: missedLessonId },
      include: { class: true },
    });

    if (!missedLesson) {
      return { success: false, error: true, message: "الحصة المطلوب استدراكها غير موجودة." };
    }

    if (missedLessonId === catchUpLessonId) {
      return {
        success: false,
        error: true,
        message: "لا يمكن استدراك الحصة بنفس الحصة / Impossible de rattraper une séance par elle-même.",
      };
    }

    // Verify both groups have the SAME TEACHER
    const catchUpTeacherId = catchUpLesson.teacherId || catchUpLesson.class?.teacherId;
    const missedTeacherId = missedLesson.teacherId || missedLesson.class?.teacherId;

    if (!catchUpTeacherId || !missedTeacherId || catchUpTeacherId !== missedTeacherId) {
      return {
        success: false,
        error: true,
        message: "الاستدراك متاح فقط بين الأفواج التي يدرّسها نفس الأستاذ / Le rattrapage est réservé aux groupes du même enseignant.",
      };
    }

    // Verify both groups have the SAME LEVEL
    const catchUpIsFormation = Boolean(catchUpLesson.class?.isFormation);
    const missedIsFormation = Boolean(missedLesson.class?.isFormation);

    if (catchUpIsFormation !== missedIsFormation) {
      return {
        success: false,
        error: true,
        message: "لا يمكن الاستدراك بين فوج نظامي وفوج تكوين / Impossible de rattraper entre une classe régulière et une formation.",
      };
    }

    if (catchUpIsFormation) {
      if (catchUpLesson.class?.formationLevelId !== missedLesson.class?.formationLevelId) {
        return {
          success: false,
          error: true,
          message: "الاستدراك متاح فقط بين أفواج نفس المستوى / Le rattrapage est réservé aux groupes du même niveau.",
        };
      }
    } else {
      if (catchUpLesson.class?.levelId !== missedLesson.class?.levelId) {
        return {
          success: false,
          error: true,
          message: "الاستدراك متاح فقط بين أفواج نفس المستوى / Le rattrapage est réservé aux groupes du même niveau.",
        };
      }
    }

    // Verify student is enrolled in missedLesson's class
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId,
        classId: missedLesson.classId,
      },
    });

    if (!enrollment) {
      return {
        success: false,
        error: true,
        message: "التلميذ غير مسجل في فوج الحصة المطلوب استدراكها.",
      };
    }

    // Check if already caught up (§2.12: a student can only catch up a given missed lesson once)
    const existingCatchUp = await prisma.catchUpAttendance.findUnique({
      where: {
        studentId_missedLessonId: {
          studentId,
          missedLessonId,
        },
      },
    });

    if (existingCatchUp) {
      return {
        success: false,
        error: true,
        message: "تم تعويض هذه الحصة مسبقاً ولا يمكن تعويضها مرة أخرى.",
      };
    }

    // Check if student was already marked PRESENT in missedLesson
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        lessonId: missedLessonId,
        studentId,
      },
    });

    if (existingAttendance && existingAttendance.status === "PRESENT") {
      return {
        success: false,
        error: true,
        message: "التلميذ مسجل كحاضر في هذه الحصة، ولا يمكن تسجيل استدراك لها.",
      };
    }

    // Automatically detect if this is an anticipatory (before absence) or post-absence (after absence) catch-up
    const isBeforeAbsence = new Date(catchUpLesson.startsAt).getTime() < new Date(missedLesson.startsAt).getTime();
    const recordedBy = session.userId || session.rawRole || "admin";

    await prisma.$transaction(async (tx) => {
      // 1. If no attendance record exists yet for the missed lesson (e.g. anticipatory catch-up),
      // create one as ABSENT so it displays as an absence/catch-up on the group's attendance page
      if (!existingAttendance) {
        await tx.attendance.create({
          data: {
            studentId,
            lessonId: missedLessonId,
            status: "ABSENT",
            justification: isBeforeAbsence ? "استدراك مسبق" : "استدراك لغياب سابق",
          },
        });
      }

      // 2. If catching up in the same group, ensure attendance for catchUpLessonId is marked PRESENT
      if (missedLesson.classId === catchUpLesson.classId) {
        const catchUpAtt = await tx.attendance.findFirst({
          where: { lessonId: catchUpLessonId, studentId },
        });
        if (!catchUpAtt) {
          await tx.attendance.create({
            data: {
              studentId,
              lessonId: catchUpLessonId,
              status: "PRESENT",
              justification: null,
            },
          });
        } else if (catchUpAtt.status !== "PRESENT") {
          await tx.attendance.update({
            where: { id: catchUpAtt.id },
            data: { status: "PRESENT", justification: null },
          });
        }
      }

      // 3. Create the CatchUpAttendance record
      await tx.catchUpAttendance.create({
        data: {
          studentId,
          missedLessonId,
          catchUpLessonId,
          recordedBy,
          recordedAt: new Date(),
        },
      });
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath(`/list/attendance/take/${catchUpLessonId}`);
    safeRevalidatePath(`/list/attendance/take/${missedLessonId}`);
    safeRevalidatePath(`/list/attendance/class/${missedLesson.classId}`);
    safeRevalidatePath(`/list/attendance/class/${catchUpLesson.classId}`);
    safeRevalidatePath(`/list/payments/class/${missedLesson.classId}`);
    safeRevalidatePath(`/list/students/${studentId}`);

    const isSameGroup = missedLesson.classId === catchUpLesson.classId;
    return {
      success: true,
      error: false,
      message: isSameGroup
        ? "تم تسجيل الاستدراك بنجاح وخصم حصة واحدة فقط."
        : isBeforeAbsence
        ? "تم تسجيل الاستدراك المسبق بنجاح وخصم حصة واحدة فقط."
        : "تم تسجيل حضور التلميذ في الاستدراك بنجاح وخصم حصة واحدة فقط دون مضاعفة الدفع للأستاذ.",
    };
  } catch (error: any) {
    console.error("Error in recordCatchUpAttendanceAction:", error);
    return {
      success: false,
      error: true,
      message: error.message || "فشل تسجيل حضور الاستدراك.",
    };
  }
}

/**
 * Remove a CatchUpAttendance record if added by mistake.
 */
export async function removeCatchUpAttendanceAction(
  catchUpAttendanceId: number,
  catchUpLessonId: number
) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "غير مصرح لك." };
    }

    const catchUpRecord = await prisma.catchUpAttendance.findUnique({
      where: { id: catchUpAttendanceId },
      include: { missedLesson: true },
    });

    if (!catchUpRecord) {
      return { success: false, error: true, message: "سجل الاستدراك غير موجود." };
    }

    const { missedLessonId, studentId, missedLesson } = catchUpRecord;

    await prisma.$transaction(async (tx) => {
      await tx.catchUpAttendance.delete({
        where: { id: catchUpAttendanceId },
      });

      // If the missed lesson is in the future (startsAt > now), and there were no other attendances taken for it,
      // clean up the placeholder attendance record
      if (missedLesson && missedLesson.startsAt > new Date()) {
        const otherAttendancesCount = await tx.attendance.count({
          where: {
            lessonId: missedLessonId,
            studentId: { not: studentId },
          },
        });
        if (otherAttendancesCount === 0) {
          await tx.attendance.deleteMany({
            where: {
              lessonId: missedLessonId,
              studentId,
            },
          });
        }
      }
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath(`/list/attendance/take/${catchUpLessonId}`);
    safeRevalidatePath(`/list/attendance/take/${missedLessonId}`);
    if (missedLesson) {
      safeRevalidatePath(`/list/attendance/class/${missedLesson.classId}`);
      safeRevalidatePath(`/list/payments/class/${missedLesson.classId}`);
    }
    safeRevalidatePath(`/list/students/${studentId}`);

    return {
      success: true,
      error: false,
      message: "تم إلغاء تسجيل زائر الاستدراك بنجاح.",
    };
  } catch (error: any) {
    console.error("Error in removeCatchUpAttendanceAction:", error);
    return {
      success: false,
      error: true,
      message: error.message || "فشل إلغاء تسجيل الاستدراك.",
    };
  }
}

// =================================================================
// STUDENT RAPID ENROLLMENT & DUPLICATE PROTECTION ACTIONS
// =================================================================

/**
 * Checks if any existing student has the same first name, surname, phone, or birthday.
 * Uses smart Arabic and Latin normalization, token-set matching, compound prefix resolution,
 * phone number normalization, and birthday comparison.
 */
export async function checkStudentDuplicateAction({
  name,
  surname,
  phone,
  parentPhoneNumbers,
  birthday,
  excludeStudentId,
}: {
  name: string;
  surname: string;
  phone?: string | null;
  parentPhoneNumbers?: string[] | null;
  birthday?: string | Date | null;
  excludeStudentId?: string;
}): Promise<{
  hasDuplicate: boolean;
  isExact: boolean;
  duplicates: DuplicateStudentCandidate[];
}> {
  try {
    const cleanName = name ? name.trim() : "";
    const cleanSurname = surname ? surname.trim() : "";
    const normFirst = normalizeStudentName(cleanName);
    const normLast = normalizeStudentName(cleanSurname);
    const cleanPhone = cleanPhoneNumber(phone);
    const cleanParentPhones = (parentPhoneNumbers || [])
      .map(cleanPhoneNumber)
      .filter((p) => p.length >= 8);

    const hasNameInput = normFirst.length >= 2 || normLast.length >= 2;
    const hasPhoneInput = cleanPhone.length >= 8 || cleanParentPhones.length > 0;

    if (!hasNameInput && !hasPhoneInput) {
      return { hasDuplicate: false, isExact: false, duplicates: [] };
    }

    // Build targeted conditions to pull candidate pool without getting truncated by common names
    const orClauses: any[] = [];

    // Clause 1: High-specificity name match (contains both surname AND name)
    if (cleanSurname.length >= 2 && cleanName.length >= 2) {
      orClauses.push({
        AND: [
          { name: { contains: cleanSurname, mode: "insensitive" } },
          { name: { contains: cleanName, mode: "insensitive" } },
        ],
      });
    }

    // Clause 2: Distinctive tokens for compound names (e.g. "Ben Ali", "Abd El Kader", "Ait Ahmed")
    const surnameTokens = tokenizeStudentName(cleanSurname).filter((t) => t.length >= 3);
    const nameTokens = tokenizeStudentName(cleanName).filter((t) => t.length >= 3);

    for (const st of surnameTokens) {
      for (const nt of nameTokens) {
        orClauses.push({
          AND: [
            { name: { contains: st, mode: "insensitive" } },
            { name: { contains: nt, mode: "insensitive" } },
          ],
        });
      }
    }

    // Clause 3: Fallback single surname search (if surname is distinctive >= 3 chars)
    if (cleanSurname.length >= 3) {
      orClauses.push({
        name: { contains: cleanSurname, mode: "insensitive" },
      });
    }

    // Clause 4: Fallback single first name search if surname is missing/short
    if (cleanSurname.length < 3 && cleanName.length >= 3) {
      orClauses.push({
        name: { contains: cleanName, mode: "insensitive" },
      });
    }

    // Clause 5: Phone match
    if (cleanPhone.length >= 8) {
      const phoneTail = cleanPhone.slice(-8);
      orClauses.push({ phone: { contains: phoneTail } });
      orClauses.push({
        parentPhoneNumbers: { some: { phone: { contains: phoneTail } } },
      });
    }

    // Clause 6: Parent phone matches
    for (const pp of cleanParentPhones) {
      const ppTail = pp.slice(-8);
      orClauses.push({ phone: { contains: ppTail } });
      orClauses.push({
        parentPhoneNumbers: { some: { phone: { contains: ppTail } } },
      });
    }

    if (orClauses.length === 0) {
      return { hasDuplicate: false, isExact: false, duplicates: [] };
    }

    const candidates = await prisma.student.findMany({
      where: {
        AND: [
          excludeStudentId ? { id: { not: excludeStudentId } } : {},
          { OR: orClauses },
        ],
      },
      include: {
        registeredBranch: { select: { name: true } },
        enrollments: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
        parentPhoneNumbers: { select: { phone: true } },
      },
      take: 60,
    });

    const evaluatedDuplicates: DuplicateStudentCandidate[] = [];
    let isExactFound = false;

    for (const cand of candidates) {
      const match = evaluateDuplicateMatch({
        targetName: cleanName,
        targetSurname: cleanSurname,
        targetPhone: phone,
        targetParentPhones: cleanParentPhones,
        targetBirthday: birthday ? String(birthday) : undefined,
        candidate: cand,
      });

      if (match) {
        if (match.isExactName) isExactFound = true;
        evaluatedDuplicates.push(match);
      }
    }

    // Sort by highest similarity / relevance first
    evaluatedDuplicates.sort((a, b) => b.similarityScore - a.similarityScore);

    return {
      hasDuplicate: evaluatedDuplicates.length > 0,
      isExact: isExactFound,
      duplicates: evaluatedDuplicates.slice(0, 5),
    };
  } catch (err) {
    console.error("checkStudentDuplicateAction error:", err);
    return { hasDuplicate: false, isExact: false, duplicates: [] };
  }
}

/**
 * Fast search for existing registered students to enroll in a group.
 */
export async function searchStudentsForEnrollmentAction({
  query,
  classId,
}: {
  query: string;
  classId: number;
}): Promise<{
  success: boolean;
  candidates: Array<{
    id: string;
    globalNumber: number;
    name: string;
    phone: string | null;
    branchName: string;
    classes: string[];
    isAlreadyEnrolled: boolean;
    transferableInfo?: {
      fromEnrollmentId: number;
      fromClassId: number;
      fromClassName: string;
      transferableSessions: number;
      openEndedHeldSessions: number;
    } | null;
  }>;
  message?: string;
}> {
  try {
    const trimmed = query ? query.trim() : "";
    if (!trimmed) {
      return { success: true, candidates: [] };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, levelId: true, formationLevelId: true, isFormation: true },
    });

    const isNumeric = !isNaN(Number(trimmed));

    const students = await prisma.student.findMany({
      where: {
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          ...(isNumeric ? [{ globalNumber: Number(trimmed) }] : []),
          { phone: { contains: trimmed } },
        ],
      },
      include: {
        registeredBranch: { select: { name: true } },
        family: true,
        vouchers: {
          where: { isVoided: false, isRefund: false, paymentType: "TUITION_4SESSION" },
          include: { refunds: true },
        },
        attendances: {
          where: { lesson: { isFree: false } },
          select: {
            lessonId: true,
            status: true,
            lesson: {
              select: {
                id: true,
                startsAt: true,
                isFree: true,
                isTeacherAbsent: true,
                classId: true,
              },
            },
          },
        },
        catchUpAttendances: {
          select: {
            missedLessonId: true,
            catchUpLessonId: true,
            missedLesson: { select: { classId: true } },
          },
        },
        enrollments: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                levelId: true,
                formationLevelId: true,
                pricePerCycle: true,
                isFormation: true,
                teacherId: true,
                teacher: {
                  select: {
                    id: true,
                    TeacherPayRate: {
                      orderBy: { effectiveFrom: "desc" },
                      take: 1,
                    },
                  },
                },
                teacherClassRates: true,
              },
            },
            transfersFrom: true,
            transfersTo: true,
          },
        },
      },
      take: 15,
      orderBy: { name: "asc" },
    });

    const candidates = students.map((s) => {
      const isSiblingDiscount = Boolean(s.family?.payerStudentId && s.family.payerStudentId !== s.id);
      const siblingDiscountPct = isSiblingDiscount ? Number((s.family as any)?.discountPercentage ?? 50) : 0;
      const isSiblingWaived100 = siblingDiscountPct >= 100;

      let bestTransfer: {
        fromEnrollmentId: number;
        fromClassId: number;
        fromClassName: string;
        transferableSessions: number;
        openEndedHeldSessions: number;
      } | null = null;

      if (targetClass) {
        for (const enr of s.enrollments || []) {
          if (enr.class.id === classId) continue;
          if (enr.status === "TRANSFERRED" || enr.status === "UNENROLLED") continue;

          const isSameLevel = targetClass.isFormation
            ? Boolean(enr.class.isFormation && enr.class.formationLevelId === targetClass.formationLevelId)
            : Boolean(!enr.class.isFormation && enr.class.levelId === targetClass.levelId);

          if (!isSameLevel) continue;

          const cls = enr.class;
          const vTuition = (s.vouchers || []).filter((v: any) => v.classId === cls.id || !v.classId);
          const vAtts = (s.attendances || []).filter((a: any) => a.lesson.classId === cls.id);
          const vCatchUps = (s.catchUpAttendances || []).filter(
            (cu: any) => cu.missedLesson?.classId === cls.id
          );

          const teacherId = cls.teacherId || cls.teacher?.id;
          const teacherClassOverride = (cls.teacherClassRates as any[])?.find(
            (tcr: any) => tcr.teacherId === teacherId
          )?.percentage;
          const teacherPercentage = teacherClassOverride != null
            ? Number(teacherClassOverride)
            : cls.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee
              ? Number(cls.teacher.TeacherPayRate[0].percentageOfSessionFee)
              : null;

          const metrics = computeStudentCreditAndSessions({
            pricePerCycle: Number(cls.pricePerCycle || 0),
            isFormation: Boolean(cls.isFormation),
            payerStatus: enr.payerStatus || s.payerStatus || "NORMAL",
            siblingDiscountPercentage: siblingDiscountPct,
            isSiblingWaived: isSiblingWaived100,
            tuitionVouchers: vTuition,
            transfersIn: enr.transfersTo || [],
            transfersOut: enr.transfersFrom || [],
            creditResetOffset: Number(enr.creditResetOffset || 0),
            attendances: vAtts,
            catchUps: vCatchUps,
            teacherPercentage,
          });

          if (metrics.transferableSessions > 0) {
            if (!bestTransfer || metrics.transferableSessions > bestTransfer.transferableSessions) {
              bestTransfer = {
                fromEnrollmentId: enr.id,
                fromClassId: cls.id,
                fromClassName: cls.name,
                transferableSessions: metrics.transferableSessions,
                openEndedHeldSessions: metrics.openEndedHeldSessions,
              };
            }
          }
        }
      }

      return {
        id: s.id,
        globalNumber: s.globalNumber,
        name: s.name,
        phone: s.phone,
        branchName: s.registeredBranch?.name || "Siège",
        classes: s.enrollments.map((e) => e.class.name),
        isAlreadyEnrolled: s.enrollments.some((e) => e.class.id === classId),
        transferableInfo: bestTransfer,
      };
    });

    return { success: true, candidates };
  } catch (err: any) {
    console.error("searchStudentsForEnrollmentAction error:", err);
    return { success: false, candidates: [], message: err.message || "Erreur de recherche" };
  }
}

/**
 * Enrolls an existing registered student into a class/group with one click.
 */
export async function enrollStudentInClassAction({
  studentId,
  classId,
}: {
  studentId: string;
  classId: number;
}): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  student?: {
    id: string;
    globalNumber: number;
    name: string;
    phone: string | null;
  };
}> {
  try {
    const session = await getAuthSession();
    if (!session.can("create", "student") && !session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé à inscrire des élèves / غير مصرح لك بتسجيل التلاميذ.",
      };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, branchId: true, inscriptionFee: true, isFormation: true },
    });

    if (!targetClass) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود." };
    }

    if (!canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع." };
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, globalNumber: true, name: true, phone: true },
    });

    if (!student) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود." };
    }

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: { studentId, classId },
    });

    if (existingEnrollment) {
      return {
        success: false,
        error: true,
        message: "L'élève est déjà inscrit dans ce groupe / التلميذ مسجل بالفعل في هذا الفوج.",
        student,
      };
    }

    const latestYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    const academicYearId = latestYear?.id || 1;

    const isFormation = Boolean(targetClass.isFormation);
    const { paidClassIds } = await getStudentPaidInscriptionGroups(prisma, studentId);
    const shouldChargeInsc = isFormation
      ? true
      : (paidClassIds.size < 3 || paidClassIds.has(classId));

    const defaultFee = isFormation
      ? await getFormationInscriptionFeeAction()
      : await getFixedInscriptionFeeAction();
    const effectiveFee =
      Number(targetClass.inscriptionFee || 0) > 0
        ? targetClass.inscriptionFee
        : new Prisma.Decimal(defaultFee);

    await prisma.enrollment.create({
      data: {
        studentId,
        classId,
        academicYearId,
        inscriptionFeeCharged: shouldChargeInsc,
        inscriptionFeeAmount: shouldChargeInsc ? effectiveFee : null,
        payerStatus: "NORMAL",
        enrolledAt: new Date(),
      },
    });

    try {
      safeRevalidatePath("/list/attendance");
      safeRevalidatePath(`/list/attendance/class/${classId}`);
      safeRevalidatePath(`/list/classes/${classId}`);
      safeRevalidatePath(`/list/students/${studentId}`);
      safeRevalidatePath("/list/formations");
      safeRevalidatePath(`/list/formations/${classId}`);
    } catch {
      // Tolerate revalidation outside request
    }

    return {
      success: true,
      error: false,
      message: `${student.name} a été inscrit dans ${targetClass.name} avec succès / تم تسجيل التلميذ بنجاح.`,
      student,
    };
  } catch (err: any) {
    console.error("enrollStudentInClassAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de l'inscription / فشل في تسجيل التلميذ بالفوج.",
    };
  }
}

async function getStudentPaidInscriptionGroups(
  db: any,
  studentId: string
): Promise<{ paidClassIds: Set<number>; classPaymentsMap: Map<number, number> }> {
  const allInscVouchers = await db.voucher.findMany({
    where: {
      studentId,
      paymentType: "INSCRIPTION",
      isVoided: false,
      isRefund: false,
    },
    select: {
      classId: true,
      amount: true,
      refunds: { select: { amount: true } },
      class: { select: { isFormation: true } },
    },
  });

  const classPaymentsMap = new Map<number, number>();
  for (const v of allInscVouchers) {
    if (v.classId) {
      const refunded = (v.refunds || []).reduce(
        (rSum: number, r: any) => rSum + Number(r.amount || 0),
        0
      );
      const netPaid = Math.max(0, Number(v.amount || 0) - refunded);
      if (netPaid > 0) {
        classPaymentsMap.set(
          v.classId,
          (classPaymentsMap.get(v.classId) || 0) + netPaid
        );
      }
    }
  }

  // Only regular (non-formation) groups count towards the 3-group exemption rule!
  const paidClassIds = new Set<number>();
  for (const v of allInscVouchers) {
    if (v.classId && !v.class?.isFormation) {
      const amt = classPaymentsMap.get(v.classId) || 0;
      if (amt > 0) {
        paidClassIds.add(v.classId);
      }
    }
  }

  return { paidClassIds, classPaymentsMap };
}

async function syncStudentInscriptionWaiverForThreeGroups(
  db: any,
  studentId: string
): Promise<void> {
  const { paidClassIds } = await getStudentPaidInscriptionGroups(db, studentId);
  if (paidClassIds.size >= 3) {
    // Only waive regular classes (isFormation: false)! Never waive formation classes!
    const regularEnrollmentsToWaive = await db.enrollment.findMany({
      where: {
        studentId,
        classId: { notIn: Array.from(paidClassIds) },
        inscriptionFeeCharged: true,
        class: { isFormation: false },
      },
      select: { id: true },
    });

    if (regularEnrollmentsToWaive.length > 0) {
      await db.enrollment.updateMany({
        where: {
          id: { in: regularEnrollmentsToWaive.map((e: any) => e.id) },
        },
        data: {
          inscriptionFeeCharged: false,
          inscriptionFeeAmount: null,
        },
      });
    }
  }
}

/**
 * Checks whether a student is exempt from inscription fees (paid in 3 different groups)
 * or has already paid for this specific class.
 */
export async function checkStudentInscriptionExemptionAction({
  studentId,
  classId,
}: {
  studentId: string;
  classId: number;
}): Promise<{
  success: boolean;
  isAlreadyPaidInThisClass: boolean;
  hasPaidThreeInscriptions: boolean;
  isEnrollmentWaived?: boolean;
  paidGroupsCount: number;
  configuredInscriptionFee: number;
}> {
  try {
    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      select: { inscriptionFee: true, isFormation: true },
    });

    const isFormation = Boolean(targetClass?.isFormation);
    const configuredFee = isFormation
      ? await getFormationInscriptionFeeAction()
      : await getFixedInscriptionFeeAction();

    const requiredFee =
      targetClass?.inscriptionFee && Number(targetClass.inscriptionFee) > 0
        ? Number(targetClass.inscriptionFee)
        : configuredFee > 0
        ? configuredFee
        : isFormation
        ? 1500
        : 1000;

    const { paidClassIds, classPaymentsMap } = await getStudentPaidInscriptionGroups(
      prisma,
      studentId
    );

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, classId },
      select: {
        inscriptionFeeCharged: true,
        feeOverriddenByOwner: true,
        payerStatus: true,
        transfersTo: {
          select: {
            fromEnrollment: {
              select: {
                classId: true,
              },
            },
          },
        },
      },
    });

    let isTransferredPayment = false;
    if (enrollment?.transfersTo && enrollment.transfersTo.length > 0) {
      isTransferredPayment = enrollment.transfersTo.some(
        (t) => (classPaymentsMap.get(t.fromEnrollment.classId) || 0) > 0
      );
    }

    const totalPaidInThisClass = classPaymentsMap.get(classId) || 0;
    const isAlreadyPaidInThisClass = totalPaidInThisClass > 0 || isTransferredPayment;
    const paidGroupsCount = paidClassIds.size;

    // Formations have their separated inscription fees and are NOT affected by waiving logic (more than 3 groups)
    const isEnrollmentWaived = Boolean(
      !isFormation &&
        enrollment &&
        ((enrollment.feeOverriddenByOwner && !enrollment.inscriptionFeeCharged) ||
          enrollment.payerStatus === "NON_PAYER")
    );
    const hasPaidThreeInscriptions = isFormation
      ? false
      : paidGroupsCount >= 3;

    return {
      success: true,
      isAlreadyPaidInThisClass,
      hasPaidThreeInscriptions,
      isEnrollmentWaived,
      paidGroupsCount,
      configuredInscriptionFee: requiredFee,
    };
  } catch (err) {
    console.error("checkStudentInscriptionExemptionAction error:", err);
    return {
      success: false,
      isAlreadyPaidInThisClass: false,
      hasPaidThreeInscriptions: false,
      paidGroupsCount: 0,
      configuredInscriptionFee: 1000,
    };
  }
}

export interface MultiItemVoucherItemInput {
  enabled: boolean;
  amount: number;
}

export interface MultiItemVoucherPayload {
  studentId: string;
  classId: number;
  items: {
    tuition?: MultiItemVoucherItemInput;
    inscription?: MultiItemVoucherItemInput;
    book?: MultiItemVoucherItemInput;
  };
  notes?: string;
}

/**
 * Issues a combined multi-item payment voucher (Tuition + Inscription + Books) in a single atomic transaction.
 * System categorizes each value into the database and daily ledger, producing one unified ticket.
 */
export async function issueMultiItemVoucherAction(payload: MultiItemVoucherPayload): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  bundle?: any;
}> {
  // Triggers financial cache revalidation via revalidateFinancialRoutes (/list/daily-ledger, /list/revenue)
  try {
    const session = await getAuthSession();
    const issuingBranchId = await getActiveBranchId();

    if (!canUserAccessBranch(session.rawRole, session.branchIds, issuingBranchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع." };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: payload.classId },
      include: { branch: true, FormationLevel: true },
    });
    if (!targetClass) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود." };
    }

    const student = await prisma.student.findUnique({
      where: { id: payload.studentId },
      include: { family: true },
    });
    if (!student) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود." };
    }

    const targetBranchId = targetClass.branchId;
    const isCrossBranch = issuingBranchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetBranchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    let latestYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
    });
    if (!latestYear) {
      const curYear = new Date().getFullYear();
      latestYear = await prisma.academicYear.create({
        data: {
          label: `${curYear}-${curYear + 1}`,
          startDate: new Date(`${curYear}-09-01`),
          endDate: new Date(`${curYear + 1}-06-30`),
        },
      });
    }

    let activeTrimesterId: number | null = null;
    try {
      const activeTrimester = await prisma.trimester.findFirst({
        where: { status: "active" },
      });
      activeTrimesterId = activeTrimester?.id ?? null;
    } catch {}

    const tuitionItem = payload.items.tuition?.enabled ? payload.items.tuition : null;
    const inscriptionItem =
      payload.items.inscription?.enabled && Number(payload.items.inscription.amount) > 0
        ? payload.items.inscription
        : null;
    const bookItem = payload.items.book?.enabled ? payload.items.book : null;

    if (!tuitionItem && !inscriptionItem && !bookItem) {
      return { success: false, error: true, message: "Veuillez sélectionner au moins un élément à payer / يرجى تحديد بند واحد على الأقل للدفع." };
    }

    let voucherNumber = 0;
    const issuedItems: Array<{ type: string; labelFr: string; labelAr: string; amount: number }> = [];
    let totalAmount = 0;

    await prisma.$transaction(async (tx) => {
      const updatedSeries = await tx.voucherSeries.update({
        where: { id: series!.id },
        data: { currentNumber: { increment: 1 } },
      });
      voucherNumber = updatedSeries.currentNumber;

      // 1. Process Tuition / Formation
      if (tuitionItem) {
        const amt = Number(tuitionItem.amount);
        totalAmount += amt;
        const isFormationClass = Boolean(targetClass.isFormation || targetClass.formationLevelId != null || targetClass.FormationLevel != null);
        const paymentType = isFormationClass ? "FORMATION" : "TUITION_4SESSION";
        const labelFr = isFormationClass ? "Frais de formation" : "Cycle d'études (4 séances)";
        const labelAr = isFormationClass ? "رسوم الدورة التكوينية" : "اشتراك دراسي (4 حصص)";

        issuedItems.push({
          type: paymentType,
          labelFr,
          labelAr,
          amount: amt,
        });

        let isPartial = false;
        let remainingBalanceVal: number | null = null;
        let completesVoucherIdVal: number | null = null;

        if (isFormationClass) {
          const fullPrice = Number(targetClass.FormationLevel?.lumpSumPrice ?? targetClass.pricePerCycle ?? 0);
          if (fullPrice > 0) {
            const prevVouchers = await tx.voucher.findMany({
              where: {
                studentId: payload.studentId,
                classId: payload.classId,
                paymentType: "FORMATION",
                isVoided: false,
                isRefund: false,
              },
              include: { refunds: true },
            });
            const prevPaid = prevVouchers.reduce((s, v) => {
              const paid = Number(v.amount || 0);
              const refunded = (v.refunds || []).reduce((rSum, r) => rSum + Number(r.amount || 0), 0);
              return s + Math.max(0, paid - refunded);
            }, 0);
            const remaining = Math.max(0, fullPrice - (prevPaid + amt));
            if (remaining > 0) {
              isPartial = true;
              remainingBalanceVal = remaining;
            }
            const activePartial = prevVouchers.find(
              (v) => v.isPartial && Number(v.remainingBalance || 0) > 0
            );
            if (activePartial) {
              completesVoucherIdVal = activePartial.id;
              await tx.voucher.update({
                where: { id: activePartial.id },
                data: {
                  remainingBalance: remaining > 0 ? new Prisma.Decimal(remaining) : new Prisma.Decimal(0),
                  isPartial: remaining > 0,
                },
              });
            }
          }
        }

        await tx.voucher.create({
          data: {
            seriesId: series!.id,
            number: voucherNumber,
            studentId: payload.studentId,
            classId: payload.classId,
            issuingBranchId,
            targetBranchId,
            paymentType,
            amount: new Prisma.Decimal(amt),
            isPartial,
            remainingBalance: remainingBalanceVal !== null ? new Prisma.Decimal(remainingBalanceVal) : null,
            completesVoucherId: completesVoucherIdVal,
            issuedBy: session.userId || "admin",
            isVoided: false,
            trimesterId: activeTrimesterId,
          },
        });

        if (amt > 0) {
          const ledgerType = resolveLedgerType(paymentType, targetClass.isFormation);
          await upsertDailyLedger(tx, {
            branchId: issuingBranchId,
            date: new Date(),
            type: ledgerType,
            amount: amt,
          });
        }
      }

      // 2. Process Inscription
      if (inscriptionItem) {
        const amt = Number(inscriptionItem.amount);
        if (amt > 0) {
          totalAmount += amt;
          issuedItems.push({
            type: "INSCRIPTION",
            labelFr: "Frais d'inscription",
            labelAr: "حقوق التسجيل",
            amount: amt,
          });

          await tx.voucher.create({
            data: {
              seriesId: series!.id,
              number: voucherNumber,
              studentId: payload.studentId,
              classId: payload.classId,
              issuingBranchId,
              targetBranchId,
              paymentType: "INSCRIPTION",
              amount: new Prisma.Decimal(amt),
              issuedBy: session.userId || "admin",
              isVoided: false,
              trimesterId: activeTrimesterId,
            },
          });

          const ledgerType = resolveLedgerType("INSCRIPTION", targetClass.isFormation);
          await upsertDailyLedger(tx, {
            branchId: issuingBranchId,
            date: new Date(),
            type: ledgerType,
            amount: amt,
          });

          // Update enrollment inscription status
          const existingEnrollment = await tx.enrollment.findFirst({
            where: {
              studentId: payload.studentId,
              classId: payload.classId,
              academicYearId: latestYear!.id,
            },
          });

          if (existingEnrollment) {
            await tx.enrollment.update({
              where: { id: existingEnrollment.id },
              data: {
                inscriptionFeeCharged: true,
                inscriptionFeeAmount: new Prisma.Decimal(amt),
              },
            });
          }
        }
      }

      // 3. Process Book
      if (bookItem) {
        const amt = Number(bookItem.amount);
        totalAmount += amt;
        issuedItems.push({
          type: "BOOK",
          labelFr: "Frais des manuels",
          labelAr: "رسوم الكتب المدرسية",
          amount: amt,
        });

          await tx.voucher.create({
            data: {
              seriesId: series!.id,
              number: voucherNumber,
              studentId: payload.studentId,
              classId: payload.classId,
              issuingBranchId,
              targetBranchId,
              paymentType: "BOOK",
              amount: new Prisma.Decimal(amt),
              issuedBy: session.userId || "admin",
              isVoided: false,
              trimesterId: activeTrimesterId,
            },
          });

        if (amt > 0) {
          const ledgerType = resolveLedgerType("BOOK", targetClass.isFormation);
          await upsertDailyLedger(tx, {
            branchId: issuingBranchId,
            date: new Date(),
            type: ledgerType,
            amount: amt,
          });
        }
      }

      // Ensure Enrollment exists
      const enr = await tx.enrollment.findFirst({
        where: {
          studentId: payload.studentId,
          classId: payload.classId,
          academicYearId: latestYear!.id,
        },
      });

      if (!enr) {
        const isFormation = Boolean(targetClass?.isFormation);
        const configuredFee = isFormation
          ? await getFormationInscriptionFeeAction()
          : await getFixedInscriptionFeeAction();
        const requiredFee =
          targetClass?.inscriptionFee && Number(targetClass.inscriptionFee) > 0
            ? Number(targetClass.inscriptionFee)
            : configuredFee > 0
            ? configuredFee
            : isFormation
            ? 1500
            : 1000;
        const inscAmt = inscriptionItem ? Number(inscriptionItem.amount) : 0;
        const { paidClassIds } = await getStudentPaidInscriptionGroups(tx, payload.studentId);
        const shouldChargeInsc = isFormation
          ? true
          : (inscAmt > 0 || paidClassIds.size < 3 || paidClassIds.has(payload.classId));
        await tx.enrollment.create({
          data: {
            studentId: payload.studentId,
            classId: payload.classId,
            academicYearId: latestYear!.id,
            inscriptionFeeCharged: shouldChargeInsc,
            inscriptionFeeAmount: shouldChargeInsc
              ? inscAmt > 0
                ? new Prisma.Decimal(inscAmt)
                : new Prisma.Decimal(requiredFee)
              : null,
            payerStatus: "NORMAL",
          },
        });
      } else if (enr.status === "SUSPENDED") {
        await unsuspendEnrollmentWithDebtClearance(tx, {
          studentId: payload.studentId,
          classId: payload.classId,
          enrollmentId: enr.id,
          trigger: "PAYMENT",
          actorId: session.userId || "admin",
          actorName: session.userId || "Admin",
          referenceDate: new Date(),
        });
      }

      await syncStudentInscriptionWaiverForThreeGroups(tx, payload.studentId);
    });

    try {
      await revalidateFinancialRoutes({
        classId: payload.classId,
        studentId: payload.studentId,
        branchId: issuingBranchId,
      });
      safeRevalidatePath("/list/attendance");
      safeRevalidatePath(`/list/attendance/class/${payload.classId}`);
      if (targetClass.isFormation) {
        safeRevalidatePath(`/list/formations/${payload.classId}`);
        safeRevalidatePath("/list/formations");
      }
    } catch {}

    const bundle = {
      voucherNumber,
      seriesId: series.id,
      seriesScope,
      totalAmount,
      student: {
        id: student.id,
        globalNumber: student.globalNumber,
        name: student.name,
        phone: student.phone,
      },
      class: {
        id: targetClass.id,
        name: targetClass.name,
      },
      items: issuedItems,
      issuedAt: new Date().toISOString(),
      issuedBy: session.userId || "admin",
      issuingBranchId,
      targetBranchId,
    };

    return {
      success: true,
      error: false,
      message: `Reçu #${voucherNumber} émis avec succès (${totalAmount.toLocaleString()} DZD) / تم إصدار الوصل #${voucherNumber} بنجاح.`,
      bundle,
    };
  } catch (err: any) {
    console.error("issueMultiItemVoucherAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Échec de l'émission du reçu / فشل في إصدار الوصل.",
    };
  }
}

// =================================================================
// ANNOUNCEMENT ACTIONS
// =================================================================

export const createAnnouncement = async (
  currentState: CurrentState,
  data: AnnouncementSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();

    let targetBranchId: number | null = null;
    if (data.branchId !== undefined) {
      targetBranchId = data.branchId && Number(data.branchId) > 0 ? Number(data.branchId) : null;
    } else {
      targetBranchId = session.isOwner ? null : (activeBranchId || session.branchIds[0] || null);
    }

    const authorBranchId = activeBranchId || session.branchIds[0] || null;

    let expiresAt: Date | null = null;
    if (data.isTemporary && data.expiresAt) {
      const parsedDate = new Date(data.expiresAt);
      if (!isNaN(parsedDate.getTime())) {
        expiresAt = parsedDate;
      }
    }

    await prisma.announcement.create({
      data: {
        title: data.title,
        description: data.description,
        pinned: data.isPinned || false,
        createdBy: session.userId || "system",
        branchId: targetBranchId,
        authorBranchId,
        classId: data.classes?.[0] || null,
        expiresAt,
      },
    });
    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    return {
      success: true,
      error: false,
      message: "Annonce créée avec succès / تم إنشاء الإعلان بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "Échec de création de l'annonce / فشل في إنشاء الإعلان.",
    };
  }
};

export const updateAnnouncement = async (
  currentState: CurrentState,
  data: AnnouncementSchema
) => {
  if (!data.id) {
    return {
      success: false,
      error: true,
      message: "Identifiant manquant / لا يوجد معرف للإعلان.",
    };
  }
  try {
    const session = await getAuthSession();
    const existing = await prisma.announcement.findUnique({
      where: { id: data.id },
    });
    if (!existing) {
      return {
        success: false,
        error: true,
        message: "Annonce introuvable / الإعلان غير موجود.",
      };
    }

    const canUpdate =
      session.isOwner ||
      (existing.authorBranchId &&
        session.branchIds.includes(existing.authorBranchId));
    if (!canUpdate) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette annonce / غير مصرح لك بتعديل هذا الإعلان. فقط فرع كاتب الإعلان يملك صلاحية التعديل.",
      };
    }

    let targetBranchId: number | null | undefined = undefined;
    if (data.branchId !== undefined) {
      targetBranchId = data.branchId && Number(data.branchId) > 0 ? Number(data.branchId) : null;
    }

    let expiresAt: Date | null | undefined = undefined;
    if (data.isTemporary) {
      if (data.expiresAt) {
        const parsedDate = new Date(data.expiresAt);
        expiresAt = !isNaN(parsedDate.getTime()) ? parsedDate : null;
      } else {
        expiresAt = null;
      }
    } else if (data.isTemporary === false) {
      expiresAt = null;
    }

    await prisma.announcement.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description,
        pinned: data.isPinned || false,
        classId: data.classes?.[0] || null,
        ...(targetBranchId !== undefined ? { branchId: targetBranchId } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      },
    });
    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    return {
      success: true,
      error: false,
      message: "Annonce mise à jour avec succès / تم تحديث الإعلان بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "Échec de mise à jour de l'annonce / فشل في تحديث الإعلان.",
    };
  }
};

export const deleteAnnouncement = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    const session = await getAuthSession();
    const announcement = await prisma.announcement.findUnique({
      where: { id: parseInt(id) },
    });
    if (!announcement) {
      return {
        success: false,
        error: true,
        message: "Annonce introuvable / الإعلان غير موجود.",
      };
    }

    const canDelete =
      session.isOwner ||
      (announcement.authorBranchId &&
        session.branchIds.includes(announcement.authorBranchId));
    if (!canDelete) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette annonce / غير مصرح لك بحذف هذا الإعلان. فقط فرع كاتب الإعلان يملك صلاحية الحذف.",
      };
    }

    await prisma.announcement.delete({
      where: { id: parseInt(id) },
    });
    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    return {
      success: true,
      error: false,
      message: "Annonce supprimée avec succès / تم حذف الإعلان بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "Échec de suppression de l'annonce / فشل في حذف الإعلان.",
    };
  }
};

// =================================================================
// PAYMENT ACTIONS
// =================================================================

export const issueVoucher = async (
  currentState: CurrentState,
  data: VoucherSchema
) => {
  try {
    const session = await getAuthSession();
    const issuingBranchId = await getActiveBranchId();

    // Verify issuing branch access
    if (!canUserAccessBranch(session.rawRole, session.branchIds, issuingBranchId)) {
      return { success: false, error: true, message: "غير مصرح لك بإصدار وصولات من هذا الفرع." };
    }

    // 1. Fetch Class and determine targetBranchId
    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
      include: { FormationLevel: true },
    });
    if (!targetClass) {
      return { success: false, error: true, message: "القسم المحدد غير موجود." };
    }
    const targetBranchId = targetClass.branchId;
    const isFormationClass = Boolean(targetClass.isFormation || targetClass.formationLevelId != null || targetClass.FormationLevel != null);
    let resolvedPaymentType = data.paymentType;
    if (isFormationClass && data.paymentType === "TUITION_4SESSION") {
      resolvedPaymentType = "FORMATION";
    }

    // 2. Fetch Student and Family info for Sibling Discount rule (§2.4)
    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
      include: {
        family: true,
      },
    });
    if (!student) {
      return { success: false, error: true, message: "التلميذ المحدد غير موجود." };
    }

    // 3. Determine Active Academic Year for Inscription Fee rule (§2.1)
    let academicYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
    });
    if (!academicYear) {
      const curYear = new Date().getFullYear();
      academicYear = await prisma.academicYear.create({
        data: {
          label: `${curYear}-${curYear + 1}`,
          startDate: new Date(`${curYear}-09-01`),
          endDate: new Date(`${curYear + 1}-06-30`),
        },
      });
    }

    let finalAmount = Number(data.amount);
    let noteAppend = "";
    let isWaivedSibling = false;
    let isWaivedInscription = false;
    let feeOverridden = false;
    let feeOverrideNote = data.feeOverrideNote || null;

    // RULE §2.4: Sibling discount — percentage discount for siblings of designated payer; inscription and book fees unaffected
    // Formations excluded; primary payer must be active and paid
    if (data.paymentType === "TUITION_4SESSION" && !isFormationClass) {
      const family = student.family;
      if (family && family.payerStudentId && family.payerStudentId !== student.id) {
        let isPayerActiveAndPaid = false;
        const payerStudent = await prisma.student.findUnique({
          where: { id: family.payerStudentId },
          include: {
            enrollments: { include: { class: true } },
            vouchers: { where: { isVoided: false, isRefund: false } },
            attendances: { include: { lesson: true } },
            catchUpAttendances: { include: { missedLesson: true } },
          },
        });
        if (payerStudent) {
          const payerRes = resolvePayerCredit({ payerStudent });
          isPayerActiveAndPaid = payerRes.isPayerActiveAndPaid;
        }

        if (isPayerActiveAndPaid) {
          const discountPct = Number(family.discountPercentage ?? 50);
          if (discountPct >= 100) {
            finalAmount = 0;
            isWaivedSibling = true;
            noteAppend = "[إعفاء إخوة: معفى 100% من معاليم الحصص]";
          } else {
            if (isNaN(finalAmount) || finalAmount <= 0) {
              const basePrice = Number(targetClass.pricePerCycle || 0);
              finalAmount = Math.max(0, basePrice * (1 - discountPct / 100));
            }
            noteAppend = `[خصم إخوة: تخفيض ${discountPct}%]`;
          }
        }
      }
    }

    // RULE §2.1: Inscription fee
    if (data.paymentType === "INSCRIPTION") {
      const isFormation = Boolean(targetClass.isFormation);

      if (isFormation) {
        // Formations have their separated inscription fees and are NOT affected by waiving logic (more than 3 groups)
        const defaultFormationFee = await getFormationInscriptionFeeAction();
        const effectiveFee =
          Number(targetClass.inscriptionFee || 0) > 0
            ? Number(targetClass.inscriptionFee)
            : defaultFormationFee;
        finalAmount = data.amount > 0 ? Number(data.amount) : effectiveFee;
      } else {
        // Regular classes waiving logic:
        const chargedCount = await prisma.enrollment.count({
          where: {
            studentId: student.id,
            academicYearId: academicYear.id,
            inscriptionFeeCharged: true,
            status: { not: "REFUNDED" },
            // Exclude this class if already enrolled to avoid double counting
            classId: { not: targetClass.id },
            class: { isFormation: false },
          },
        });

        if (data.feeOverriddenByOwner && session.isOwner) {
          // Owner override
          feeOverridden = true;
          feeOverrideNote = data.feeOverrideNote || (finalAmount === 0 ? "إعفاء استثنائي بقرار المالك" : "فرض رسم استثنائي بقرار المالك");
          noteAppend = `[استثناء مالك: ${feeOverrideNote}]`;
        } else if (data.feeOverriddenByOwner && !session.isOwner) {
          return { success: false, error: true, message: "فقط المالك يملك صلاحية تجاوز قاعدة رسم التسجيل." };
        } else {
          if (chargedCount >= 3) {
            // Auto-waived from 4th enrollment
            finalAmount = 0;
            isWaivedInscription = true;
            noteAppend = `[معفى تلقائياً: التسجيل رقم ${chargedCount + 1} في السنة الدراسية ${academicYear.label}]`;
          } else {
            const defaultInscFee = await getFixedInscriptionFeeAction();
            const effectiveFee =
              Number(targetClass.inscriptionFee || 0) > 0
                ? Number(targetClass.inscriptionFee)
                : defaultInscFee;
            finalAmount = data.amount > 0 ? Number(data.amount) : effectiveFee;
          }
        }
      }
    }

    // Combine notes
    const combinedNotes = [data.notes, noteAppend].filter(Boolean).join(" ");

    // 4. Resolve Continuous Voucher Series (§2.3 & §1.2)
    const isCrossBranch = issuingBranchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId: issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId: targetBranchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetBranchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    // 5. Atomic transaction: increment continuous series, create voucher, update ledger & enrollment
    let createdVoucher: any = null;

    await prisma.$transaction(async (tx) => {
      const updatedSeries = await tx.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      });
      const voucherNumber = updatedSeries.currentNumber;

      // Resolve active trimester for trimester scoping (§7.20)
      let activeTrimesterId: number | null = null;
      try {
        const activeTrimester = await tx.trimester.findFirst({
          where: { status: "active" },
        });
        activeTrimesterId = activeTrimester?.id ?? null;
      } catch {
        // Fallback if status not recognized in stale client
      }

      createdVoucher = await tx.voucher.create({
        data: {
          seriesId: series.id,
          number: voucherNumber,
          studentId: data.studentId,
          classId: data.classId,
          issuingBranchId: issuingBranchId,
          targetBranchId: targetBranchId,
          paymentType: resolvedPaymentType,
          amount: new Prisma.Decimal(finalAmount),
          isPartial: data.isPartial || false,
          completesVoucherId: data.completesVoucherId || null,
          remainingBalance: data.remainingBalance ? new Prisma.Decimal(data.remainingBalance) : null,
          issuedBy: session.userId || "admin",
          isVoided: false,
          trimesterId: (data as any).trimesterId ? Number((data as any).trimesterId) : activeTrimesterId,
        },
        include: {
          class: true,
          student: true,
          series: true,
        },
      });

      // Update DailyLedger at issuing branch where cash is physically collected
      if (finalAmount > 0) {
        const ledgerCategory = resolveLedgerType(resolvedPaymentType, isFormationClass);

        await upsertDailyLedger(tx, {
          branchId: issuingBranchId,
          date: new Date(),
          type: ledgerCategory,
          amount: finalAmount,
        });
      }

      // Ensure Enrollment record exists for this class & academic year
      const existingEnrollment = await tx.enrollment.findFirst({
        where: {
          studentId: data.studentId,
          classId: data.classId,
          academicYearId: academicYear.id,
        },
      });

      const isFormation = Boolean(targetClass.isFormation);
      const defaultInscFee = isFormation
        ? await getFormationInscriptionFeeAction()
        : await getFixedInscriptionFeeAction();
      const effectiveFee =
        Number(targetClass.inscriptionFee || 0) > 0
          ? Number(targetClass.inscriptionFee)
          : defaultInscFee > 0
          ? defaultInscFee
          : isFormation
          ? 1500
          : 1000;

      const { paidClassIds } = await getStudentPaidInscriptionGroups(tx, data.studentId);
      const shouldChargeInscription = isFormation
        ? true
        : data.paymentType === "INSCRIPTION"
        ? finalAmount > 0
        : feeOverridden
        ? finalAmount > 0
        : paidClassIds.size < 3 || paidClassIds.has(data.classId);

      if (!existingEnrollment) {
        await tx.enrollment.create({
          data: {
            studentId: data.studentId,
            classId: data.classId,
            academicYearId: academicYear.id,
            inscriptionFeeCharged: shouldChargeInscription,
            inscriptionFeeAmount: shouldChargeInscription
              ? new Prisma.Decimal(
                  data.paymentType === "INSCRIPTION" && finalAmount > 0
                    ? finalAmount
                    : effectiveFee
                )
              : null,
            feeOverriddenByOwner: feeOverridden,
            feeOverrideNote: feeOverrideNote,
          },
        });
      } else {
        const updateData: any = {};
        if (data.paymentType === "INSCRIPTION") {
          updateData.inscriptionFeeCharged = isFormation ? true : finalAmount > 0;
          updateData.inscriptionFeeAmount =
            isFormation && finalAmount <= 0
              ? new Prisma.Decimal(effectiveFee)
              : finalAmount > 0
              ? new Prisma.Decimal(finalAmount)
              : null;
          updateData.feeOverriddenByOwner = feeOverridden || existingEnrollment.feeOverriddenByOwner;
          updateData.feeOverrideNote = feeOverrideNote || existingEnrollment.feeOverrideNote;
        }
        if (
          data.paymentType === "TUITION_4SESSION" &&
          (existingEnrollment.status === "REFUNDED" || existingEnrollment.status === "SUSPENDED")
        ) {
          if (existingEnrollment.status === "SUSPENDED") {
            await unsuspendEnrollmentWithDebtClearance(tx, {
              studentId: data.studentId,
              classId: data.classId,
              enrollmentId: existingEnrollment.id,
              trigger: "PAYMENT",
              actorId: session.userId || "admin",
              actorName: session.userId || "Admin",
              excludeVoucherIds: createdVoucher ? [createdVoucher.id] : [],
              referenceDate: new Date(),
            });
          } else {
            updateData.status = "ACTIVE";
          }
        }
        if (Object.keys(updateData).length > 0) {
          await tx.enrollment.update({
            where: { id: existingEnrollment.id },
            data: updateData,
          });
        }
      }

      await syncStudentInscriptionWaiverForThreeGroups(tx, data.studentId);
    });

    await revalidateFinancialRoutes({
      classId: data.classId,
      studentId: data.studentId,
      branchId: issuingBranchId,
    });
    if (data.classId) {
      safeRevalidatePath(`/list/attendance/class/${data.classId}`);
    }

    return {
      success: true,
      error: false,
      message: `تم إصدار الوصل رقم ${createdVoucher?.number} بنجاح (${isCrossBranch ? "وصل عابر للفروع" : "وصل محلي"}).`,
      voucher: createdVoucher,
    };
  } catch (err: any) {
    console.error("issueVoucher error:", err);
    return { success: false, error: true, message: err?.message || "فشل في إصدار الوصل." };
  }
};

// Backward-compatible alias for existing form callers
export const recordPayment = async (
  currentState: CurrentState,
  data: PaymentSchema
) => {
  return issueVoucher(currentState, {
    ...data,
    paymentType: (data as any).paymentType || "TUITION_4SESSION",
  });
};

// EDIT VOUCHER WITH AUDIT TRAIL (§2.3 & §1.2)
export const editVoucher = async (
  currentState: CurrentState,
  data: VoucherEditSchema & { amount?: number; paymentType?: string; isVoided?: boolean }
) => {
  // Triggers financial cache revalidation via revalidateFinancialRoutes (/list/revenue, /list/daily-ledger)
  try {
    const session = await getAuthSession();
    if (!data.voucherId) {
      return { success: false, error: true, message: "معرف الوصل مطلوب." };
    }
    if (!data.reason || data.reason.trim().length === 0) {
      return { success: false, error: true, message: "سبب التعديل إلزامي لضمان سجل المراجعة." };
    }

    const voucher = await prisma.voucher.findUnique({
      where: { id: data.voucherId },
      include: { class: true },
    });
    if (!voucher) {
      return { success: false, error: true, message: "الوصل غير موجود." };
    }

    // Check branch access (issuing branch or target branch)
    if (
      !session.isOwner &&
      !session.branchIds.includes(voucher.issuingBranchId) &&
      !session.branchIds.includes(voucher.targetBranchId)
    ) {
      return { success: false, error: true, message: "غير مصرح لك بتعديل وصل لهذا الفرع." };
    }

    const updates: Record<string, any> = {};
    const auditLogs: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

    if (data.amount !== undefined && Number(data.amount) !== Number(voucher.amount)) {
      auditLogs.push({
        fieldName: "amount",
        oldValue: voucher.amount.toString(),
        newValue: data.amount.toString(),
      });
      updates.amount = new Prisma.Decimal(data.amount);
    }

    if (data.paymentType && data.paymentType !== voucher.paymentType) {
      auditLogs.push({
        fieldName: "paymentType",
        oldValue: voucher.paymentType,
        newValue: data.paymentType,
      });
      updates.paymentType = data.paymentType;
    }

    if (data.isVoided !== undefined && data.isVoided !== voucher.isVoided) {
      auditLogs.push({
        fieldName: "isVoided",
        oldValue: String(voucher.isVoided),
        newValue: String(data.isVoided),
      });
      updates.isVoided = data.isVoided;
    }

    if (data.fieldName && data.newValue && !auditLogs.some((l) => l.fieldName === data.fieldName)) {
      auditLogs.push({
        fieldName: data.fieldName,
        oldValue: String((voucher as any)[data.fieldName] ?? ""),
        newValue: data.newValue,
      });
      updates[data.fieldName] = data.newValue;
    }

    if (auditLogs.length === 0) {
      return { success: false, error: true, message: "لم يتم تغيير أي حقل في الوصل." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Create audit logs in VoucherEdit
      for (const log of auditLogs) {
        await tx.voucherEdit.create({
          data: {
            voucherId: voucher.id,
            editedBy: session.userId || "admin",
            editedAt: new Date(),
            fieldName: log.fieldName,
            oldValue: log.oldValue,
            newValue: log.newValue,
            reason: data.reason,
          },
        });
      }

      // If amount is edited to 0, automatically mark voucher as VOIDED
      if (updates.amount !== undefined && Number(updates.amount) <= 0) {
        updates.isVoided = true;
        updates.status = "VOIDED";
      }

      // 2. Update voucher with lastEdited stamp
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          ...updates,
          lastEditedAt: new Date(),
          lastEditedBy: session.userId || "admin",
        },
      });

      // 3. Reconcile DailyLedger if amount, paymentType or isVoided changed
      const oldAmount = Number(voucher.amount);
      const newAmount = updates.amount !== undefined ? Number(updates.amount) : oldAmount;
      const oldType = resolveLedgerType(voucher.paymentType, voucher.class?.isFormation ?? false);
      const newPaymentType = updates.paymentType || voucher.paymentType;
      const newType = resolveLedgerType(newPaymentType, voucher.class?.isFormation ?? false);
      const isNowVoided = updates.isVoided !== undefined ? updates.isVoided : voucher.isVoided;
      const wasVoided = voucher.isVoided;

      if (wasVoided !== isNowVoided || oldAmount !== newAmount || oldType !== newType) {
        if (!wasVoided && oldAmount > 0) {
          await upsertDailyLedger(tx, {
            branchId: voucher.issuingBranchId,
            date: voucher.issuedAt,
            type: oldType,
            amount: -oldAmount,
          });
        }
        if (!isNowVoided && newAmount > 0) {
          await upsertDailyLedger(tx, {
            branchId: voucher.issuingBranchId,
            date: voucher.issuedAt,
            type: newType,
            amount: newAmount,
          });
        }
      }
    });

    await revalidateFinancialRoutes({
      classId: voucher.classId,
      studentId: voucher.studentId,
      branchId: voucher.issuingBranchId,
      workshopId: voucher.workshopId,
    });
    return { success: true, error: false, message: "تم تعديل الوصل وتسجيل أثر المراجعة بنجاح." };
  } catch (err: any) {
    console.error("editVoucher error:", err);
    return { success: false, error: true, message: err?.message || "فشل في تعديل الوصل." };
  }
};

export const updatePayment = async (
  currentState: CurrentState,
  data: PaymentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للوصل." };
  }
  return editVoucher(currentState, {
    voucherId: data.id,
    fieldName: "amount",
    newValue: String(data.amount),
    amount: data.amount,
    reason: data.notes || "تعديل إداري لقيمة الدفع",
  });
};

// VOID VOUCHER ACTION (§2.3)
export const voidVoucher = async (voucherId: number, reason: string) => {
  return editVoucher(
    { success: false, error: false },
    {
      voucherId,
      fieldName: "isVoided",
      newValue: "true",
      isVoided: true,
      reason: reason || "إلغاء الوصل بناء على طلب الإدارة",
    }
  );
};

// VOUCHER SERIES SETUP ACTIONS (§2.3 & setup screen)
export const updateVoucherSeriesNumber = async (
  currentState: CurrentState,
  data: VoucherSeriesSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بتعديل أرقام سلاسل الوصولات." };
    }

    const series = await prisma.voucherSeries.findUnique({
      where: { id: data.id },
      include: { vouchers: { orderBy: { number: "desc" }, take: 1 } },
    });
    if (!series) {
      return { success: false, error: true, message: "سلسلة الوصولات غير موجودة." };
    }

    const maxIssued = series.vouchers[0]?.number || 0;
    if (data.currentNumber < maxIssued) {
      return {
        success: false,
        error: true,
        message: `لا يمكن تعيين رقم السلسلة (${data.currentNumber}) أقل من آخر رقم تم إصداره بالفعل (${maxIssued}).`,
      };
    }

    await prisma.voucherSeries.update({
      where: { id: data.id },
      data: { currentNumber: data.currentNumber },
    });

    return { success: true, error: false, message: `تم تحديث بداية السلسلة إلى ${data.currentNumber} بنجاح.` };
  } catch (err: any) {
    console.error("updateVoucherSeriesNumber error:", err);
    return { success: false, error: true, message: "فشل في تحديث رقم السلسلة." };
  }
};

// GROUP CREDIT TRANSFER (EnrollmentTransfer §2.6)
export const transferEnrollmentCredit = async (
  currentState: CurrentState,
  data: EnrollmentTransferSchema
) => {
  try {
    const session = await getAuthSession();
    const { fromEnrollmentId, toClassId, studentId, transferredSessions, notes } = data;

    // 1. Fetch fromEnrollment
    const fromEnrollment = await prisma.enrollment.findUnique({
      where: { id: fromEnrollmentId },
      include: {
        class: { include: { lessons: true, branch: true } },
        student: true,
        academicYear: true,
        transfersFrom: true,
        transfersTo: true,
      },
    });
    if (!fromEnrollment) {
      return { success: false, error: true, message: "التسجيل السابق غير موجود." };
    }

    // 2. Fetch destination Class
    const toClass = await prisma.class.findUnique({
      where: { id: toClassId },
      include: { branch: true },
    });
    if (!toClass) {
      return { success: false, error: true, message: "القسم الجديد غير موجود." };
    }

    // Enforce same-level transfer rule (§Transfer Architecture)
    const fromClass = fromEnrollment.class;
    const isSameLevel = fromClass.isFormation
      ? toClass.isFormation && fromClass.formationLevelId === toClass.formationLevelId
      : !toClass.isFormation && fromClass.levelId === toClass.levelId;

    if (!isSameLevel) {
      return {
        success: false,
        error: true,
        message: "لا يمكن تحويل التلميذ إلا إلى أفواج من نفس المستوى الدراسي. / Le transfert ne peut être effectué que vers des groupes du même niveau.",
      };
    }

    // 3. Find or create toEnrollment
    let toEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: studentId,
        classId: toClassId,
        academicYearId: fromEnrollment.academicYearId,
      },
    });

    let transferredAmount = 0;
    let finalTransferredSessions = 0;

    await prisma.$transaction(async (tx) => {
      if (!toEnrollment) {
        toEnrollment = await tx.enrollment.create({
          data: {
            studentId: studentId,
            classId: toClassId,
            academicYearId: fromEnrollment.academicYearId,
            inscriptionFeeCharged: true, // Keep true so that transfer-based status check handles payment accurately instead of phantom-waiving
            feeOverriddenByOwner: false,
            status: "ACTIVE",
          },
        });
      } else if (toEnrollment.status !== "ACTIVE") {
        await tx.enrollment.update({
          where: { id: toEnrollment.id },
          data: { status: "ACTIVE" },
        });
      }

      // Fetch tuition vouchers of the original group
      const studentVouchers = await tx.voucher.findMany({
        where: {
          studentId: studentId,
          classId: fromEnrollment.classId,
          isVoided: false,
          isRefund: false,
          paymentType: "TUITION_4SESSION",
        },
        include: { refunds: true },
        orderBy: { issuedAt: "desc" },
      });

      // Calculate purchased sessions
      const cyclePriceFrom = Number(fromEnrollment.class.pricePerCycle || 0);
      const lessonPriceFrom = cyclePriceFrom > 0 ? cyclePriceFrom / 4 : 0;
      let purchasedSessionsFrom = 0;
      if (lessonPriceFrom > 0) {
        const totalTuitionFrom = studentVouchers.reduce((sum, v) => {
          const vRefunded = (v.refunds || []).reduce((rSum, r) => rSum + Number(r.amount || 0), 0);
          return sum + Math.max(0, Number(v.amount || 0) - vRefunded);
        }, 0);
        purchasedSessionsFrom = Math.floor(totalTuitionFrom / lessonPriceFrom);
      } else {
        studentVouchers.forEach((v) => {
          const vAmount = Number(v.amount || 0);
          const vRefunded = (v.refunds || []).reduce((rSum, r) => rSum + Number(r.amount || 0), 0);
          const refundedSessions = vAmount > 0 ? Math.floor(vRefunded / (vAmount / 4)) : 0;
          purchasedSessionsFrom += Math.max(0, 4 - refundedSessions);
        });
      }

      const transferredInFrom = (fromEnrollment.transfersTo || []).reduce((sum, t) => sum + t.transferredSessions, 0);
      const transferredOutFrom = (fromEnrollment.transfersFrom || []).reduce((sum, t) => sum + t.transferredSessions, 0);
      const offsetFrom = Number(fromEnrollment.creditResetOffset || 0);

      // Fetch lesson attendance history for source class
      const fromLessons = await tx.lesson.findMany({
        where: {
          classId: fromEnrollment.classId,
          isFree: false,
          attendances: { some: {} },
        },
        select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
        orderBy: { startsAt: "asc" },
      });
      const fromAttendances = await tx.attendance.findMany({
        where: {
          studentId: studentId,
          lesson: { classId: fromEnrollment.classId },
        },
        select: {
          lessonId: true,
          status: true,
        },
      });
      const fromCatchUps = await tx.catchUpAttendance.findMany({
        where: {
          studentId: studentId,
          missedLesson: { classId: fromEnrollment.classId },
        },
        select: { missedLessonId: true, recordedAt: true },
      });

      const classifiedHistory = classifyStudentAttendanceHistory({
        lessons: fromLessons,
        attendances: fromAttendances,
        catchUps: fromCatchUps,
        referenceDate: new Date(),
      });

      // Settled consumed sessions (PRESENT, INTERLEAVED_ABSENCE, FORFEITED_DROPOUT) are non-refundable and non-transferable.
      // Unresolved trailing absences (TRAILING_ABSENCE_HELD), pre-start absences, and unconsumed sessions remain fully transferable per refund logic!
      const settledConsumedSessions = classifiedHistory.filter(
        (h) =>
          h.isConsumedCredit &&
          (h.classification === "PRESENT" ||
            h.classification === "INTERLEAVED_ABSENCE" ||
            h.classification === "FORFEITED_DROPOUT")
      ).length;

      const availableSessionsFrom = Math.max(
        0,
        purchasedSessionsFrom + transferredInFrom - transferredOutFrom + offsetFrom - settledConsumedSessions
      );

      if (availableSessionsFrom <= 0) {
        throw new Error("لا يوجد رصيد متبقي قابل للتحويل في هذا الفوج. / Aucun solde restant transférable dans ce groupe.");
      }

      // User can transfer any amount of available credit of the student (1 to availableSessionsFrom)
      const requestedSessions = Number(transferredSessions);
      if (isNaN(requestedSessions) || requestedSessions < 1) {
        throw new Error("يرجى إدخال عدد حصص صحيح للتحويل. / Veuillez spécifier un nombre valide de séances à transférer.");
      }
      if (requestedSessions > availableSessionsFrom) {
        throw new Error(
          `لا يمكن تحويل أكثر من الرصيد المتاح (${availableSessionsFrom} حصص). / Impossible de transférer plus que le solde disponible (${availableSessionsFrom} séances).`
        );
      }
      finalTransferredSessions = requestedSessions;

      // Calculate unit session price
      const transferWithAmount = (fromEnrollment.transfersTo || []).find(
        (t) => Number(t.amount) > 0 && t.transferredSessions > 0
      );

      let sessionPrice = 0;
      if (studentVouchers.length > 0 && Number(studentVouchers[0].amount) > 0) {
        sessionPrice = Number(studentVouchers[0].amount) / 4;
      } else if (transferWithAmount) {
        sessionPrice = Number(transferWithAmount.amount) / transferWithAmount.transferredSessions;
      } else if (fromEnrollment.class.pricePerCycle && Number(fromEnrollment.class.pricePerCycle) > 0) {
        sessionPrice = Number(fromEnrollment.class.pricePerCycle) / 4;
      } else if (toClass.pricePerCycle && Number(toClass.pricePerCycle) > 0) {
        sessionPrice = Number(toClass.pricePerCycle) / 4;
      }

      transferredAmount = Math.round(Number(finalTransferredSessions) * sessionPrice);

      // Count held trailing absences to document if open-ended absences were transferred
      const heldSessions = classifiedHistory.filter((h) => h.isHeld).length;
      const unheldRemaining = Math.max(
        0,
        purchasedSessionsFrom + transferredInFrom - transferredOutFrom + offsetFrom - classifiedHistory.filter((h) => h.isConsumedCredit).length
      );
      const transferredHeldSessions = Math.min(heldSessions, Math.max(0, finalTransferredSessions - unheldRemaining));
      const autoNote = transferredHeldSessions > 0
        ? `[تحويل يشمل ${transferredHeldSessions} حصة غياب مفتوح قابلة للاسترجاع / Transfert incluant ${transferredHeldSessions} absence(s) ouverte(s)]`
        : "";
      const finalNotes = notes ? (autoNote ? `${notes} ${autoNote}` : notes) : (autoNote || null);

      // Record EnrollmentTransfer with amount and notes
      await tx.enrollmentTransfer.create({
        data: {
          fromEnrollmentId: fromEnrollment.id,
          toEnrollmentId: toEnrollment.id,
          transferredSessions: Number(finalTransferredSessions),
          amount: transferredAmount,
          notes: finalNotes,
          transferredAt: new Date(),
          transferredBy: session.userId || "admin",
        },
      });

      // Mark fromEnrollment as TRANSFERRED when transferring to avoid phantom attendances
      await tx.enrollment.update({
        where: { id: fromEnrollment.id },
        data: { status: "TRANSFERRED" },
      });
    });

    try {
      await revalidateFinancialRoutes({
        classId: toClassId,
        studentId,
        branchId: toClass.branchId,
      });
      if (fromEnrollment.classId) {
        await revalidateFinancialRoutes({
          classId: fromEnrollment.classId,
          branchId: fromEnrollment.class.branchId,
        });
      }
      safeRevalidatePath("/list/attendance");
      safeRevalidatePath(`/list/attendance/class/${fromEnrollment.classId}`);
      safeRevalidatePath(`/list/attendance/class/${toClassId}`);
      safeRevalidatePath("/list/payroll");
    } catch {
      // Ignore if executed outside Next.js request context (e.g. standalone test scripts)
    }

    const branchTransferNote =
      fromEnrollment.class.branchId !== toClass.branchId && transferredAmount > 0
        ? ` (تم تحويل مبلغ ${transferredAmount.toLocaleString("ar-DZ")} دج من فرع ${fromEnrollment.class.branch.name} إلى فرع ${toClass.branch.name})`
        : "";

    const unenrollNote = ` (تم تحويل التلميذ من ${fromEnrollment.class.name} إلى ${toClass.name})`;

    return {
      success: true,
      error: false,
      message: `تم تحويل ${finalTransferredSessions} حصص من ${fromEnrollment.class.name} إلى ${toClass.name} بنجاح.${branchTransferNote}${unenrollNote}`,
    };
  } catch (err: any) {
    console.error("transferEnrollmentCredit error:", err);
    return { success: false, error: true, message: err?.message || "فشل في تحويل رصيد الحصص." };
  }
};

// OWNER-ONLY INSCRIPTION FEE OVERRIDE (§2.1)
export const overrideEnrollmentFee = async (
  enrollmentId: number,
  forceWaive: boolean,
  note: string
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يملك صلاحية تجاوز قاعدة رسم التسجيل." };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { class: true },
    });
    if (!enrollment) {
      return { success: false, error: true, message: "التسجيل غير موجود." };
    }

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        inscriptionFeeCharged: !forceWaive,
        inscriptionFeeAmount: forceWaive ? null : enrollment.class.inscriptionFee,
        feeOverriddenByOwner: true,
        feeOverrideNote: note || (forceWaive ? "إعفاء يدوي من المالك" : "فرض يدوي من المالك"),
      },
    });

    await revalidateFinancialRoutes({
      classId: enrollment.classId,
      studentId: enrollment.studentId,
      branchId: enrollment.class.branchId,
    });
    return { success: true, error: false, message: "تم تطبيق الاستثناء بنجاح." };
  } catch (err: any) {
    console.error("overrideEnrollmentFee error:", err);
    return { success: false, error: true, message: "فشل في تطبيق استثناء رسم التسجيل." };
  }
};

export const createRefund = async (
  currentState: CurrentState,
  data: RefundSchema
) => {
  // Triggers financial cache revalidation via revalidateFinancialRoutes (/list/daily-ledger, /list/revenue)
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بإجراء استرداد مالي." };
    }

    if (!data.voucherId && !data.transferId) {
      return { success: false, error: true, message: "معرف الوصل أو التحويل مطلوب لإجراء الاسترداد." };
    }

    if (!data.amount || data.amount <= 0) {
      return { success: false, error: true, message: "مبلغ الاسترداد يجب أن يكون أكبر من الصفر." };
    }

    if (!data.reason || data.reason.trim().length < 3) {
      return { success: false, error: true, message: "سبب الاسترداد إلزامي لضمان سجل المراجعة (3 أحرف على الأقل)." };
    }

    // =========================================================================
    // BRANCH A: REFUNDING A CREDIT TRANSFER (EnrollmentTransfer)
    // =========================================================================
    if (data.transferId && !data.voucherId) {
      const transfer = await prisma.enrollmentTransfer.findUnique({
        where: { id: data.transferId },
        include: {
          fromEnrollment: {
            include: {
              class: { include: { branch: true } },
              student: { include: { family: true } },
            },
          },
          toEnrollment: {
            include: {
              class: { include: { branch: true } },
              student: { include: { family: true } },
              transfersFrom: true,
              transfersTo: true,
            },
          },
        },
      });

      if (!transfer) {
        return { success: false, error: true, message: "عملية تحويل الرصيد المحددة غير موجودة." };
      }

      const fromBranchId = transfer.fromEnrollment.class.branchId;
      const toBranchId = transfer.toEnrollment.class.branchId;
      const hasBranchAccess =
        session.isOwner ||
        !session.userId ||
        canUserAccessBranch(session.rawRole, session.branchIds, fromBranchId) ||
        canUserAccessBranch(session.rawRole, session.branchIds, toBranchId);

      if (!hasBranchAccess) {
        return { success: false, error: true, message: "غير مصرح لك بإجراء استرداد لتحويل يتبع فرعاً آخر." };
      }

      const student = transfer.toEnrollment.student || transfer.fromEnrollment.student;
      if (student?.family?.payerStudentId && student.family.payerStudentId !== student.id) {
        return {
          success: false,
          error: true,
          message: "لا يمكن استرداد مبالغ لطالب معفى بموجب تخفيض الأخوة. / Aucun remboursement pour un élève exonéré fratrie.",
        };
      }

      // Find any prior refunds recorded for this transfer
      const existingTransferRefunds = await prisma.refund.findMany({
        where: {
          voucher: { studentId: student.id },
          reason: { startsWith: `[TRF-#${transfer.id}]` },
        },
      });
      const totalRefundedSoFar = existingTransferRefunds.reduce((sum, r) => sum + Number(r.amount), 0);

      const fallbackCyclePrice = Number(
        transfer.toEnrollment.class.pricePerCycle || transfer.fromEnrollment.class.pricePerCycle || 0
      );
      const fallbackSessionPrice = fallbackCyclePrice > 0 ? fallbackCyclePrice / 4 : 0;
      const transferAmount =
        Number(transfer.amount) > 0
          ? Number(transfer.amount)
          : Math.round(transfer.transferredSessions * fallbackSessionPrice);
      const pricePerSession =
        transfer.transferredSessions > 0 ? transferAmount / transfer.transferredSessions : fallbackSessionPrice;
      const remainingBalance = Math.max(0, transferAmount - totalRefundedSoFar);

      if (remainingBalance <= 0 || transfer.transferredSessions <= 0) {
        return {
          success: false,
          error: true,
          message: "هذا التحويل مسترجع بالكامل مسبقاً ولا يمكن استرداد أي مبالغ إضافية منه.",
        };
      }

      const destClassId = transfer.toEnrollment.classId;
      const [classLessons, studentAttendances, studentCatchUps, destClassVouchers] = await Promise.all([
        prisma.lesson.findMany({
          where: {
            classId: destClassId,
            isFree: false,
            attendances: { some: {} },
          },
          select: { id: true, startsAt: true, isFree: true },
          orderBy: { startsAt: "asc" },
        }),
        prisma.attendance.findMany({
          where: {
            studentId: student.id,
            lesson: { classId: destClassId },
          },
          select: { lessonId: true, status: true },
        }),
        prisma.catchUpAttendance.findMany({
          where: {
            studentId: student.id,
            missedLesson: { classId: destClassId },
          },
          select: { missedLessonId: true, recordedAt: true },
        }),
        prisma.voucher.findMany({
          where: {
            studentId: student.id,
            classId: destClassId,
            paymentType: "TUITION_4SESSION",
            isVoided: false,
            isRefund: false,
          },
          include: { refunds: true },
        }),
      ]);

      const classifiedHistory = classifyStudentAttendanceHistory({
        lessons: classLessons,
        attendances: studentAttendances,
        catchUps: studentCatchUps,
        referenceDate: new Date(),
      });

      const trailingHeldLessonIds = classifiedHistory.filter((h) => h.isHeld).map((h) => h.lessonId);
      const settledConsumedSessions = classifiedHistory.filter(
        (h) =>
          h.classification === "PRESENT" ||
          h.classification === "INTERLEAVED_ABSENCE" ||
          h.classification === "FORFEITED_DROPOUT"
      ).length;

      const transferredOutDest =
        transfer.toEnrollment.transfersFrom?.reduce((sum, t) => sum + t.transferredSessions, 0) || 0;
      const transferredInDest =
        transfer.toEnrollment.transfersTo?.reduce((sum, t) => sum + t.transferredSessions, 0) || 0;
      const offsetDest = Number(transfer.toEnrollment.creditResetOffset || 0);

      const destCyclePrice = Math.max(0, Number(transfer.toEnrollment.class.pricePerCycle || 0));
      const destLessonPrice = destCyclePrice > 0 ? destCyclePrice / 4 : 0;
      let totalPaidDest = 0;
      let totalPurchasedDest = 0;
      for (const v of destClassVouchers) {
        if (v.isVoided || v.isRefund || v.status === "REFUNDED") continue;
        const vAmount = Number(v.amount || 0);
        const vRefunded = v.refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        totalPaidDest += Math.max(0, vAmount - vRefunded);
        if (destLessonPrice <= 0) {
          const refundedSessions = vAmount > 0 ? Math.floor(vRefunded / (vAmount / 4)) : 0;
          totalPurchasedDest += Math.max(0, 4 - refundedSessions);
        }
      }
      if (destLessonPrice > 0) {
        totalPurchasedDest = Math.floor(totalPaidDest / destLessonPrice);
      }

      const netRefundableSessions =
        totalPurchasedDest + transferredInDest - transferredOutDest + offsetDest - settledConsumedSessions;
      const prevRefundedSessions =
        pricePerSession > 0 ? Math.round(totalRefundedSoFar / pricePerSession) : 0;
      const remainingTransferSessions = Math.max(0, transfer.transferredSessions - prevRefundedSessions);
      const unconsumedInTransfer = Math.max(0, Math.min(remainingTransferSessions, netRefundableSessions));
      const maxRefundableByConsumption = Math.round(unconsumedInTransfer * pricePerSession);
      const maxRefundable = Math.min(remainingBalance, maxRefundableByConsumption);

      if (maxRefundable <= 0 || unconsumedInTransfer <= 0) {
        return {
          success: false,
          error: true,
          message: "جميع حصص هذا التحويل قد تم استهلاكها بالفعل بالحضور المؤكد. لا يمكن إجراء أي استرداد مالي. / Toutes les séances transférées ont déjà été consommées. Aucun remboursement n'est possible.",
        };
      }

      if (data.amount > maxRefundable) {
        return {
          success: false,
          error: true,
          message: `مبلغ الاسترداد المطلوب (${data.amount.toLocaleString()} دج) يتجاوز الحد الأقصى المسموح به للحصص المتبقية القابلة للاسترداد (${maxRefundable.toLocaleString()} دج - ${unconsumedInTransfer} حصص متبقية). / Le montant demandé (${data.amount.toLocaleString()} DZD) dépasse le plafond autorisé pour les séances restantes remboursables (${maxRefundable.toLocaleString()} DZD - ${unconsumedInTransfer} séances restantes).`,
        };
      }

      const newTotalRefunded = totalRefundedSoFar + data.amount;
      const newRemainingBalance = Math.max(0, remainingBalance - data.amount);
      const isFullRefund = newRemainingBalance <= 0 || data.amount >= maxRefundable;
      const targetRefundedSessions = isFullRefund
        ? prevRefundedSessions + unconsumedInTransfer
        : pricePerSession > 0
        ? Math.max(prevRefundedSessions + 1, Math.round(newTotalRefunded / pricePerSession))
        : prevRefundedSessions + 1;
      const sessionsToDeduct = Math.min(
        unconsumedInTransfer,
        Math.max(1, targetRefundedSessions - prevRefundedSessions)
      );
      const remainingNetSessionsAfter = netRefundableSessions - sessionsToDeduct;
      const userIdentifier = session.userId || "admin";
      let createdRefundVoucherNumber: number | null = null;

      await prisma.$transaction(async (tx) => {
        const refundBranchId = toBranchId;
        let refundSeries = await tx.voucherSeries.findFirst({
          where: {
            issuingBranchId: refundBranchId,
            scope: "REFUND",
          },
          orderBy: { id: "asc" },
        });

        if (!refundSeries) {
          refundSeries = await tx.voucherSeries.create({
            data: {
              issuingBranchId: refundBranchId,
              scope: "REFUND",
              targetBranchId: null,
              currentNumber: 0,
            },
          });
        }

        const updatedRefundSeries = await tx.voucherSeries.update({
          where: { id: refundSeries.id },
          data: { currentNumber: { increment: 1 } },
        });
        const refundVoucherNumber = updatedRefundSeries.currentNumber;
        createdRefundVoucherNumber = refundVoucherNumber;

        // Create the flagged Refund Voucher in the destination class
        const createdRefundVoucher = await tx.voucher.create({
          data: {
            seriesId: refundSeries.id,
            number: refundVoucherNumber,
            studentId: student.id,
            classId: destClassId,
            issuingBranchId: refundBranchId,
            targetBranchId: toBranchId,
            paymentType: "TUITION_4SESSION",
            amount: new Prisma.Decimal(data.amount),
            isPartial: false,
            isRefund: true,
            issuedBy: userIdentifier,
            issuedAt: new Date(),
            isVoided: false,
            status: "REFUND",
          },
        });

        // Create Refund record tagged with [TRF-#id] for audit trail and ledger sync
        await tx.refund.create({
          data: {
            voucherId: createdRefundVoucher.id,
            amount: new Prisma.Decimal(data.amount),
            reason: `[TRF-#${transfer.id}] ${data.reason.trim()}`,
            refundedBy: userIdentifier,
            refundedAt: new Date(),
          },
        });

        // Deduct refunded sessions from destination enrollment's net credit
        await tx.enrollment.update({
          where: { id: transfer.toEnrollmentId },
          data: {
            creditResetOffset: { decrement: sessionsToDeduct },
            ...(newRemainingBalance <= 0 && remainingNetSessionsAfter <= 0
              ? { status: "REFUNDED" }
              : {}),
          },
        });

        // Record refund in DailyLedger
        await upsertDailyLedger(tx, {
          branchId: refundBranchId,
          date: new Date(),
          type: "REFUND",
          amount: data.amount,
        });

        // Create general AuditLog
        await tx.auditLog.create({
          data: {
            entityType: "EnrollmentTransfer",
            entityId: String(transfer.id),
            action: isFullRefund ? "REFUND_FULL" : "REFUND_PARTIAL",
            branchId: refundBranchId,
            userId: userIdentifier,
            userName: userIdentifier,
            oldValue: String(remainingBalance),
            newValue: String(newRemainingBalance),
            details: `استرداد ${isFullRefund ? "كامل" : "جزئي"} بمبلغ ${data.amount} دج (${sessionsToDeduct} حصص) لتحويل الرصيد #TRF-${transfer.id}، وتم إصدار وصل استرداد جديد #${refundVoucherNumber}. السبب: ${data.reason.trim()}`,
            timestamp: new Date(),
          },
        });

        if (trailingHeldLessonIds.length > 0) {
          await tx.attendance.updateMany({
            where: {
              studentId: student.id,
              lessonId: { in: trailingHeldLessonIds },
            },
            data: {
              status: "NOT_DEFINED",
              justification: `Remboursé au parent (${data.reason.trim()}) / مسترجع للولي`,
            },
          });
        }
      });

      try {
        await revalidateFinancialRoutes({
          classId: destClassId,
          studentId: student.id,
          branchId: toBranchId,
        });
        if (transfer.fromEnrollment.classId && transfer.fromEnrollment.classId !== destClassId) {
          await revalidateFinancialRoutes({
            classId: transfer.fromEnrollment.classId,
            branchId: fromBranchId,
          });
        }
        safeRevalidatePath(`/list/reports`);
      } catch {
        // Ignore revalidatePath errors in non-HTTP request contexts
      }

      return {
        success: true,
        error: false,
        message:
          newRemainingBalance <= 0
            ? `تم استرداد كامل قيمة التحويل #TRF-${transfer.id} (${data.amount.toLocaleString()} دج) وإصدار وصل استرداد جديد #${createdRefundVoucherNumber}.`
            : `تم استرداد مبلغ جزئي (${data.amount.toLocaleString()} دج) من التحويل #TRF-${transfer.id} وإصدار وصل استرداد جديد #${createdRefundVoucherNumber}. الرصيد المتبقي: ${newRemainingBalance.toLocaleString()} دج.`,
      };
    }

    // =========================================================================
    // BRANCH B: REFUNDING A VOUCHER
    // =========================================================================
    const voucher = await prisma.voucher.findUnique({
      where: { id: data.voucherId! },
      include: {
        refunds: true,
        class: true,
      },
    });

    if (!voucher) {
      return { success: false, error: true, message: "الوصل المحدد غير موجود." };
    }

    // Branch authorization check
    const hasBranchAccess =
      session.isOwner ||
      !session.userId ||
      canUserAccessBranch(session.rawRole, session.branchIds, voucher.issuingBranchId) ||
      canUserAccessBranch(session.rawRole, session.branchIds, voucher.targetBranchId);

    if (!hasBranchAccess) {
      return { success: false, error: true, message: "غير مصرح لك بإجراء استرداد لوصل يتبع فرعاً آخر." };
    }

    // Calculate sum of existing refunds
    const totalRefundedSoFar = voucher.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const voucherAmount = Number(voucher.amount);
    const unrefundedVoucherMoney = Math.max(0, voucherAmount - totalRefundedSoFar);

    // Validation 1: Cannot refund an already fully refunded or voided voucher
    if (voucher.isVoided || unrefundedVoucherMoney <= 0) {
      return {
        success: false,
        error: true,
        message: "هذا الوصل مسترجع بالكامل أو ملغى مسبقاً ولا يمكن استرداد أي مبالغ إضافية منه.",
      };
    }

    // Validation 2: Inscription fees can only be refunded if the student never attended (didn't start studying)
    if (voucher.paymentType === "INSCRIPTION") {
      const [inscLessons, inscAttendances, inscCatchUps] = await Promise.all([
        prisma.lesson.findMany({
          where: {
            ...(voucher.classId ? { classId: voucher.classId } : {}),
            isFree: false,
            attendances: { some: {} },
          },
          select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true },
          orderBy: { startsAt: "asc" },
        }),
        prisma.attendance.findMany({
          where: {
            studentId: voucher.studentId,
            ...(voucher.classId ? { lesson: { classId: voucher.classId } } : {}),
          },
          select: { lessonId: true, status: true },
        }),
        prisma.catchUpAttendance.findMany({
          where: {
            studentId: voucher.studentId,
            ...(voucher.classId ? { missedLesson: { classId: voucher.classId } } : {}),
          },
          select: { missedLessonId: true, recordedAt: true },
        }),
      ]);

      const consumedSessionsForInsc = computeStudentConsumedSessions({
        lessons: inscLessons,
        attendances: inscAttendances,
        catchUps: inscCatchUps,
      });

      if (consumedSessionsForInsc > 0) {
        return {
          success: false,
          error: true,
          message:
            "لا يمكن استرداد رسوم التسجيل بعد شروع الطالب في الدراسة (تسجيل حضور واحد على الأقل). / Les frais d'inscription ne sont remboursables que si l'élève n'a jamais assisté à un cours.",
        };
      }
    }

    let trailingHeldLessonIds: number[] = [];

    const isFormationOrBookOrInscription =
      Boolean(voucher.class?.isFormation) ||
      voucher.paymentType === "FORMATION" ||
      voucher.paymentType === "BOOK" ||
      voucher.paymentType === "INSCRIPTION";

    // Validation 3: For normal class tuition vouchers, enforce the cashback rule (§7.8)
    if (voucher.classId && !isFormationOrBookOrInscription) {
      // Must be a tuition cycle voucher
      if (voucher.paymentType !== "TUITION_4SESSION") {
        return {
          success: false,
          error: true,
          message: "لا يمكن تطبيق الاسترداد إلا على دورات الاشتراكات الدراسية (TUITION_4SESSION). / Le remboursement ne peut être appliqué que sur un cycle d'abonnement.",
        };
      }

      // Check that this is the student's MOST RECENT paid, currently-active cycle
      const studentClassVouchers = await prisma.voucher.findMany({
        where: {
          studentId: voucher.studentId,
          classId: voucher.classId,
          paymentType: "TUITION_4SESSION",
          isVoided: false,
          isRefund: false,
        },
        include: {
          refunds: true,
        },
        orderBy: [
          { issuedAt: "desc" },
          { id: "desc" },
        ],
      });

      const activeCycles = studentClassVouchers.filter((v) => {
        const refunded = v.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
        const rem = Number(v.remainingBalance ?? (Number(v.amount) - refunded));
        return rem > 0;
      });

      if (activeCycles.length === 0 || activeCycles[0].id !== voucher.id) {
        return {
          success: false,
          error: true,
          message: "لا يمكن تطبيق الاسترداد إلا على أحدث دورة مدفوعة ونشطة للطالب. / Le remboursement ne peut être appliqué que sur le cycle actif le plus récent de l'élève.",
        };
      }

      // Sibling discount waiver check
      const student = await prisma.student.findUnique({
        where: { id: voucher.studentId },
        include: { family: true },
      });
      const isSiblingDiscount = Boolean(
        student?.family?.payerStudentId && student.family.payerStudentId !== voucher.studentId
      );
      const siblingDiscountPct = isSiblingDiscount
        ? Number((student?.family as any)?.discountPercentage ?? 50)
        : 0;
      if (siblingDiscountPct >= 100) {
        return {
          success: false,
          error: true,
          message: "لا يمكن استرداد مبالغ لطالب معفى بموجب تخفيض الأخوة. / Aucun remboursement pour un élève exonéré fratrie.",
        };
      }

      // Calculate consumed sessions using Massinissa School rules:
      // Consumed: PRESENT + INTERLEAVED_ABSENCE + FORFEITED_DROPOUT
      // Refundable/Unconsumed: PRE_START_ABSENCE + TRAILING_ABSENCE_HELD + NOT_DEFINED
      const [classLessons, studentAttendances, studentCatchUps] = await Promise.all([
        prisma.lesson.findMany({
          where: {
            classId: voucher.classId,
            isFree: false,
            attendances: { some: {} },
          },
          select: { id: true, startsAt: true, isFree: true },
          orderBy: { startsAt: "asc" },
        }),
        prisma.attendance.findMany({
          where: {
            studentId: voucher.studentId,
            lesson: { classId: voucher.classId },
          },
          select: { lessonId: true, status: true },
        }),
        prisma.catchUpAttendance.findMany({
          where: {
            studentId: voucher.studentId,
            missedLesson: { classId: voucher.classId },
          },
          select: { missedLessonId: true, recordedAt: true },
        }),
      ]);

      const classifiedHistory = classifyStudentAttendanceHistory({
        lessons: classLessons,
        attendances: studentAttendances,
        catchUps: studentCatchUps,
        referenceDate: new Date(),
      });

      trailingHeldLessonIds = classifiedHistory.filter((h) => h.isHeld).map((h) => h.lessonId);

      // Settled consumed sessions (PRESENT, INTERLEAVED_ABSENCE, FORFEITED_DROPOUT) are non-refundable.
      // Unresolved trailing absences (TRAILING_ABSENCE_HELD) and unconsumed sessions remain fully refund-eligible per Rule 5 & §7.22.
      const settledConsumedSessions = classifiedHistory.filter(
        (h) =>
          h.classification === "PRESENT" ||
          h.classification === "INTERLEAVED_ABSENCE" ||
          h.classification === "FORFEITED_DROPOUT"
      ).length;

      // Transfers
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId: voucher.studentId,
          classId: voucher.classId,
        },
        include: {
          transfersFrom: true,
          transfersTo: true,
        },
      });
      const transferredOut = enrollment?.transfersFrom?.reduce((sum, t) => sum + t.transferredSessions, 0) || 0;
      const transferredIn = enrollment?.transfersTo?.reduce((sum, t) => sum + t.transferredSessions, 0) || 0;
      const offset = Number(enrollment?.creditResetOffset || 0);

      const cyclePrice = Math.max(0, Number(voucher.class?.pricePerCycle || 0));
      const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
      const effectiveLessonPrice =
        siblingDiscountPct > 0 && siblingDiscountPct < 100
          ? baseLessonPrice * (1 - siblingDiscountPct / 100)
          : siblingDiscountPct >= 100
          ? 0
          : baseLessonPrice;

      // Calculate total paid tuition and purchased sessions minus prior refunds
      let totalPaidTuition = 0;
      let totalPurchased = 0;
      for (const v of studentClassVouchers) {
        if (v.isVoided || v.isRefund || v.status === "REFUNDED") continue;
        const vAmount = Number(v.amount || 0);
        const vRefunded = v.refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        totalPaidTuition += Math.max(0, vAmount - vRefunded);
        if (effectiveLessonPrice <= 0) {
          const refundedSessions = vAmount > 0 ? Math.floor(vRefunded / (vAmount / 4)) : 0;
          totalPurchased += Math.max(0, 4 - refundedSessions);
        }
      }
      if (effectiveLessonPrice > 0) {
        totalPurchased = Math.floor(totalPaidTuition / effectiveLessonPrice);
      }

      const netRefundableSessions = (totalPurchased + transferredIn - transferredOut + offset) - settledConsumedSessions;
      const unconsumedInCycle = Math.max(0, Math.min(4, netRefundableSessions));
      let maxRefundableByConsumption = 0;
      if (effectiveLessonPrice > 0) {
        maxRefundableByConsumption = Math.max(
          0,
          Math.round(
            totalPaidTuition +
              (transferredIn - transferredOut + offset - settledConsumedSessions) * effectiveLessonPrice
          )
        );
      } else {
        const pricePerSession = voucherAmount / 4;
        maxRefundableByConsumption = Math.round(unconsumedInCycle * pricePerSession);
      }
      const maxRefundable = Math.min(unrefundedVoucherMoney, maxRefundableByConsumption);

      if (maxRefundable <= 0) {
        return {
          success: false,
          error: true,
          message: "جميع حصص هذه الدورة قد تم استهلاكها بالفعل بالحضور المؤكد. لا يمكن إجراء أي استرداد مالي. / Toutes les séances de ce cycle ont déjà été consommées de manière confirmée. Aucun remboursement n'est possible.",
        };
      }

      if (data.amount > maxRefundable) {
        return {
          success: false,
          error: true,
          message: `مبلغ الاسترداد المطلوب (${data.amount.toLocaleString()} دج) يتجاوز الحد الأقصى المسموح به للحصص المتبقية القابلة للاسترداد (${maxRefundable.toLocaleString()} دج - ${unconsumedInCycle} حصص متبقية). / Le montant demandé (${data.amount.toLocaleString()} DZD) dépasse le plafond autorisé pour les séances restantes remboursables (${maxRefundable.toLocaleString()} DZD - ${unconsumedInCycle} séances restantes).`,
        };
      }
    } else {
      // For non-class vouchers (e.g. workshops), validate against remaining balance only
      if (data.amount > unrefundedVoucherMoney) {
        return {
          success: false,
          error: true,
          message: `مبلغ الاسترداد (${data.amount.toLocaleString()} دج) يتجاوز الرصيد المتبقي المتاح للاسترداد (${unrefundedVoucherMoney.toLocaleString()} دج).`,
        };
      }
    }

    const newRemainingBalance = unrefundedVoucherMoney - data.amount;
    const newOriginalAmount = Math.max(0, voucherAmount - data.amount);
    const isFullRefund = newRemainingBalance <= 0 || newOriginalAmount <= 0;
    const userIdentifier = session.userId || "admin";
    let createdRefundVoucherNumber: number | null = null;

    await prisma.$transaction(async (tx) => {
      // 1. Resolve or create dedicated Refund VoucherSeries (§2.3 & refund specification)
      const refundBranchId = voucher.issuingBranchId;
      let refundSeries = await tx.voucherSeries.findFirst({
        where: {
          issuingBranchId: refundBranchId,
          scope: "REFUND",
        },
        orderBy: { id: "asc" },
      });

      if (!refundSeries) {
        refundSeries = await tx.voucherSeries.create({
          data: {
            issuingBranchId: refundBranchId,
            scope: "REFUND",
            targetBranchId: voucher.targetBranchId !== refundBranchId ? voucher.targetBranchId : null,
            currentNumber: 0,
          },
        });
      }

      const updatedRefundSeries = await tx.voucherSeries.update({
        where: { id: refundSeries.id },
        data: { currentNumber: { increment: 1 } },
      });
      const refundVoucherNumber = updatedRefundSeries.currentNumber;
      createdRefundVoucherNumber = refundVoucherNumber;

      // 2. Create the flagged Refund Voucher
      await tx.voucher.create({
        data: {
          seriesId: refundSeries.id,
          number: refundVoucherNumber,
          studentId: voucher.studentId,
          classId: voucher.classId,
          workshopId: voucher.workshopId,
          issuingBranchId: voucher.issuingBranchId,
          targetBranchId: voucher.targetBranchId,
          paymentType: voucher.paymentType,
          amount: new Prisma.Decimal(data.amount),
          isPartial: false,
          isRefund: true,
          refundForVoucherId: voucher.id,
          issuedBy: userIdentifier,
          issuedAt: new Date(),
          isVoided: false,
          status: "REFUND",
          trimesterId: voucher.trimesterId,
        },
      });

      // 3. Create Refund record for backward compatibility & audit trail
      await tx.refund.create({
        data: {
          voucherId: voucher.id,
          amount: new Prisma.Decimal(data.amount),
          reason: data.reason.trim(),
          refundedBy: userIdentifier,
          refundedAt: new Date(),
        },
      });

      // 4. Update Original Voucher: remainingBalance reduced per refund
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          remainingBalance: new Prisma.Decimal(Math.max(0, newRemainingBalance)),
          isVoided: isFullRefund ? true : voucher.isVoided,
          status: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
          lastEditedAt: new Date(),
          lastEditedBy: userIdentifier,
        },
      });

      // 4b. Update enrollment inscriptionFeeAmount on inscription refund, and if full refund, mark enrollment/participant as REFUNDED when appropriate
      if (voucher.paymentType === "INSCRIPTION" && voucher.classId) {
        await tx.enrollment.updateMany({
          where: {
            studentId: voucher.studentId,
            classId: voucher.classId,
          },
          data: {
            inscriptionFeeAmount: new Prisma.Decimal(Math.max(0, newRemainingBalance)),
          },
        });
      }

      if (isFullRefund) {
        if (voucher.classId) {
          let shouldMarkEnrollmentRefunded = true;
          if (voucher.paymentType === "INSCRIPTION" || voucher.paymentType === "BOOK") {
            const otherActiveVouchers = await tx.voucher.findMany({
              where: {
                studentId: voucher.studentId,
                classId: voucher.classId,
                id: { not: voucher.id },
                isVoided: false,
                isRefund: false,
                paymentType: { in: ["TUITION_4SESSION", "FORMATION"] },
              },
              include: { refunds: true },
            });
            const hasActiveTuition = otherActiveVouchers.some((ov) => {
              const ovRef = ov.refunds.reduce((s, r) => s + Number(r.amount), 0);
              const ovRem = Number(ov.remainingBalance ?? (Number(ov.amount) - ovRef));
              return ovRem > 0;
            });
            if (hasActiveTuition) {
              shouldMarkEnrollmentRefunded = false;
            }
          }

          if (shouldMarkEnrollmentRefunded) {
            await tx.enrollment.updateMany({
              where: {
                studentId: voucher.studentId,
                classId: voucher.classId,
              },
              data: {
                status: "REFUNDED",
              },
            });
          }
        }
        if (voucher.workshopId) {
          await tx.workshopParticipant.updateMany({
            where: {
              studentId: voucher.studentId,
              workshopId: voucher.workshopId,
            },
            data: {
              status: "REFUNDED",
            },
          });
        }
      }

      // 5. Create VoucherEdit audit log
      await tx.voucherEdit.create({
        data: {
          voucherId: voucher.id,
          editedBy: userIdentifier,
          editedAt: new Date(),
          fieldName: isFullRefund ? "refund_full" : "refund_partial",
          oldValue: `الرصيد المتبقي: ${unrefundedVoucherMoney.toLocaleString()} دج`,
          newValue: `الرصيد المتبقي: ${Math.max(0, newRemainingBalance).toLocaleString()} دج (استرداد ${data.amount.toLocaleString()} دج عبر وصل استرداد #${refundVoucherNumber})`,
          reason: data.reason.trim(),
        },
      });

      // 4. Record refund in DailyLedger (§1.1, Phase 6)
      await upsertDailyLedger(tx, {
        branchId: voucher.issuingBranchId,
        date: new Date(),
        type: "REFUND",
        amount: data.amount,
      });

      // 5. Create general AuditLog
      await tx.auditLog.create({
        data: {
          entityType: "Voucher",
          entityId: String(voucher.id),
          action: isFullRefund ? "REFUND_FULL" : "REFUND_PARTIAL",
          branchId: voucher.targetBranchId,
          userId: userIdentifier,
          userName: userIdentifier,
          oldValue: String(unrefundedVoucherMoney),
          newValue: String(Math.max(0, newRemainingBalance)),
          details: `استرداد ${isFullRefund ? "كامل" : "جزئي"} بمبلغ ${data.amount} دج للوصل #${voucher.number}، وتم إصدار وصل استرداد جديد #${refundVoucherNumber}. السبب: ${data.reason.trim()}`,
          timestamp: new Date(),
        },
      });

      // 6. When refunding a class cycle, resolve any trailing held absences for this student
      // by setting status to NOT_DEFINED so they cannot be charged or paid retroactively.
      if (trailingHeldLessonIds.length > 0) {
        await tx.attendance.updateMany({
          where: {
            studentId: voucher.studentId,
            lessonId: { in: trailingHeldLessonIds },
          },
          data: {
            status: "NOT_DEFINED",
            justification: `Remboursé au parent (${data.reason.trim()}) / مسترجع للولي`,
          },
        });
      }
    });

    try {
      await revalidateFinancialRoutes({
        classId: voucher.classId,
        studentId: voucher.studentId,
        branchId: voucher.issuingBranchId,
        workshopId: voucher.workshopId,
      });
      safeRevalidatePath(`/list/reports`);
      if (voucher.classId && (voucher.class?.isFormation || voucher.paymentType === "FORMATION")) {
        safeRevalidatePath(`/list/formations/${voucher.classId}`);
        safeRevalidatePath(`/list/formations`);
      }
    } catch {
      // Ignore revalidatePath errors in non-HTTP request contexts
    }

    return {
      success: true,
      error: false,
      message: isFullRefund
        ? `تم استرداد كامل قيمة الوصل #${voucher.number} (${data.amount.toLocaleString()} دج) وإصدار وصل استرداد جديد #${createdRefundVoucherNumber}.`
        : `تم استرداد مبلغ جزئي (${data.amount.toLocaleString()} دج) من الوصل #${voucher.number} وإصدار وصل استرداد جديد #${createdRefundVoucherNumber}. الرصيد المتبقي: ${newRemainingBalance.toLocaleString()} دج.`,
    };
  } catch (err: any) {
    console.error("createRefund error:", err);
    return { success: false, error: true, message: err?.message || "فشل في تسجيل عملية الاسترداد." };
  }
};

// =================================================================
// WORKSHOP ACTIONS
// =================================================================

export const createWorkshop = async (
  currentState: CurrentState,
  data: WorkshopSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const branchId = (data as any).branchId ? Number((data as any).branchId) : (activeBranchId || session.branchIds[0] || 1);
    await prisma.$transaction(async (tx) => {
      const newWorkshop = await tx.workshop.create({
        data: {
          title: data.title,
          description: data.description || "",
          totalPrice: data.price !== undefined ? data.price : ((data as any).totalPrice !== undefined ? (data as any).totalPrice : 0),
          guestTeacher: data.teacherName || (data as any).guestTeacher || (data as any).teacher || "Professeur Invité",
          branchId: branchId,
        },
      });

      if (data.sessions && data.sessions.length > 0) {
        await tx.workshopSession.createMany({
          data: data.sessions.map((session) => ({
            workshopId: newWorkshop.id,
            startsAt: new Date(session.startTime),
            endsAt: new Date(session.endTime),
          })),
        });
      }
    });

    safeRevalidatePath("/list/workshops");
    return { success: true, error: false, message: "Atelier créé avec succès / تم انشاء الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "Échec de la création de l'atelier / فشل في انشاء الدورة." };
  }
};

export const updateWorkshop = async (
  currentState: CurrentState,
  data: WorkshopSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant d'atelier manquant / لا يوجد معرف الدورة." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.workshop.update({
        where: { id: data.id },
        data: {
          title: data.title,
          description: data.description || "",
          totalPrice: data.price !== undefined ? data.price : ((data as any).totalPrice !== undefined ? (data as any).totalPrice : 0),
          guestTeacher: data.teacherName || (data as any).guestTeacher || (data as any).teacher || "Professeur Invité",
        },
      });

      await tx.workshopSession.deleteMany({
        where: { workshopId: data.id },
      });

      if (data.sessions && data.sessions.length > 0) {
        await tx.workshopSession.createMany({
          data: data.sessions.map((session) => ({
            workshopId: data.id!,
            startsAt: new Date(session.startTime),
            endsAt: new Date(session.endTime),
          })),
        });
      }
    });

    safeRevalidatePath("/list/workshops");
    safeRevalidatePath(`/list/workshops/${data.id}`);
    return { success: true, error: false, message: "Atelier mis à jour avec succès / تم تحديث الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "Échec de la mise à jour de l'atelier / فشل في تحديث الدورة." };
  }
};


export const deleteWorkshop = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    await prisma.workshop.delete({
      where: { id: parseInt(id) },
    });
    safeRevalidatePath("/list/workshops");
    return { success: true, error: false, message: "Atelier supprimé avec succès / تم حذف الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "Échec de la suppression de l'atelier / فشل في حذف الدورة." };
  }
};


// =================================================================
// WORKSHOP MANAGEMENT ACTIONS
// =================================================================

// Action to register a new participant and optionally record their first payment via Voucher
export const registerParticipant = async (
  currentState: CurrentState,
  data: RegisterParticipantSchema
) => {
  // Triggers financial cache revalidation via revalidateFinancialRoutes (/list/daily-ledger, /list/revenue)
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const branchId = activeBranchId || session.branchIds[0] || 1;

    const workshop = await prisma.workshop.findUnique({
      where: { id: data.workshopId },
    });
    if (!workshop) {
      return { success: false, error: true, message: "Atelier introuvable / الورشة المحددة غير موجودة." };
    }

    const targetBranchId = workshop.branchId;
    const isCrossBranch = branchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";
    const initialAmount = data.amount && data.amount > 0 ? Number(data.amount) : 0;

    let series: any = null;
    if (initialAmount > 0) {
      series = await prisma.voucherSeries.findFirst({
        where: {
          issuingBranchId: branchId,
          scope: seriesScope,
          ...(isCrossBranch ? { targetBranchId: targetBranchId } : {}),
        },
        orderBy: { id: "asc" },
      });

      if (!series) {
        series = await prisma.voucherSeries.create({
          data: {
            issuingBranchId: branchId,
            scope: seriesScope,
            targetBranchId: isCrossBranch ? targetBranchId : null,
            currentNumber: isCrossBranch ? 50 : 100,
          },
        });
      }
    }

    let createdVoucherNumber: number | null = null;

    await prisma.$transaction(async (tx) => {
      let student = await tx.student.findFirst({
        where: { name: data.name, ...(data.phone ? { phone: data.phone } : {}) },
      });
      if (!student) {
        const globalNumber = await getNextGlobalStudentNumber(tx);
        student = await tx.student.create({
          data: {
            id: `student_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            globalNumber,
            name: data.name,
            phone: data.phone || null,
            registeredBranchId: branchId,
          },
        });
      }

      if (initialAmount > 0 && series) {
        const updatedSeries = await tx.voucherSeries.update({
          where: { id: series.id },
          data: { currentNumber: { increment: 1 } },
        });
        createdVoucherNumber = updatedSeries.currentNumber;

        await tx.voucher.create({
          data: {
            seriesId: series.id,
            number: updatedSeries.currentNumber,
            studentId: student.id,
            workshopId: workshop.id,
            classId: null,
            issuingBranchId: branchId,
            targetBranchId: targetBranchId,
            paymentType: "WORKSHOP",
            amount: new Prisma.Decimal(initialAmount),
            isPartial: initialAmount < Number(workshop.totalPrice),
            remainingBalance: initialAmount < Number(workshop.totalPrice) ? new Prisma.Decimal(Number(workshop.totalPrice) - initialAmount) : null,
            issuedBy: session.userId || "admin",
            isVoided: false,
            status: "ACTIVE",
          },
        });

        // Update DailyLedger at issuing branch where cash is physically collected
        await upsertDailyLedger(tx, {
          branchId: branchId,
          date: new Date(),
          type: "ATELIER_FORMATION",
          amount: initialAmount,
        });
      }

      const isPaidInFull = initialAmount >= Number(workshop.totalPrice);

      // Auto-assign chair number for this gender in this workshop (§7.14)
      // Continuous counter starting at 1, kept separately per gender (boys 1,2,3...; girls 1,2,3... independently)
      const participantGender = data.gender || "MALE";
      const maxChair = await tx.workshopParticipant.aggregate({
        where: {
          workshopId: data.workshopId,
          gender: participantGender,
        },
        _max: { chairNumber: true },
      });
      const nextChairNumber = (maxChair._max.chairNumber || 0) + 1;

      await tx.workshopParticipant.create({
        data: {
          workshopId: data.workshopId,
          studentId: student.id,
          gender: participantGender,
          chairNumber: nextChairNumber,
          status: isPaidInFull ? "PAID_IN_FULL" : "OWED",
          totalPaid: initialAmount,
          totalRefunded: 0,
        },
      });
    });

    try {
      await revalidateFinancialRoutes({
        workshopId: data.workshopId,
        branchId: branchId,
      });
      safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    } catch (_) {}
    return { 
      success: true, 
      error: false, 
      message: createdVoucherNumber 
        ? `Participant inscrit avec succès (Reçu #${createdVoucherNumber}) / تم تسجيل التلميذ بنجاح وإصدار وصل رقم #${createdVoucherNumber}.`
        : "Participant inscrit avec succès / تم تسجيل التلميذ بنجاح." 
    };
  } catch (err) {
    console.error("registerParticipant error:", err);
    return { success: false, error: true, message: "Échec de l'inscription du participant / فشل في تسجيل التلميذ." };
  }
};

// Action to update an existing participant's details
export const updateWorkshopParticipant = async (
  currentState: CurrentState,
  data: RegisterParticipantSchema & { id: number } // Reuse schema, but ensure ID is present
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }
  try {
    const participant = await prisma.workshopParticipant.findUnique({
      where: { id: data.id },
    });
    if (participant) {
      await prisma.student.update({
        where: { id: participant.studentId },
        data: {
          name: data.name,
          phone: data.phone || null,
        },
      });

      const participantGender = data.gender || participant.gender;
      let chairNumber = participant.chairNumber;

      // If gender was changed or chairNumber was missing, recalculate next chair number for the new gender
      if (data.gender && data.gender !== participant.gender) {
        const maxChair = await prisma.workshopParticipant.aggregate({
          where: {
            workshopId: participant.workshopId,
            gender: participantGender,
          },
          _max: { chairNumber: true },
        });
        chairNumber = (maxChair._max.chairNumber || 0) + 1;
      } else if (!chairNumber) {
        const maxChair = await prisma.workshopParticipant.aggregate({
          where: {
            workshopId: participant.workshopId,
            gender: participantGender,
          },
          _max: { chairNumber: true },
        });
        chairNumber = (maxChair._max.chairNumber || 0) + 1;
      }

      await prisma.workshopParticipant.update({
        where: { id: participant.id },
        data: {
          gender: participantGender,
          chairNumber: chairNumber,
        },
      });
    }

    try {
      safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    } catch (_) {}
    return { success: true, error: false, message: "تم تحديث معلومات التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث معلومات التلميذ." };
  }
};

export const deleteWorkshopParticipant = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  const workshopId = data.get("workshopId") as string;
  try {
    await prisma.workshopParticipant.delete({
      where: { id: parseInt(id) },
    });
    safeRevalidatePath(`/list/workshops/${workshopId}`);
    return { success: true, error: false, message: "تم حذف التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف التلميذ." };
  }
};

// Action to record a subsequent payment for a workshop participant via digital Voucher (§1.2 & §1.7)
export const addWorkshopPayment = async (
  currentState: CurrentState,
  data: WorkshopPaymentSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const issuingBranchId = activeBranchId || session.branchIds[0] || 1;

    const participant = await prisma.workshopParticipant.findUnique({
      where: { id: data.participantId },
      include: { workshop: true, Student: true },
    });
    if (!participant) {
      return { success: false, error: true, message: "المشارك غير موجود." };
    }

    const workshop = participant.workshop;
    const targetBranchId = workshop.branchId;
    const isCrossBranch = issuingBranchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";
    const paymentAmount = Number(data.amount);

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId: issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId: targetBranchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetBranchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    let createdVoucher: any = null;

    await prisma.$transaction(async (tx) => {
      const updatedSeries = await tx.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      });
      const voucherNumber = updatedSeries.currentNumber;

      const newTotalPaid = Number(participant.totalPaid) + paymentAmount;
      const netPaid = newTotalPaid - Number(participant.totalRefunded || 0);
      const isPaidInFull = netPaid >= Number(workshop.totalPrice);

      createdVoucher = await tx.voucher.create({
        data: {
          seriesId: series.id,
          number: voucherNumber,
          studentId: participant.studentId,
          workshopId: workshop.id,
          classId: null,
          issuingBranchId: issuingBranchId,
          targetBranchId: targetBranchId,
          paymentType: "WORKSHOP",
          amount: new Prisma.Decimal(paymentAmount),
          isPartial: !isPaidInFull,
          remainingBalance: !isPaidInFull ? new Prisma.Decimal(Number(workshop.totalPrice) - netPaid) : null,
          issuedBy: session.userId || "admin",
          isVoided: false,
          status: "ACTIVE",
        },
      });

      // Update DailyLedger at issuing branch where cash is physically collected
      await upsertDailyLedger(tx, {
        branchId: issuingBranchId,
        date: new Date(),
        type: "ATELIER_FORMATION",
        amount: paymentAmount,
      });

      // Update workshopParticipant totalPaid and status
      await tx.workshopParticipant.update({
        where: { id: participant.id },
        data: {
          totalPaid: { increment: paymentAmount },
          status: isPaidInFull ? "PAID_IN_FULL" : "OWED",
        },
      });
    });

    await revalidateFinancialRoutes({
      workshopId: workshop.id,
      studentId: participant.studentId,
      branchId: issuingBranchId,
    });
    safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    return { 
      success: true, 
      error: false, 
      message: `تم إصدار الوصل رقم #${createdVoucher?.number} وتسجيل الدفع بنجاح.` 
    };
  } catch (err) {
    console.error("addWorkshopPayment error:", err);
    return { success: false, error: true, message: "فشل في تسجيل الدفع وإصدار الوصل." };
  }
};

// Action to update an existing workshop payment
export const updateWorkshopPayment = async (
  currentState: CurrentState,
  data: WorkshopPaymentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف لعملية الدفع." };
  }
  try {
    await prisma.workshopParticipant.update({
      where: { id: data.participantId },
      data: {
        totalPaid: data.amount,
      },
    });
    await revalidateFinancialRoutes({
      workshopId: data.workshopId,
    });
    safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    return { success: true, error: false, message: "تم تحديث عملية الدفع بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث عملية الدفع." };
  }
};



// Action to save attendance for a specific workshop session
export const saveWorkshopAttendance = async (
  sessionId: number,
  currentState: CurrentState,
  data: FormData
) => {
  const attendanceEntries = Array.from(data.entries()).filter(([key]) =>
    key.startsWith("attendance[")
  );

  if (attendanceEntries.length === 0) {
    return { success: false, error: true, message: "لم يتم إرسال بيانات الحضور." };
  }

  const workshopSession = await prisma.workshopSession.findUnique({
    where: { id: sessionId },
    include: { workshop: { select: { branchId: true } } },
  });
  if (!workshopSession) {
    return { success: false, error: true, message: "لم يتم العثور على حصص الدورة." };
  }

  const session = await getAuthSession();
  if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, workshopSession.workshop.branchId)) {
    return {
      success: false,
      error: true,
      message: "Accès non autorisé pour ce siège / غير مصرح لك بتسجيل الحضور لهذه الورشة.",
    };
  }

  try {
    for (const [key, value] of attendanceEntries) {
      const participantId = parseInt(key.substring(key.indexOf("[") + 1, key.indexOf("]")));
      const isPresent = (value as string) === "PRESENT";
      const participant = await prisma.workshopParticipant.findUnique({ where: { id: participantId } });
      if (!participant) continue;

      const existing = await prisma.workshopAttendance.findFirst({
        where: { sessionId, studentId: participant.studentId },
      });
      if (existing) {
        await prisma.workshopAttendance.update({
          where: { id: existing.id },
          data: { status: isPresent ? "PRESENT" : "ABSENT" },
        });
      } else {
        await prisma.workshopAttendance.create({
          data: {
            sessionId,
            studentId: participant.studentId,
            status: isPresent ? "PRESENT" : "ABSENT",
          },
        });
      }
    }

    safeRevalidatePath("/admin");
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath(`/list/workshops/${workshopSession.workshopId}`);
    return { success: true, error: false, message: "تم حفظ الحضور بنجاح." };
  } catch (err: any) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حفظ الحضور." };
  }
};


// =================================================================
// DAILY LEDGER ACTIONS
// =================================================================

export const generateDailyLedger = async (date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const vouchersToday = await prisma.voucher.findMany({
      where: {
        isVoided: false,
        issuedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const activeBranchId = await getActiveBranchId();
    const branchVouchers = vouchersToday.filter(v => v.targetBranchId === activeBranchId);
    const totalToday = branchVouchers.reduce((sum, v) => sum + Number(v.amount), 0);

    if (totalToday > 0) {
      await prisma.dailyLedger.create({
        data: {
          branchId: activeBranchId,
          date: startOfDay,
          type: "SUMMARY",
          amount: new Prisma.Decimal(totalToday),
        },
      });
    }

    // Include refunds as a distinct negative line (§1.1)
    const refundsToday = await prisma.refund.findMany({
      where: {
        refundedAt: { gte: startOfDay, lte: endOfDay },
        voucher: { targetBranchId: activeBranchId },
      },
    });
    const totalRefundsToday = refundsToday.reduce((sum, r) => sum + Number(r.amount), 0);

    if (totalRefundsToday > 0) {
      await prisma.dailyLedger.create({
        data: {
          branchId: activeBranchId,
          date: startOfDay,
          type: "REFUND",
          amount: new Prisma.Decimal(-totalRefundsToday),
        },
      });
    }

    return { success: true, message: "تم تحديث دفتر الحسابات بنجاح." };
  } catch (err) {
    console.error("Failed to generate daily ledger:", err);
    return { success: false, error: true, message: "فشل في إنشاء دفتر الحسابات." };
  }
};

// =================================================================
// EXCEL EXPORT ACTIONS
// =================================================================

export const exportToExcel = async (
    type: string, 
    options?: { 
        classId?: number; 
        workshopId?: number; 
        dateFrom?: string; 
        dateTo?: string; 
        lessonId?: number;
        branchId?: number | "all" | string;
        periodMode?: "daily" | "weekly" | "monthly";
    }
) => {
  try {
    const session = await getAuthSession();
    // Branch admins can ONLY export attendance records. All other exports are owner-only.
    if (!session.isOwner) {
      if (type !== "attendance") {
        return { success: false, error: true, message: "غير مصرح لك بتصدير هذا الملف. هذه الخاصية متاحة للمالك فقط." };
      }
      if (options?.classId) {
        const targetClass = await prisma.class.findUnique({
          where: { id: options.classId },
          select: { branchId: true },
        });
        if (targetClass && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
          return { success: false, error: true, message: "لا تملك صلاحية الوصول إلى بيانات هذا الفرع." };
        }
      }
    }

    const workbook = new ExcelJS.Workbook();
    let filename = `${type}_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Define columns and fetch data based on the export type
    switch (type) {
      case "students":
        const studentsSheet = workbook.addWorksheet("Students");
        const students = await prisma.student.findMany({
          include: {
            registeredBranch: true,
            enrollments: { include: { class: true } },
            family: true,
          },
          orderBy: { name: 'asc' }
        });
        studentsSheet.columns = [
          { header: "N° ID", key: "globalNumber", width: 12 },
          { header: "Nom et Prénom", key: "name", width: 25 },
          { header: "Téléphone", key: "phone", width: 20 },
          { header: "Branche d'inscription", key: "branch", width: 20 },
          { header: "Groupes inscrits", key: "classes", width: 35 },
          { header: "Famille / Rôle", key: "family", width: 25 },
        ];
        const studentsData = students.map(s => {
          const isPayer = s.family?.payerStudentId === s.id;
          const hasFamily = Boolean(s.familyId);
          const familyText = hasFamily ? (isPayer ? "Famille (Payeur désigné)" : "Famille (Élève exempté)") : "Individuel";
          return {
            globalNumber: s.globalNumber,
            name: s.name,
            phone: s.phone || "-",
            branch: s.registeredBranch?.name || "-",
            classes: s.enrollments.map(e => e.class.name).join(", "),
            family: familyText,
          };
        });
        studentsSheet.addRows(studentsData);
        studentsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        studentsSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        break;

      case "payments":
        if (!options?.classId) {
            return { success: false, error: true, message: "مطلوب معرف القسم (Class ID) لتصدير سجلات الدفع." };
        }
        const classTarget = await prisma.class.findUnique({
            where: { id: options.classId },
            include: {
              branch: true,
              teacherClassRates: true,
              teacher: {
                include: {
                  TeacherPayRate: {
                    orderBy: { effectiveFrom: "desc" },
                    take: 1,
                  },
                },
              },
              enrollments: {
                include: {
                  student: {
                    include: {
                      registeredBranch: true,
                      family: {
                        include: {
                          payerStudent: {
                            include: {
                              enrollments: {
                                include: {
                                  class: { select: { id: true, pricePerCycle: true, isFormation: true } },
                                  transfersFrom: true,
                                  transfersTo: true,
                                },
                              },
                              vouchers: {
                                where: { isVoided: false, isRefund: false },
                                include: { refunds: true },
                              },
                              attendances: {
                                where: { lesson: { isFree: false } },
                                include: {
                                  lesson: { select: { id: true, startsAt: true, isFree: true, classId: true, lessonGroups: { select: { classId: true } } } },
                                },
                              },
                              catchUpAttendances: {
                                include: {
                                  missedLesson: {
                                    select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } },
                                  },
                                  catchUpLesson: {
                                    select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                      enrollments: { include: { class: { include: { branch: true } } } },
                      vouchers: {
                        where: {
                          paymentType: "INSCRIPTION",
                          isVoided: false,
                          isRefund: false,
                        },
                        include: { refunds: true },
                      },
                      catchUpAttendances: {
                        select: { missedLessonId: true },
                      },
                    },
                  },
                  transfersFrom: true,
                  transfersTo: true,
                },
                orderBy: { enrolledAt: 'asc' },
              },
              vouchers: {
                where: { isVoided: false },
                include: { refunds: true },
                orderBy: { issuedAt: 'asc' },
              },
              lessons: {
                where: { isFree: false },
                include: { attendances: true },
                orderBy: { startsAt: 'asc' },
              },
            },
        });

        if (!classTarget) {
            return { success: false, error: true, message: "لم يتم العثور على القسم." };
        }
        
        filename = `${classTarget.name.replace(/ /g, "_")}_grille_paiements_${new Date().toISOString().split('T')[0]}.xlsx`;
        const paymentSheet = workbook.addWorksheet(`${classTarget.name} - Grille`);

        const hasBooks = classTarget.hasBooks;

        paymentSheet.columns = [
            { header: "التلميذ", key: "studentName", width: 25 },
            { header: "رقم الهاتف", key: "phone", width: 16 },
            { header: "الفرع الأصلي", key: "registeredBranch", width: 16 },
            { header: "فروع أخرى مسجل بها", key: "otherBranches", width: 22 },
            { header: "حقوق التسجيل", key: "inscriptionFee", width: 18 },
            ...(hasBooks ? [{ header: "حقوق الكتاب", key: "bookFee", width: 16 }] : []),
            { header: "دورة 1 (حصص 1-4)", key: "cycle1", width: 16 },
            { header: "دورة 2 (حصص 5-8)", key: "cycle2", width: 16 },
            { header: "دورة 3 (حصص 9-12)", key: "cycle3", width: 16 },
            { header: "دورة 4 (حصص 13-16)", key: "cycle4", width: 16 },
            { header: "الحصص المستهلكة", key: "consumedSessions", width: 16 },
            { header: "الرصيد المتبقي", key: "remainingSessions", width: 16 },
            { header: "الحالة", key: "status", width: 18 },
        ];

        const paymentExportData: any[] = [];
        classTarget.enrollments.forEach((enrollment) => {
            const student = enrollment.student;
            const studentVouchers = classTarget.vouchers.filter(v => v.studentId === student.id && !v.isRefund);
            const enrPayerStatus = (enrollment as any).payerStatus || (student as any).payerStatus || "NORMAL";

            const paidInscByClass = new Map<number, number>();
            const allStudentInscVouchers = [
              ...((student as any).vouchers || []),
              ...studentVouchers.filter(v => v.paymentType === "INSCRIPTION"),
            ];
            const seenVoucherIds = new Set<number>();
            for (const v of allStudentInscVouchers) {
              if (v.id && seenVoucherIds.has(v.id)) continue;
              if (v.id) seenVoucherIds.add(v.id);
              if (v.paymentType === "INSCRIPTION" && !v.isVoided && !v.isRefund && v.classId) {
                const refunded = (v.refunds || []).reduce((rSum: number, r: any) => rSum + Number(r.amount || 0), 0);
                const netPaid = Math.max(0, Number(v.amount || 0) - refunded);
                if (netPaid > 0) {
                  paidInscByClass.set(v.classId, (paidInscByClass.get(v.classId) || 0) + netPaid);
                }
              }
            }

            const isTargetFormation = Boolean(classTarget.isFormation);
            const totalPaid = paidInscByClass.get(classTarget.id) || 0;
            const hasPaidThreeInscriptions = isTargetFormation ? false : paidInscByClass.size >= 3;

            // Inscription fee status
            let inscriptionStatus = "غير مدفوع";
            if (totalPaid > 0) {
              inscriptionStatus = `مدفوع (${totalPaid.toFixed()} دج)`;
            } else if (enrollment.feeOverriddenByOwner && !enrollment.inscriptionFeeCharged) {
              inscriptionStatus = "معفى (استثناء مالك)";
            } else if (!isTargetFormation && (!enrollment.inscriptionFeeCharged || hasPaidThreeInscriptions || enrPayerStatus === "NON_PAYER")) {
              inscriptionStatus = "معفى (مسدد في 3 أفواج)";
            }

            // Book fee status
            let bookStatus = "-";
            if (hasBooks) {
              const bookVoucher = studentVouchers.find(v => v.paymentType === "BOOK");
              bookStatus = bookVoucher ? `مدفوع (${Number(bookVoucher.amount).toFixed()} دج)` : "غير مدفوع";
            }

            // Sibling discount waiver & percentage
            const family = student.family;
            const isWaivedSibling = Boolean(
              family && family.payerStudentId && family.payerStudentId !== student.id
            );
            const siblingDiscountPct = isWaivedSibling ? Number(family?.discountPercentage ?? 50) : 0;

            // Tuition vouchers calculation
            const tuitionVouchers = studentVouchers.filter(v => v.paymentType === "TUITION_4SESSION");
            
            const studentAtts: Array<{ lessonId: number; status: string }> = [];
            classTarget.lessons.forEach(l => {
              const att = l.attendances.find(a => a.studentId === student.id);
              if (att) {
                studentAtts.push({ lessonId: l.id, status: att.status });
              }
            });

            const isFormation = Boolean((classTarget as any).isFormation || (classTarget as any).FormationLevel || (classTarget as any).formationLevelId);

            const classCatchUps = ((student as any).catchUpAttendances || []).filter(
              (cu: any) => classTarget.lessons.some((l) => l.id === cu.missedLessonId || l.id === cu.catchUpLessonId)
            );

            const isSiblingWaived100 = isWaivedSibling && siblingDiscountPct >= 100;

            const payerCredit = isWaivedSibling && family?.payerStudent
              ? resolvePayerCredit({
                  payerStudent: family.payerStudent,
                })
              : null;
            const isPayerActiveAndPaid = isWaivedSibling
              ? Boolean(payerCredit?.isPayerActiveAndPaid)
              : true;

            const teacherClassOverride = (classTarget.teacherClassRates as any[])?.find(
              (tcr: any) => tcr.teacherId === classTarget.teacherId
            )?.percentage;
            const teacherPercentage = teacherClassOverride != null
              ? Number(teacherClassOverride)
              : (classTarget as any).teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee
                ? Number((classTarget as any).teacher.TeacherPayRate[0].percentageOfSessionFee)
                : null;

            const creditMetrics = computeStudentCreditAndSessions({
              pricePerCycle: Number(classTarget.pricePerCycle || 0),
              isFormation,
              payerStatus: enrPayerStatus,
              siblingDiscountPercentage: siblingDiscountPct,
              isSiblingWaived: isSiblingWaived100,
              isPayerSiblingPaid: isPayerActiveAndPaid,
              payerRemainingCredit: isWaivedSibling && !isSiblingWaived100 ? payerCredit?.netSessions : undefined,
              tuitionVouchers,
              transfersIn: enrollment.transfersTo,
              transfersOut: enrollment.transfersFrom,
              creditResetOffset: (enrollment as any).creditResetOffset,
              attendances: studentAtts,
              catchUps: classCatchUps,
              lessons: classTarget.lessons as any,
              teacherPercentage,
            });

            const consumed = creditMetrics.attendedSessions;
            const remaining = isSiblingWaived100
              ? 0
              : isWaivedSibling && payerCredit
              ? payerCredit.netSessions
              : creditMetrics.netSessions;

            // Status label
            let statusText = "غير دافع";
            if (creditMetrics.isNonPayer) {
              statusText = "معفى من الرسوم";
            } else if (isSiblingWaived100) {
              statusText = isPayerActiveAndPaid ? "معفى (أخ دافع)" : "غير دافع (أخ)";
            } else if (creditMetrics.isSchoolFeesOnly) {
              if (remaining >= 2) {
                statusText = `دافع (${remaining} حصص - حصة المدرسة)`;
              } else if (remaining === 1) {
                statusText = "حصة واحدة متبقية (حصة المدرسة)";
              } else {
                statusText = "غير دافع (حصة المدرسة)";
              }
            } else if (isWaivedSibling) {
              if (remaining >= 2) {
                statusText = `دافع (خصم إخوة ${siblingDiscountPct}%)`;
              } else if (remaining === 1) {
                statusText = `قريب الانتهاء (خصم إخوة ${siblingDiscountPct}%)`;
              } else {
                statusText = `غير دافع (خصم إخوة ${siblingDiscountPct}%)`;
              }
            } else if (remaining >= 2) {
              statusText = "دافع";
            } else if (remaining === 1) {
              statusText = "قريب الانتهاء";
            }

            // Other branches enrolled
            const otherBranches = Array.from(
              new Set(
                student.enrollments
                  .map(e => e.class.branch.name)
                  .filter(bName => bName !== classTarget.branch.name)
              )
            ).join(", ") || "لا يوجد";

            // Cycles representation
            const purchasedSessions = isWaivedSibling && payerCredit
              ? Math.max(0, payerCredit.netSessions + consumed)
              : creditMetrics.purchasedSessions;
            const isExempt = creditMetrics.isNonPayer;
            const c1 = isExempt ? "معفى" : (purchasedSessions >= 4 ? "مدفوع" : "غير مدفوع");
            const c2 = isExempt ? "معفى" : (purchasedSessions >= 8 ? "مدفوع" : "غير مدفوع");
            const c3 = isExempt ? "معفى" : (purchasedSessions >= 12 ? "مدفوع" : "غير مدفوع");
            const c4 = isExempt ? "معفى" : (purchasedSessions >= 16 ? "مدفوع" : "غير مدفوع");

            paymentExportData.push({
              studentName: student.name,
              phone: student.phone || "-",
              registeredBranch: student.registeredBranch?.name || "-",
              otherBranches: otherBranches,
              inscriptionFee: inscriptionStatus,
              ...(hasBooks ? { bookFee: bookStatus } : {}),
              cycle1: c1,
              cycle2: c2,
              cycle3: c3,
              cycle4: c4,
              consumedSessions: consumed,
              remainingSessions: creditMetrics.isNonPayer ? "معفى" : remaining,
              status: statusText,
            });
        });

        paymentSheet.addRows(paymentExportData);
        paymentSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        paymentSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        break;

      case "attendance": {
        // 1. Safely get the filter options from the request
        const { classId, dateFrom, dateTo } = options || {};

        if (!classId) {
            return { success: false, error: true, message: "مطلوب معرف القسم (Class ID) لتصدير سجلات الحضور." };
        }

        const classData = await prisma.class.findUnique({
            where: { id: classId },
            include: {
                branch: true,
                teacherClassRates: true,
                teacher: {
                  include: {
                    TeacherPayRate: {
                      orderBy: { effectiveFrom: "desc" },
                      take: 1,
                    },
                  },
                },
                level: true,
                FormationLevel: { include: { Language: true } },
                vouchers: {
                    where: { isVoided: false },
                    include: { refunds: true },
                },
                enrollments: {
                    include: {
                        student: {
                            include: {
                                family: {
                                    include: {
                                        payerStudent: {
                                            include: {
                                                enrollments: {
                                                    include: {
                                                        class: { select: { id: true, pricePerCycle: true, isFormation: true } },
                                                        transfersFrom: true,
                                                        transfersTo: true,
                                                    },
                                                },
                                                vouchers: {
                                                    where: { isVoided: false, isRefund: false },
                                                    include: { refunds: true },
                                                },
                                                attendances: {
                                                    where: { lesson: { isFree: false } },
                                                    include: {
                                                        lesson: { select: { id: true, startsAt: true, isFree: true, classId: true, lessonGroups: { select: { classId: true } } } },
                                                    },
                                                },
                                                catchUpAttendances: {
                                                    include: {
                                                        missedLesson: {
                                                            select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } },
                                                        },
                                                        catchUpLesson: {
                                                            select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true, lessonGroups: { select: { classId: true } } },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                                vouchers: {
                                    where: { isVoided: false },
                                    include: { refunds: true },
                                },
                                catchUpAttendances: {
                                    select: { missedLessonId: true },
                                },
                                attendances: {
                                    where: {
                                        lesson: {
                                            classId: classId,
                                            ...(dateFrom && dateTo ? {
                                                startsAt: {
                                                    gte: new Date(dateFrom),
                                                    lte: new Date(dateTo + "T23:59:59.999"),
                                                }
                                            } : {})
                                        }
                                    },
                                    include: {
                                        lesson: true,
                                    }
                                }
                            }
                        },
                        transfersFrom: true,
                        transfersTo: true,
                    },
                    orderBy: [
                        { student: { name: 'asc' } },
                    ],
                },
                lessons: {
                    where: {
                        ...(dateFrom && dateTo ? {
                            startsAt: {
                                gte: new Date(dateFrom),
                                lte: new Date(dateTo + "T23:59:59.999"),
                            }
                        } : {})
                    },
                    include: {
                        attendances: true,
                    },
                    orderBy: { startsAt: 'asc' }
                }
            }
        });

        if (!classData) {
            return { success: false, error: true, message: "لم يتم العثور على القسم." };
        }

        const attendanceSheet = workbook.addWorksheet(classData.name.substring(0, 31));
        filename = `Registre_Presence_${classData.name.replace(/ /g, "_")}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // RTL orientation for Arabic ledger
        attendanceSheet.views = [{ rightToLeft: true }];

        const hasBooks = Boolean(classData.hasBooks);

        // Fetch book distributions/receipts if class has books
        const studentClaimedBooks = new Map<string, Set<number>>();
        if (hasBooks && classData.teacherId && classData.levelId) {
            try {
                const books = await prisma.book.findMany({
                    where: { teacherId: classData.teacherId, levelId: classData.levelId },
                    include: {
                        trimester: true,
                        receipts: true,
                        drops: { include: { distributions: true } }
                    },
                });
                for (const b of books) {
                    const tri = (b.trimester?.name?.includes("1") || b.trimester?.label?.includes("1") || b.title.includes("1")) ? 1 : (b.trimester?.name?.includes("2") || b.trimester?.label?.includes("2") || b.title.includes("2")) ? 2 : 3;
                    for (const r of b.receipts) {
                        if (!studentClaimedBooks.has(r.studentId)) studentClaimedBooks.set(r.studentId, new Set());
                        studentClaimedBooks.get(r.studentId)!.add(tri);
                    }
                    for (const d of b.drops) {
                        for (const dist of d.distributions) {
                            if (!studentClaimedBooks.has(dist.studentId)) studentClaimedBooks.set(dist.studentId, new Set());
                            studentClaimedBooks.get(dist.studentId)!.add(tri);
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching book distributions:", err);
            }
        }

        // Colors palette (ARGB)
        const C_HEADER_FILL = 'FF2F5597'; // Royal Navy Header
        const C_FREE_LESSON_COL = 'FFF9CB9C'; // Soft Light Orange for free lesson cells
        const C_FREE_LESSON_HDR = 'FFE69138'; // Darker Orange for free lesson header
        const C_PAID_YELLOW = 'FFFFFF77'; // Soft Yellow for paid sessions
        const C_ORANGE_ROW = 'FFFCE5CD'; // Light Orange for siblings & non-payers
        const C_BLUE_ROW = 'FFD9E1F2'; // Light Blue for school-part payers
        const C_PINK_CELL = 'FFF4CCCC'; // Light Pink for suspended/transferred/refunded
        const C_WHITE = 'FFFFFFFF';
        const C_BORDER_GRAY = 'FFD3D3D3';
        const C_BORDER_DARK = 'FF888888';

        const thinBorder: Partial<ExcelJS.Borders> = {
            top: { style: 'thin', color: { argb: C_BORDER_GRAY } },
            bottom: { style: 'thin', color: { argb: C_BORDER_GRAY } },
            left: { style: 'thin', color: { argb: C_BORDER_GRAY } },
            right: { style: 'thin', color: { argb: C_BORDER_GRAY } },
        };

        const totalCols = 2 + (hasBooks ? 3 : 0) + classData.lessons.length;

        // Row 1: Title Banner
        attendanceSheet.mergeCells(1, 1, 1, Math.max(totalCols, 6));
        const r1 = attendanceSheet.getCell(1, 1);
        r1.value = `مدرسة ماسينيسا - سجل الحضور والمتابعة (MASSINISSA SCHOOL)`;
        r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HEADER_FILL } };
        r1.alignment = { vertical: 'middle', horizontal: 'center' };
        attendanceSheet.getRow(1).height = 28;

        // Row 2: Metadata Bar
        const levelText = classData.level?.name || classData.FormationLevel?.Language?.name || '-';
        const teacherText = classData.teacher?.name || '-';
        const branchText = classData.branch?.name || '-';

        let scheduleText = '-';
        if (classData.lessons.length > 0) {
            const firstL = classData.lessons[0];
            const startStr = new Date(firstL.startsAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const endStr = new Date(firstL.endsAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            scheduleText = `${startStr} - ${endStr}`;
        }

        attendanceSheet.mergeCells(2, 1, 2, Math.max(totalCols, 6));
        const r2 = attendanceSheet.getCell(2, 1);
        r2.value = `الفوج: ${classData.name}   |   المستوى: ${levelText}   |   الأستاذ: ${teacherText}   |   التوقيت: ${scheduleText}   |   الفرع: ${branchText}`;
        r2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
        r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        r2.alignment = { vertical: 'middle', horizontal: 'center' };
        attendanceSheet.getRow(2).height = 22;

        // Row 3: Blank spacer
        attendanceSheet.getRow(3).height = 8;

        // Row 4: Single Date Table Header (DD/MM)
        const headerRowIndex = 4;
        const headerRow = attendanceSheet.getRow(headerRowIndex);
        headerRow.height = 26;

        let colIdx = 1;
        // Col 1: Numbering
        const cNum = attendanceSheet.getCell(headerRowIndex, colIdx++);
        cNum.value = 'الرقم';
        cNum.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cNum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
        cNum.alignment = { vertical: 'middle', horizontal: 'center' };
        cNum.border = thinBorder;
        attendanceSheet.getColumn(1).width = 7;

        // Col 2: Student Name and ID
        const cName = attendanceSheet.getCell(headerRowIndex, colIdx++);
        cName.value = 'اسم التلميذ (معرّف ID)';
        cName.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
        cName.alignment = { vertical: 'middle', horizontal: 'right' };
        cName.border = thinBorder;
        attendanceSheet.getColumn(2).width = 30;

        // Optional Books Columns: T1, T2, T3
        if (hasBooks) {
            ['T1', 'T2', 'T3'].forEach((tLabel) => {
                const cT = attendanceSheet.getCell(headerRowIndex, colIdx);
                cT.value = tLabel;
                cT.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
                cT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B6B82' } };
                cT.alignment = { vertical: 'middle', horizontal: 'center' };
                cT.border = thinBorder;
                attendanceSheet.getColumn(colIdx).width = 7;
                colIdx++;
            });
        }

        // Lesson Columns: single row formatted as DD/MM
        const lessonColMap = new Map<number, number>();
        classData.lessons.forEach((lesson) => {
            const lessonDate = new Date(lesson.startsAt);
            const dd = String(lessonDate.getDate()).padStart(2, '0');
            const mm = String(lessonDate.getMonth() + 1).padStart(2, '0');
            const dateStr = `${dd}/${mm}`;

            const cLesson = attendanceSheet.getCell(headerRowIndex, colIdx);
            cLesson.value = lesson.isFree ? `${dateStr}\n(مجانية)` : dateStr;
            cLesson.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
            cLesson.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: lesson.isFree ? C_FREE_LESSON_HDR : 'FF44546A' },
            };
            cLesson.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cLesson.border = thinBorder;
            attendanceSheet.getColumn(colIdx).width = 10;

            lessonColMap.set(lesson.id, colIdx);
            colIdx++;
        });

        // Rows 5..N: Students rows
        let currentRowIdx = 5;

        classData.enrollments.forEach((enrollment, studentIdx) => {
            const student = enrollment.student;
            const studentRow = attendanceSheet.getRow(currentRowIdx);
            studentRow.height = 20;

            const enrPayerStatus = enrollment.payerStatus || (student as any).payerStatus || "NORMAL";
            const family = student.family;
            const isWaivedSibling = Boolean(family && family.payerStudentId && family.payerStudentId !== student.id);
            const siblingDiscountPct = isWaivedSibling ? Number(family?.discountPercentage ?? 50) : 0;
            const isSiblingWaived100 = isWaivedSibling && siblingDiscountPct >= 100;
            const isNonPayer = enrPayerStatus === "NON_PAYER" || enrPayerStatus === "FREE_ALL" || enrPayerStatus === "FREE_TUITION";
            const isSchoolOnly = enrPayerStatus === "SCHOOL_FEES_ONLY";

            const payerCredit = isWaivedSibling && family?.payerStudent
                ? resolvePayerCredit({
                    payerStudent: family.payerStudent,
                })
                : null;
            const isPayerActiveAndPaid = isWaivedSibling
                ? Boolean(payerCredit?.isPayerActiveAndPaid)
                : true;

            // Determine row identity fill color
            let rowIdentityFill = C_WHITE;
            if (isNonPayer || isWaivedSibling) {
                rowIdentityFill = C_ORANGE_ROW; // Orange row for siblings & non-payers
            } else if (isSchoolOnly) {
                rowIdentityFill = C_BLUE_ROW; // Blue row for school-part payers
            }

            // Student vouchers and calculations
            const studentVouchers = (student.vouchers || []).filter((v: any) => v.classId === classData.id && !v.isRefund && !v.isVoided);
            const tuitionVouchers = studentVouchers.filter((v: any) => v.paymentType === "TUITION_4SESSION" || v.paymentType === "FORMATION");

            const studentAtts: Array<{ lessonId: number; status: string }> = [];
            classData.lessons.forEach((l) => {
                const att = l.attendances.find((a: any) => a.studentId === student.id);
                if (att) {
                    studentAtts.push({ lessonId: l.id, status: att.status });
                }
            });

            const classCatchUps = ((student as any).catchUpAttendances || []).filter(
                (cu: any) => classData.lessons.some((l) => l.id === cu.missedLessonId || l.id === cu.catchUpLessonId)
            );

            const teacherClassOverride = (classData.teacherClassRates as any[])?.find(
              (tcr: any) => tcr.teacherId === classData.teacherId
            )?.percentage;
            const teacherPercentage = teacherClassOverride != null
              ? Number(teacherClassOverride)
              : (classData.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee
                ? Number((classData.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
                : null;

            const creditMetrics = computeStudentCreditAndSessions({
                pricePerCycle: Number(classData.pricePerCycle || 0),
                isFormation: Boolean(classData.isFormation),
                payerStatus: enrPayerStatus,
                siblingDiscountPercentage: siblingDiscountPct,
                isSiblingWaived: isSiblingWaived100,
                isPayerSiblingPaid: isPayerActiveAndPaid,
                payerRemainingCredit: isWaivedSibling && !isSiblingWaived100 ? payerCredit?.netSessions : undefined,
                tuitionVouchers,
                transfersIn: enrollment.transfersTo,
                transfersOut: enrollment.transfersFrom,
                creditResetOffset: enrollment.creditResetOffset,
                attendances: studentAtts,
                lessons: classData.lessons as any,
                catchUps: classCatchUps,
                teacherPercentage,
            });

            const paidSessionsCount = isNonPayer || isSiblingWaived100
                ? 9999
                : isWaivedSibling && payerCredit
                ? Math.max(0, payerCredit.netSessions + creditMetrics.attendedSessions)
                : Math.max(0, creditMetrics.purchasedSessions + creditMetrics.transferredIn - creditMetrics.transferredOut);

            // Suspension check
            const consecutiveAbs = computeStudentConsecutiveAbsences({
                lessons: classData.lessons as any,
                attendances: studentAtts,
                catchUps: classCatchUps,
            });
            const isSuspended = enrollment.status === "SUSPENDED" || consecutiveAbs >= 3;
            const isTransferred = enrollment.status === "TRANSFERRED" || (enrollment.transfersFrom && enrollment.transfersFrom.length > 0 && enrollment.status !== "ACTIVE");
            const isRefunded = enrollment.status === "REFUNDED" || studentVouchers.some((v: any) => v.refunds && v.refunds.length > 0);

            let curCol = 1;

            // 1. Index
            const cellIdx = attendanceSheet.getCell(currentRowIdx, curCol++);
            cellIdx.value = studentIdx + 1;
            cellIdx.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF333333' } };
            cellIdx.alignment = { vertical: 'middle', horizontal: 'center' };
            cellIdx.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIdentityFill } };
            cellIdx.border = thinBorder;

            // 2. Student Name + ID
            const cellName = attendanceSheet.getCell(currentRowIdx, curCol++);
            cellName.value = `${student.name} (#${student.globalNumber || student.id})`;
            cellName.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF111111' } };
            cellName.alignment = { vertical: 'middle', horizontal: 'right' };
            cellName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIdentityFill } };
            cellName.border = thinBorder;

            // 3. Books: T1, T2, T3
            if (hasBooks) {
                const bookVouchers = studentVouchers.filter((v: any) => v.paymentType === "BOOK");
                const hasBookVoucher = bookVouchers.length > 0;
                const claimedSet = studentClaimedBooks.get(student.id) || new Set<number>();

                [1, 2, 3].forEach((tri) => {
                    const cellT = attendanceSheet.getCell(currentRowIdx, curCol++);
                    const isBookPaidAndClaimed = (hasBookVoucher && claimedSet.has(tri)) || claimedSet.has(tri) || (hasBookVoucher && tri === 1);
                    cellT.value = isBookPaidAndClaimed ? 'X' : '-';
                    cellT.font = { name: 'Calibri', size: 10, bold: isBookPaidAndClaimed, color: { argb: isBookPaidAndClaimed ? 'FF006100' : 'FF888888' } };
                    cellT.alignment = { vertical: 'middle', horizontal: 'center' };
                    cellT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIdentityFill } };
                    cellT.border = thinBorder;
                });
            }

            // 4. Session Attendance Cells
            let nonFreeIndex = 0;
            classData.lessons.forEach((lesson) => {
                const cellLesson = attendanceSheet.getCell(currentRowIdx, curCol++);
                const att = lesson.attendances.find((a: any) => a.studentId === student.id);
                const hasCatchUp = classCatchUps.some((cu: any) => cu.missedLessonId === lesson.id);

                let mark = '-';
                if (att) {
                    if (att.status === 'PRESENT' || hasCatchUp) {
                        mark = 'X';
                    } else if (att.status === 'ABSENT') {
                        mark = 'A';
                    }
                }

                if (lesson.isFree) {
                    // Free lesson column is orange
                    cellLesson.value = mark;
                    cellLesson.font = { name: 'Calibri', size: 10, bold: mark === 'X', color: { argb: mark === 'X' ? 'FF111111' : mark === 'A' ? 'FFCC0000' : 'FF777777' } };
                    cellLesson.alignment = { vertical: 'middle', horizontal: 'center' };
                    cellLesson.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_FREE_LESSON_COL } };
                    cellLesson.border = thinBorder;
                } else {
                    const isLessonPaid = nonFreeIndex < paidSessionsCount;

                    if (isLessonPaid) {
                        // Paid lesson is yellow
                        cellLesson.value = mark;
                        cellLesson.font = { name: 'Calibri', size: 10, bold: mark === 'X', color: { argb: mark === 'X' ? 'FF000000' : mark === 'A' ? 'FFCC0000' : 'FF555555' } };
                        cellLesson.alignment = { vertical: 'middle', horizontal: 'center' };
                        cellLesson.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_PAID_YELLOW } };
                        cellLesson.border = thinBorder;
                    } else {
                        // Non-yellow cell: if suspended/transferred/refunded -> pink highlight with mention
                        if (isTransferred || isRefunded || isSuspended) {
                            const statusMention = isTransferred ? "تم التحويل" : isRefunded ? "مسترجع" : "معلق";
                            cellLesson.value = statusMention;
                            cellLesson.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF9C0006' } };
                            cellLesson.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                            cellLesson.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_PINK_CELL } };
                            cellLesson.border = thinBorder;
                        } else {
                            // Normal unpaid cell
                            cellLesson.value = mark !== '-' ? mark : '';
                            cellLesson.font = { name: 'Calibri', size: 10, bold: mark === 'X', color: { argb: mark === 'A' ? 'FFCC0000' : 'FF555555' } };
                            cellLesson.alignment = { vertical: 'middle', horizontal: 'center' };
                            cellLesson.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_WHITE } };
                            cellLesson.border = thinBorder;
                        }
                    }
                    nonFreeIndex++;
                }
            });

            currentRowIdx++;
        });

        // Summary Tally Row
        const summaryRowIdx = currentRowIdx;
        const summaryRow = attendanceSheet.getRow(summaryRowIdx);
        summaryRow.height = 22;

        const sumLabelCell = attendanceSheet.getCell(summaryRowIdx, 2);
        sumLabelCell.value = 'مجموع الحضور (Présents)';
        sumLabelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        sumLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
        sumLabelCell.alignment = { vertical: 'middle', horizontal: 'center' };
        sumLabelCell.border = thinBorder;

        // Fill index cell
        const sumIdxCell = attendanceSheet.getCell(summaryRowIdx, 1);
        sumIdxCell.value = 'Σ';
        sumIdxCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        sumIdxCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
        sumIdxCell.alignment = { vertical: 'middle', horizontal: 'center' };
        sumIdxCell.border = thinBorder;

        // Fill book cols if any
        if (hasBooks) {
            [3, 4, 5].forEach((bCol) => {
                const cB = attendanceSheet.getCell(summaryRowIdx, bCol);
                cB.value = '';
                cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
                cB.border = thinBorder;
            });
        }

        // Calculate and place count of present students for each lesson
        classData.lessons.forEach((lesson) => {
            const colNumber = lessonColMap.get(lesson.id);
            if (!colNumber) return;

            let presentCount = 0;
            for (let r = 5; r < summaryRowIdx; r++) {
                const cellVal = attendanceSheet.getCell(r, colNumber).value;
                if (cellVal === 'X') presentCount++;
            }

            const sumCell = attendanceSheet.getCell(summaryRowIdx, colNumber);
            sumCell.value = presentCount;
            sumCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lesson.isFree ? C_FREE_LESSON_HDR : 'FF44546A' } };
            sumCell.alignment = { vertical: 'middle', horizontal: 'center' };
            sumCell.border = thinBorder;
        });

        // Freeze headers: first 2 identity columns and top 4 rows
        attendanceSheet.views = [
            {
                state: 'frozen',
                xSplit: hasBooks ? 5 : 2,
                ySplit: 4,
                rightToLeft: true,
            }
        ];

        break;
      }

    case "workshop_details":
        if (!options?.workshopId) {
            return { success: false, error: true, message: "مطلوب معرف الدورة (Workshop ID) لإجراء عملية التصدير." };
        }
        const workshopSheet = workbook.addWorksheet("Workshop Roster");
        const workshopDetails = await prisma.workshop.findUnique({
            where: { id: options.workshopId },
            include: {
                sessions: {
                    include: {
                        attendances: true,
                    }
                },
                participants: {
                    include: {
                        Student: true,
                    }
                }
            }
        });

        if (!workshopDetails) {
            return { success: false, error: true, message: "لم يتم العثور على الدورة المطلوبة." };
        }

        filename = `${workshopDetails.title.replace(/ /g, "_")}_roster_${new Date().toISOString().split('T')[0]}.xlsx`;

        workshopSheet.columns = [
            { header: "Chair Number", key: "chairNumber", width: 15 },
            { header: "Participant Name", key: "name", width: 30 },
            { header: "Gender", key: "gender", width: 15 },
            { header: "Net Paid", key: "netPaid", width: 15, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Status", key: "paymentStatus", width: 20 },
            { header: "Sessions Attended", key: "sessionsAttended", width: 20 },
            { header: "Total Sessions", key: "totalSessions", width: 20 },
        ];

        const workshopData = workshopDetails.participants.map(p => {
            const netPaid = Number(p.totalPaid) - Number(p.totalRefunded);
            const sessionsAttended = workshopDetails.sessions
                .flatMap(s => s.attendances)
                .filter(a => a.studentId === p.studentId && a.status === 'PRESENT').length;

            return {
                chairNumber: p.chairNumber ?? "-",
                name: p.Student.name,
                gender: p.gender === "FEMALE" ? "Female / أنثى" : "Male / ذكر",
                netPaid: netPaid,
                paymentStatus: p.status,
                sessionsAttended: sessionsAttended,
                totalSessions: workshopDetails.sessions.length,
            };
        });

        workshopSheet.addRows(workshopData);
        workshopSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        workshopSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800080' } };
        break;

      case "workshop_attendance":
        if (!options?.workshopId) {
            return { success: false, error: true, message: "مطلوب معرف الدورة (Workshop ID) لتصدير سجل الحضور." };
        }
        const wsData = await prisma.workshop.findUnique({
            where: { id: options.workshopId },
            include: {
                sessions: {
                    include: {
                        attendances: true,
                    },
                    orderBy: { startsAt: 'asc' }
                },
                participants: {
                    include: {
                        Student: true,
                    },
                    orderBy: [
                        { chairNumber: 'asc' },
                        { id: 'asc' }
                    ]
                }
            }
        });

        if (!wsData) {
            return { success: false, error: true, message: "لم يتم العثور على الدورة المطلوبة." };
        }

        filename = `Presence_${wsData.title.replace(/ /g, "_")}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const wsAttendanceSheet = workbook.addWorksheet("Feuille de Présence");

        wsAttendanceSheet.columns = [
            { header: "N° Chaise / رقم الكرسي", key: "chairNumber", width: 14 },
            { header: "Élève / التلميذ", key: "studentName", width: 28 },
            { header: "Genre / الجنس", key: "gender", width: 14 },
            { header: "Téléphone / الهاتف", key: "phone", width: 16 },
            ...wsData.sessions.map((s, idx) => ({
                header: `Séance ${idx + 1}\n${new Date(s.startsAt).toLocaleDateString('fr-DZ')}`,
                key: `session_${s.id}`,
                width: 16,
            })),
            { header: "Total Présent / مجموع الحضور", key: "totalPresent", width: 18 },
            { header: "Taux / النسبة", key: "rate", width: 14 },
        ];

        const wsRows = wsData.participants.map(p => {
            let presentCount = 0;
            const row: { [key: string]: any } = {
                chairNumber: p.chairNumber != null ? `#${p.chairNumber}` : "-",
                studentName: p.Student?.name || `Élève #${p.studentId}`,
                gender: p.gender === "FEMALE" ? "Fille / أنثى" : "Garçon / ذكر",
                phone: p.Student?.phone || "-",
            };

            wsData.sessions.forEach(s => {
                const att = s.attendances.find(a => a.studentId === p.studentId);
                if (att) {
                    if (att.status === 'PRESENT') {
                        row[`session_${s.id}`] = 'Présent';
                        presentCount++;
                    } else {
                        row[`session_${s.id}`] = 'Absent';
                    }
                } else {
                    row[`session_${s.id}`] = '-';
                }
            });

            row.totalPresent = `${presentCount} / ${wsData.sessions.length}`;
            row.rate = wsData.sessions.length > 0 ? `${Math.round((presentCount / wsData.sessions.length) * 100)}%` : '0%';
            return row;
        });

        wsAttendanceSheet.addRows(wsRows);

        const wsHeaderRow = wsAttendanceSheet.getRow(1);
        wsHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        wsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800080' } };
        wsHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        wsAttendanceSheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

        wsAttendanceSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    if (colNumber > 4 && colNumber <= 4 + wsData.sessions.length) {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        if (cell.value === 'Présent') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                            cell.font = { color: { argb: 'FF006100' } };
                        } else if (cell.value === 'Absent') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                            cell.font = { color: { argb: 'FF9C0006' } };
                        }
                    }
                });
            }
        });
        break;

      case "financial_report":
        const startOfRange = new Date(options?.dateFrom || new Date());
        startOfRange.setHours(0, 0, 0, 0);
        const endOfRange = new Date(options?.dateTo || options?.dateFrom || new Date());
        endOfRange.setHours(23, 59, 59, 999);

        const incomeSheet = workbook.addWorksheet("Income");
        const outcomeSheet = workbook.addWorksheet("Outcome (Refunds)");
        const summarySheet = workbook.addWorksheet("Summary");
        
        const incomeVouchers = await prisma.voucher.findMany({
          where: {
            isVoided: false,
            issuedAt: { gte: startOfRange, lte: endOfRange },
            ...(options?.classId && { classId: options.classId }),
          },
          include: { student: true, class: true, workshop: true },
        });

        const refunds = await prisma.refund.findMany({
          where: {
            refundedAt: { gte: startOfRange, lte: endOfRange },
            ...(options?.classId && { voucher: { classId: options.classId } }),
          },
          include: {
            voucher: {
              include: { student: true, class: true, workshop: true },
            },
          },
        });

        // --- Income Sheet ---
        const incomeColumns = [
            { header: "Date", key: "date", width: 15 },
            { header: "Type", key: "type", width: 20 },
            { header: "Source", key: "source", width: 25 },
            { header: "Student", key: "person", width: 25 },
            { header: "Amount (DZD)", key: "amount", width: 15 },
            { header: "Notes", key: "notes", width: 40 },
        ];
        incomeSheet.columns = incomeColumns;
        incomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        incomeSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        
        const allIncome = incomeVouchers.map(v => ({
          date: v.issuedAt.toLocaleDateString(),
          type: v.paymentType,
          source: v.class?.name || v.workshop?.title || "ورشة عمل / دورة",
          person: v.student.name,
          amount: Number(v.amount),
          notes: `وصل رقم ${v.number}`,
        }));
        incomeSheet.addRows(allIncome);
        const totalIncome = allIncome.reduce((sum, i) => sum + i.amount, 0);
        
        // Add Total row for Income
        incomeSheet.addRow([]); // Spacer
        const incomeTotalRow = incomeSheet.addRow(['', '', '', 'Total Income:', totalIncome]);
        incomeTotalRow.getCell(4).font = { bold: true };
        incomeTotalRow.getCell(5).font = { bold: true, color: { argb: 'FF00B050' } };

        // --- Outcome Sheet (Refunds) ---
        const outcomeColumns = [
            { header: "Date", key: "date", width: 20 },
            { header: "Type", key: "type", width: 20 },
            { header: "Source", key: "source", width: 30 },
            { header: "Person", key: "person", width: 30 },
            { header: "Refunded By", key: "refundedBy", width: 20 },
            { header: "Amount", key: "amount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Reason", key: "notes", width: 40 },
        ];
        outcomeSheet.columns = outcomeColumns;
        outcomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        outcomeSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFC00000'} };

        const allOutcomes = refunds.map(r => ({
            date: r.refundedAt.toLocaleDateString(),
            type: `استرداد (${r.voucher.paymentType})`,
            source: r.voucher.class?.name || `وصل #${r.voucher.number}`,
            person: r.voucher.student?.name || `تلميذ #${r.voucher.studentId}`,
            refundedBy: r.refundedBy,
            amount: Number(r.amount),
            notes: `وصل #${r.voucher.number} - ${r.reason}`,
        }));
        outcomeSheet.addRows(allOutcomes);
        const totalOutcome = allOutcomes.reduce((sum, o) => sum + o.amount, 0);

        // Add Total row for Outcome
        outcomeSheet.addRow([]); // Spacer
        const outcomeTotalRow = outcomeSheet.addRow(['', '', '', '', 'Total Outcome (Refunds):', totalOutcome]);
        outcomeTotalRow.getCell(5).font = { bold: true };
        outcomeTotalRow.getCell(6).font = { bold: true, color: { argb: 'FFFF0000' } };

        // --- Summary Sheet ---
        const netTotal = totalIncome - totalOutcome;

        // Add Report Header to Summary
        summarySheet.mergeCells('A1:B1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = `Financial Summary`;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // --- UPDATED DATE RANGE LOGIC ---
        
        // Combine all fetched transactions to find the actual date span
        const allTransactions = [
          ...incomeVouchers.map(v => ({ date: v.issuedAt })),
          ...refunds.map(r => ({ date: r.refundedAt })),
        ];
        let dateRange = 'All Time';
        const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        
        if (options?.dateFrom && options?.dateTo) {
            // Case 1: A specific date range was provided by the user.
            if (options.dateFrom === options.dateTo) {
                dateRange = new Date(options.dateFrom + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
            } else {
                const from = new Date(options.dateFrom + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
                const to = new Date(options.dateTo + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
                dateRange = `${from} to ${to}`;
            }
        } else if (allTransactions.length > 0) {
            // Case 2: No date range was provided, so we calculate it from the actual data.
            const allDates = allTransactions.map(t => t.date.getTime());
            const minDate = new Date(Math.min(...allDates));
            const maxDate = new Date(Math.max(...allDates));
            
            const from = minDate.toLocaleDateString('fr-DZ', dateOptions);
            const to = maxDate.toLocaleDateString('fr-DZ', dateOptions);
        
            // If the min and max date are the same day, just show one date.
            dateRange = from === to ? from : `${from} to ${to}`;
        } else {
            // Case 3: No date range provided AND no transactions were found.
            dateRange = "No transactions found";
        }
        
        summarySheet.mergeCells('A2:B2');
        const dateCell = summarySheet.getCell('A2');
        dateCell.value = `Date Range: ${dateRange}`;

        dateCell.font = { size: 12, italic: true };
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' };
        summarySheet.addRow({}); // Spacer row

        summarySheet.columns = [ { header: 'Metric', key: 'metric', width: 25 }, { header: 'Amount', key: 'amount', width: 25, style: { numFmt: '"DZD"#,##0.00' } } ];
        const summaryHeaderRow = summarySheet.getRow(4);
        summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summaryHeaderRow.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF44546A'} };

        summarySheet.addRows([
            { metric: 'Total Income', amount: totalIncome },
            { metric: 'Total Outcome (Refunds)', amount: totalOutcome },
            { metric: 'Net Total', amount: netTotal },
        ]);

        const totalIncomeCell = summarySheet.getCell('B5');
        totalIncomeCell.font = { bold: true, color: { argb: 'FF00B050' } }; // Green
        const totalOutcomeCell = summarySheet.getCell('B6');
        totalOutcomeCell.font = { bold: true, color: { argb: totalOutcome > 0 ? 'FFFF0000' : 'FF000000' } }; // Red
        const netTotalCell = summarySheet.getCell('B7');
        netTotalCell.font = { bold: true, size: 12, color: { argb: netTotal >= 0 ? 'FF0070C0' : 'FFFF0000' } }; // Blue or Red
        
        break;

      case "daily_revenue":
        const branchParam = options?.branchId === "all" || !options?.branchId ? "all" : Number(options.branchId);
        const revenueData = await getDailyRevenueDashboardData({
          branchId: branchParam,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          periodMode: options?.periodMode || "daily",
        });

        const branchLabel = branchParam === "all" 
          ? "Toutes_les_branches" 
          : (revenueData.branches.find(b => b.id === branchParam)?.name || `Branche_${branchParam}`);
        
        filename = `Recettes_${branchLabel}_${options?.periodMode || "journalier"}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // --- Sheet 1: Synthèse / Summary ---
        const revSummarySheet = workbook.addWorksheet("Synthèse financière");
        revSummarySheet.mergeCells("A1:D1");
        const revTitleCell = revSummarySheet.getCell("A1");
        revTitleCell.value = `Massinissa School - Rapport des Recettes (${branchParam === "all" ? "Consolidé - 3 Branches" : branchLabel})`;
        revTitleCell.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        revTitleCell.alignment = { vertical: "middle", horizontal: "center" };
        revTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F85FC" } };

        revSummarySheet.addRow([]);
        revSummarySheet.addRow(["Période du:", revenueData.dateFrom, "au:", revenueData.dateTo]);
        revSummarySheet.addRow(["Mode d'agrégation:", options?.periodMode || "daily", "Branche sélectionnée:", branchParam === "all" ? "Consolidé (3 branches)" : branchLabel]);
        revSummarySheet.addRow([]);

        revSummarySheet.addRow(["Catégorie de Recette", "Montant (DZD)", "Part du Brut (%)"]);
        const sumHeader = revSummarySheet.getRow(6);
        sumHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
        sumHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF44546A" } };

        const gross = revenueData.summary.grossRevenue;
        const calcShare = (val: number) => (gross > 0 ? ((val / gross) * 100).toFixed(1) + "%" : "0.0%");

        revSummarySheet.addRows([
          ["Frais d'inscription (INSCRIPTION)", revenueData.summary.inscription, calcShare(revenueData.summary.inscription)],
          ["Frais de scolarité (TUITION)", revenueData.summary.tuition, calcShare(revenueData.summary.tuition)],
          ["Frais de livres (BOOK)", revenueData.summary.book, calcShare(revenueData.summary.book)],
          ["Ateliers & Formations (ATELIER / FORMATION)", revenueData.summary.atelierFormation, calcShare(revenueData.summary.atelierFormation)],
          [],
          ["TOTAL RECETTES BRUTES", revenueData.summary.grossRevenue, "100.0%"],
          ["REMBOURSEMENTS (REFUNDS - Déduits)", revenueData.summary.refunds, "-"],
          ["RECETTE NETTE FINALE", revenueData.summary.netRevenue, "-"],
        ]);

        revSummarySheet.getColumn(1).width = 45;
        revSummarySheet.getColumn(2).width = 25;
        revSummarySheet.getColumn(3).width = 20;
        revSummarySheet.getColumn(2).numFmt = '"DZD"#,##0.00';

        const rowGross = revSummarySheet.getRow(12);
        rowGross.font = { bold: true, color: { argb: "FF00B050" } };
        const rowRefunds = revSummarySheet.getRow(13);
        rowRefunds.font = { bold: true, color: { argb: "FFFF0000" } };
        const rowNet = revSummarySheet.getRow(14);
        rowNet.font = { bold: true, size: 12, color: { argb: "FF0070C0" } };

        // --- Sheet 2: Évolution par Période (Timeline) ---
        const timelineSheet = workbook.addWorksheet("Détail par période");
        timelineSheet.columns = [
          { header: "Période", key: "label", width: 25 },
          { header: "Date début", key: "dateStart", width: 15 },
          { header: "Date fin", key: "dateEnd", width: 15 },
          { header: "Inscription", key: "inscription", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Scolarité", key: "tuition", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Livres", key: "book", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Atelier/Formation", key: "atelierFormation", width: 22, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Brut", key: "grossRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Remboursements", key: "refunds", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Net", key: "netRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
        ];
        timelineSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        timelineSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F85FC" } };

        for (const tRow of revenueData.timeline) {
          timelineSheet.addRow({
            label: tRow.label,
            dateStart: tRow.dateStart,
            dateEnd: tRow.dateEnd,
            inscription: tRow.inscription,
            tuition: tRow.tuition,
            book: tRow.book,
            atelierFormation: tRow.atelierFormation,
            grossRevenue: tRow.grossRevenue,
            refunds: tRow.refunds,
            netRevenue: tRow.netRevenue,
          });
        }

        // --- Sheet 3: Comparaison des Branches (ECOLE, ANNEX, AMPHI) ---
        const branchSheet = workbook.addWorksheet("Comparaison des branches");
        branchSheet.columns = [
          { header: "Branche", key: "branchName", width: 20 },
          { header: "Inscription", key: "inscription", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Scolarité", key: "tuition", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Livres", key: "book", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Atelier/Formation", key: "atelierFormation", width: 22, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Brut", key: "grossRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Remboursements", key: "refunds", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Net", key: "netRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
        ];
        branchSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        branchSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F85FC" } };

        for (const bRow of revenueData.branchComparison) {
          branchSheet.addRow({
            branchName: bRow.branchName,
            inscription: bRow.inscription,
            tuition: bRow.tuition,
            book: bRow.book,
            atelierFormation: bRow.atelierFormation,
            grossRevenue: bRow.grossRevenue,
            refunds: bRow.refunds,
            netRevenue: bRow.netRevenue,
          });
        }

        // --- Sheet 4: Détail des Remboursements (Phase 6 - Distincts, non-nettoyés) ---
        const refundSheet = workbook.addWorksheet("Remboursements (Détail)");
        refundSheet.columns = [
          { header: "Date", key: "date", width: 20 },
          { header: "Branche", key: "branch", width: 18 },
          { header: "N° Reçu", key: "voucherNumber", width: 15 },
          { header: "Élève", key: "student", width: 25 },
          { header: "Classe / Motif", key: "reason", width: 35 },
          { header: "Montant remboursé", key: "amount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Remboursé par", key: "refundedBy", width: 20 },
        ];
        refundSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        refundSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9534F" } };

        const startOfRangeDate = new Date(revenueData.dateFrom + "T00:00:00.000Z");
        const endOfRangeDate = new Date(revenueData.dateTo + "T23:59:59.999Z");

        const detailedRefunds = await prisma.refund.findMany({
          where: {
            refundedAt: { gte: startOfRangeDate, lte: endOfRangeDate },
            ...(branchParam !== "all" ? { voucher: { targetBranchId: Number(branchParam) } } : {}),
          },
          include: {
            voucher: {
              include: {
                student: true,
                class: { include: { branch: true } },
              },
            },
          },
          orderBy: { refundedAt: "desc" },
        });

        for (const ref of detailedRefunds) {
          refundSheet.addRow({
            date: ref.refundedAt.toISOString().split("T")[0],
            branch: ref.voucher?.class?.branch?.name || "-",
            voucherNumber: `#${ref.voucher?.number || ref.voucherId}`,
            student: ref.voucher?.student?.name || "-",
            reason: ref.reason,
            amount: Number(ref.amount),
            refundedBy: ref.refundedBy,
          });
        }
        break;


      default:
        return { success: false, error: true, message: "Invalid export type specified." };
    }

    // Generate the Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return the file data as a base64 encoded string for download
    return {
      success: true,
      error: false,
      file: {
        content: Buffer.from(buffer).toString("base64"),
        name: filename,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    };

  } catch (err) {
    console.error("Export Error:", err);
    return { success: false, error: true, message: "Failed to export data." };
  }
};

// ============================================================================
// PAYROLL SERVER ACTIONS (§1.3, §2.5)
// ============================================================================

import {
  generatePayrollRun,
  updatePayrollRunStatus,
  deletePayrollRun,
} from "./payroll";

/**
 * Configure or update a teacher's pay rate (per-session or fixed-monthly),
 * and optionally set per-branch overrides on TeacherBranch.
 */
export async function saveTeacherPayRateAction(formData: {
  teacherId: string;
  ratePerSession?: number | null;
  fixedMonthly?: number | null;
  effectiveFrom?: string | Date;
  branchRates?: Array<{ branchId: number; payRate: number | null }>;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const effectiveDate = formData.effectiveFrom
      ? new Date(formData.effectiveFrom)
      : new Date();

    await prisma.$transaction(async (tx) => {
      // 1. Create or update general pay rate
      await tx.teacherPayRate.create({
        data: {
          teacherId: formData.teacherId,
          ratePerSession:
            formData.ratePerSession !== undefined && formData.ratePerSession !== null
              ? new Prisma.Decimal(formData.ratePerSession)
              : null,
          fixedMonthly:
            formData.fixedMonthly !== undefined && formData.fixedMonthly !== null
              ? new Prisma.Decimal(formData.fixedMonthly)
              : null,
          effectiveFrom: effectiveDate,
        },
      });

      // 2. Update branch rate overrides if specified
      if (formData.branchRates && formData.branchRates.length > 0) {
        for (const br of formData.branchRates) {
          await tx.teacherBranch.upsert({
            where: {
              teacherId_branchId: {
                teacherId: formData.teacherId,
                branchId: br.branchId,
              },
            },
            create: {
              teacherId: formData.teacherId,
              branchId: br.branchId,
              payRate:
                br.payRate !== null && br.payRate !== undefined
                  ? new Prisma.Decimal(br.payRate)
                  : null,
            },
            update: {
              payRate:
                br.payRate !== null && br.payRate !== undefined
                  ? new Prisma.Decimal(br.payRate)
                  : null,
            },
          });
        }
      }
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    return { success: true, error: false, message: "تم تحديث تسعيرة الأستاذ بنجاح" };
  } catch (error: any) {
    console.error("Error in saveTeacherPayRateAction:", error);
    return { success: false, error: true, message: error.message || "فشل حفظ التسعيرة" };
  }
}

/**
 * Record Photocopy Cost for a teacher (§2.5).
 * Internal charge deducted from the teacher's next payslip, never student-facing.
 */
export async function recordPhotocopyChargeAction(formData: {
  teacherId: string;
  branchId: number;
  classId?: number | null;
  pages: number;
  costAmount: number;
  date?: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const recordedBy = session.userId || "admin";
    const chargeDate = formData.date ? new Date(formData.date) : new Date();

    const charge = await prisma.photocopyCharge.create({
      data: {
        teacherId: formData.teacherId,
        branchId: Number(formData.branchId),
        classId: formData.classId ? Number(formData.classId) : null,
        pages: Number(formData.pages),
        costAmount: new Prisma.Decimal(formData.costAmount),
        date: chargeDate,
        recordedBy,
      },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    return {
      success: true,
      error: false,
      message: `تم تسجيل تكلفة النسخ (${formData.pages} صفحة - ${formData.costAmount} دج) واحتسابها كخصم قادم للأستاذ`,
      data: charge,
    };
  } catch (error: any) {
    console.error("Error in recordPhotocopyChargeAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل تكلفة النسخ" };
  }
}

export async function updatePhotocopyChargeAction(
  id: number,
  formData: {
    teacherId?: string;
    branchId?: number;
    pages?: number;
    costAmount?: number;
    date?: string | Date;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const charge = await prisma.photocopyCharge.update({
      where: { id },
      data: {
        ...(formData.teacherId ? { teacherId: formData.teacherId } : {}),
        ...(formData.branchId ? { branchId: Number(formData.branchId) } : {}),
        ...(formData.pages !== undefined ? { pages: Number(formData.pages) } : {}),
        ...(formData.costAmount !== undefined ? { costAmount: new Prisma.Decimal(formData.costAmount) } : {}),
        ...(formData.date ? { date: new Date(formData.date) } : {}),
      },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    if (formData.teacherId) safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    return {
      success: true,
      error: false,
      message: "تم تحديث تكلفة النسخ بنجاح",
      data: charge,
    };
  } catch (error: any) {
    console.error("Error in updatePhotocopyChargeAction:", error);
    return { success: false, error: true, message: error.message || "فشل تحديث تكلفة النسخ" };
  }
}

export async function deletePhotocopyChargeAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const charge = await prisma.photocopyCharge.delete({
      where: { id },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    if (charge.teacherId) safeRevalidatePath(`/list/teachers/${charge.teacherId}`);
    return {
      success: true,
      error: false,
      message: "تم حذف تكلفة النسخ بنجاح",
    };
  } catch (error: any) {
    console.error("Error in deletePhotocopyChargeAction:", error);
    return { success: false, error: true, message: error.message || "فشل حذف تكلفة النسخ" };
  }
}

/**
 * Record a Salary Advance for a teacher.
 * Auto-deducted from next payslip's net amount.
 */
export async function recordSalaryAdvanceAction(formData: {
  personId: string;
  amount: number;
  date?: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const advanceDate = formData.date ? new Date(formData.date) : new Date();

    const advance = await prisma.salaryAdvance.create({
      data: {
        personId: formData.personId,
        amount: new Prisma.Decimal(formData.amount),
        date: advanceDate,
      },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return {
      success: true,
      error: false,
      message: `تم تسجيل التسبيق المالي (${formData.amount} دج) بنجاح`,
      data: advance,
    };
  } catch (error: any) {
    console.error("Error in recordSalaryAdvanceAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل التسبيق" };
  }
}

export async function updateSalaryAdvanceAction(
  id: number,
  formData: {
    personId?: string;
    amount?: number;
    date?: string | Date;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const advance = await prisma.salaryAdvance.update({
      where: { id },
      data: {
        ...(formData.personId ? { personId: formData.personId } : {}),
        ...(formData.amount !== undefined ? { amount: new Prisma.Decimal(formData.amount) } : {}),
        ...(formData.date ? { date: new Date(formData.date) } : {}),
      },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return {
      success: true,
      error: false,
      message: "تم تحديث التسبيق المالي بنجاح",
      data: advance,
    };
  } catch (error: any) {
    console.error("Error in updateSalaryAdvanceAction:", error);
    return { success: false, error: true, message: error.message || "فشل تحديث التسبيق" };
  }
}

export async function deleteSalaryAdvanceAction(id: number) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    await prisma.salaryAdvance.delete({
      where: { id },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return {
      success: true,
      error: false,
      message: "تم حذف التسبيق المالي بنجاح",
    };
  } catch (error: any) {
    console.error("Error in deleteSalaryAdvanceAction:", error);
    return { success: false, error: true, message: error.message || "فشل حذف التسبيق" };
  }
}

/**
 * Generate a new PayrollRun for a specified period.
 */
export async function generatePayrollRunAction(formData: {
  periodStart: string | Date;
  periodEnd: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const run = await generatePayrollRun(formData.periodStart, formData.periodEnd);

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return {
      success: true,
      error: false,
      message: `تم إنشاء دورة الرواتب #${run.id} وحساب قسائم الرواتب الموحدة بنجاح`,
      runId: run.id,
    };
  } catch (error: any) {
    console.error("Error in generatePayrollRunAction:", error);
    return { success: false, error: true, message: error.message || "فشل إنشاء دورة الرواتب" };
  }
}

export async function calculateIndividualTeacherPayrollAction(formData: {
  teacherId: string;
  startDate: string;
  endDate: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.can("manage", "payroll")) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }
    const { calculateTeacherPayroll } = await import("./payroll");
    const payroll = await calculateTeacherPayroll(
      formData.teacherId,
      new Date(formData.startDate),
      new Date(formData.endDate)
    );
    return { success: true, error: false, payroll: serializeForClient(payroll) };
  } catch (error: any) {
    console.error("Error in calculateIndividualTeacherPayrollAction:", error);
    return { success: false, error: true, message: error.message || "فشل حساب مستحقات الأستاذ" };
  }
}

export async function generateIndividualTeacherPayrollAction(formData: {
  teacherId: string;
  startDate: string;
  endDate: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.can("manage", "payroll")) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }
    const run = await generatePayrollRun(
      formData.startDate,
      formData.endDate,
      formData.teacherId
    );
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return { success: true, error: false, payrollRunId: run.id };
  } catch (error: any) {
    console.error("Error in generateIndividualTeacherPayrollAction:", error);
    return { success: false, error: true, message: error.message || "فشل حفظ دورة الرواتب" };
  }
}

/**
 * Update the status of a PayrollRun (DRAFT | VALIDATED | PAID).
 */
export async function setPayrollRunStatusAction(formData: {
  payrollRunId: number;
  status: "DRAFT" | "VALIDATED" | "PAID";
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    await updatePayrollRunStatus(formData.payrollRunId, formData.status);

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/payroll/payslips`);
    return {
      success: true,
      error: false,
      message: `تم تحديث حالة دورة الرواتب إلى ${formData.status}`,
    };
  } catch (error: any) {
    console.error("Error in setPayrollRunStatusAction:", error);
    return { success: false, error: true, message: error.message || "فشل تحديث حالة الدورة" };
  }
}

/**
 * Delete / undo a PayrollRun and its generated payslips.
 */
export async function deletePayrollRunAction(payrollRunId: number) {
  try {
    const session = await getAuthSession();
    if (!session.can("manage", "payroll") && !session.isOwner) {
      return { success: false, error: true, message: "غير مصرح لك بإلغاء دورة الرواتب." };
    }

    await deletePayrollRun(payrollRunId);

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/payroll/payslips`);

    return {
      success: true,
      error: false,
      message: "تم إلغاء وحذف دورة الرواتب بنجاح.",
    };
  } catch (error: any) {
    console.error("Error in deletePayrollRunAction:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "فشل إلغاء دورة الرواتب.",
    };
  }
}

// =================================================================
// BOOK DROP & PHOTOCOPY ACTIONS (§2.5, §2.11)
// =================================================================

/**
 * Record a Book Drop for a teacher (§2.11).
 * Branch and date are captured automatically from the admin session and current date.
 * School Level is selected on creation (or existing Book chosen) — NOT individual groups.
 * Eligibility is automatically computed from Class.teacherId + Class.levelId.
 */
export async function recordBookDropAction(formData: {
  teacherId: string;
  bookId?: number;
  newBookTitle?: string;
  levelId?: number;
  quantity: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بهذا الإجراء." };
    }

    const branchId = await getActiveBranchId();
    const recordedBy = session.userId || session.rawRole || "admin";
    const quantity = Number(formData.quantity);

    if (!quantity || quantity < 1) {
      return { success: false, error: true, message: "يجب إدخال كمية صحيحة أكبر من صفر." };
    }

    let targetBookId = formData.bookId ? Number(formData.bookId) : null;

    if (!targetBookId) {
      if (!formData.newBookTitle || !formData.levelId) {
        return { success: false, error: true, message: "يرجى إدخال عنوان الكتاب والمستوى الدراسي." };
      }

      // Resolve current active trimester (§7.20)
      const activeTrimester = await getActiveTrimester();
      const currentTrimesterId = activeTrimester?.id ?? null;

      const newBook = await prisma.book.create({
        data: {
          teacherId: formData.teacherId,
          levelId: Number(formData.levelId),
          title: formData.newBookTitle.trim(),
          trimesterId: currentTrimesterId,
        },
      });
      targetBookId = newBook.id;
    }

    const drop = await prisma.bookDrop.create({
      data: {
        bookId: targetBookId,
        branchId,
        quantity,
        dropDate: new Date(),
        recordedBy,
      },
      include: {
        book: {
          include: { level: true },
        },
        branch: true,
      },
    });

    if (drop.book.levelId) {
      await prisma.class.updateMany({
        where: {
          teacherId: formData.teacherId,
          levelId: drop.book.levelId,
        },
        data: {
          hasBooks: true,
        },
      });
    }

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `تم تسجيل إيداع ${quantity} نسخة من كتاب "${drop.book.title}" بنجاح.`,
      data: drop,
    };
  } catch (error: any) {
    console.error("Error in recordBookDropAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل إيداع الكتاب." };
  }
}

/**
 * Update a Book Drop (Owner-only).
 * Allows the owner to adjust the quantity of copies dropped or reassign to another branch.
 */
export async function updateBookDropAction(formData: {
  id: number;
  teacherId: string;
  quantity: number;
  branchId?: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح فقط لمالك المؤسسة.",
      };
    }

    const quantity = Number(formData.quantity);
    if (!quantity || quantity < 1) {
      return {
        success: false,
        error: true,
        message: "Veuillez entrer une quantité valide (au moins 1) / يرجى إدخال كمية صحيحة (1 على الأقل).",
      };
    }

    const existingDrop = await prisma.bookDrop.findUnique({
      where: { id: Number(formData.id) },
      include: { book: true },
    });

    if (!existingDrop) {
      return {
        success: false,
        error: true,
        message: "Dépôt de livre introuvable / سجل إيداع الكتاب غير موجود.",
      };
    }

    const updated = await prisma.bookDrop.update({
      where: { id: existingDrop.id },
      data: {
        quantity,
        ...(formData.branchId ? { branchId: Number(formData.branchId) } : {}),
      },
      include: {
        book: { include: { level: true } },
        branch: true,
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `تم تحديث إيداع كتاب "${updated.book.title}" بنجاح (${quantity} نسخة).`,
      data: updated,
    };
  } catch (error: any) {
    console.error("Error in updateBookDropAction:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "فشل تحديث إيداع الكتاب.",
    };
  }
}

/**
 * Delete a Book Drop (Owner-only).
 * Removes a book drop record and any associated copy distribution records.
 */
export async function deleteBookDropAction(formData: {
  id: number;
  teacherId: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح فقط لمالك المؤسسة.",
      };
    }

    const existingDrop = await prisma.bookDrop.findUnique({
      where: { id: Number(formData.id) },
      include: { book: true, distributions: true },
    });

    if (!existingDrop) {
      return {
        success: false,
        error: true,
        message: "Dépôt de livre introuvable / سجل إيداع الكتاب غير موجود.",
      };
    }

    await prisma.$transaction(async (tx) => {
      if (existingDrop.distributions.length > 0) {
        await tx.bookCopyDistribution.deleteMany({
          where: { bookDropId: existingDrop.id },
        });
      }
      await tx.bookDrop.delete({
        where: { id: existingDrop.id },
      });
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `تم حذف سجل إيداع كتاب "${existingDrop.book.title}" بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in deleteBookDropAction:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "فشل حذف إيداع الكتاب.",
    };
  }
}

/**
 * Record a Photocopy Charge for a teacher (§2.5).
 * Opens with only a page-count input; the cost is auto-computed server-side from
 * Teacher.photocopyRatePerPage. Admin never sees or enters a cost calculation.
 * Branch and date are captured automatically from the admin session and current date.
 */
export async function recordTeacherPhotocopyAction(formData: {
  teacherId: string;
  pages: number;
  branchId?: number;
  classId?: number | null;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بهذا الإجراء." };
    }

    const branchId = formData.branchId ? Number(formData.branchId) : await getActiveBranchId();
    const recordedBy = session.userId || session.rawRole || "admin";
    const pages = Number(formData.pages);

    if (!pages || pages < 1) {
      return { success: false, error: true, message: "يرجى إدخال عدد صفحات صالح (1 على الأقل)." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: formData.teacherId },
      select: { id: true, name: true, photocopyRatePerPage: true },
    });

    if (!teacher) {
      return { success: false, error: true, message: "لم يتم العثور على الأستاذ المطلوب." };
    }

    const rate = teacher.photocopyRatePerPage ? Number(teacher.photocopyRatePerPage) : 0;
    const costAmount = pages * rate;

    const charge = await prisma.photocopyCharge.create({
      data: {
        teacherId: formData.teacherId,
        branchId,
        classId: formData.classId ? Number(formData.classId) : null,
        pages,
        costAmount: new Prisma.Decimal(costAmount),
        date: new Date(),
        recordedBy,
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/payroll");

    return {
      success: true,
      error: false,
      message: `تم تسجيل ${pages} صفحة للأستاذ ${teacher.name} بنجاح.`,
      data: charge,
    };
  } catch (error: any) {
    console.error("Error in recordTeacherPhotocopyAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل تكلفة النسخ." };
  }
}

/**
 * Update an existing Photocopy Charge for a teacher (Owner-only).
 * Allows the owner to correct false counting/pages, branch, or group.
 */
export async function updateTeacherPhotocopyAction(formData: {
  id: number;
  teacherId: string;
  pages: number;
  branchId?: number;
  classId?: number | null;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / تعديل سجل النسخ متاح للمالك فقط.",
      };
    }

    const pages = Number(formData.pages);
    if (!pages || pages < 1) {
      return { success: false, error: true, message: "يرجى إدخال عدد صفحات صالح (1 على الأقل)." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: formData.teacherId },
      select: { id: true, name: true, photocopyRatePerPage: true },
    });

    if (!teacher) {
      return { success: false, error: true, message: "لم يتم العثور على الأستاذ المطلوب." };
    }

    const existingCharge = await prisma.photocopyCharge.findUnique({
      where: { id: Number(formData.id) },
    });

    if (!existingCharge) {
      return { success: false, error: true, message: "لم يتم العثور على سجل النسخ المطلوب." };
    }

    const rate = teacher.photocopyRatePerPage ? Number(teacher.photocopyRatePerPage) : 0;
    const costAmount = pages * rate;

    const charge = await prisma.photocopyCharge.update({
      where: { id: Number(formData.id) },
      data: {
        pages,
        costAmount: new Prisma.Decimal(costAmount),
        ...(formData.branchId ? { branchId: Number(formData.branchId) } : {}),
        classId: formData.classId !== undefined ? (formData.classId ? Number(formData.classId) : null) : undefined,
      },
      include: {
        Branch: true,
        class: true,
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `تم تعديل عملية النسخ #${charge.id} (${pages} صفحة - ${costAmount} دج) للأستاذ ${teacher.name} بنجاح.`,
      data: {
        ...charge,
        costAmount: Number(charge.costAmount),
      },
    };
  } catch (error: any) {
    console.error("Error in updateTeacherPhotocopyAction:", error);
    return { success: false, error: true, message: error.message || "فشل تعديل تكلفة النسخ." };
  }
}

/**
 * Delete a Photocopy Charge for a teacher (Owner-only).
 * Allows the owner to remove erroneous or false photocopy entries.
 */
export async function deleteTeacherPhotocopyAction(formData: {
  id: number;
  teacherId: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / حذف سجل النسخ متاح للمالك فقط.",
      };
    }

    const existingCharge = await prisma.photocopyCharge.findUnique({
      where: { id: Number(formData.id) },
    });

    if (!existingCharge) {
      return { success: false, error: true, message: "لم يتم العثور على سجل النسخ المطلوب." };
    }

    await prisma.photocopyCharge.delete({
      where: { id: Number(formData.id) },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `تم حذف سجل النسخ #${formData.id} بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in deleteTeacherPhotocopyAction:", error);
    return { success: false, error: true, message: error.message || "فشل حذف سجل النسخ." };
  }
}

/**
 * Update a teacher's individual photocopyRatePerPage (Owner-only).
 */
export async function updateTeacherPhotocopyRateAction(formData: {
  teacherId: string;
  ratePerPage: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / تحديد سعر النسخ متاح للمالك فقط." };
    }

    const rate = Number(formData.ratePerPage);
    if (isNaN(rate) || rate < 0) {
      return { success: false, error: true, message: "Tarif par page non valide / يرجى إدخال سعر صالح للصفحة." };
    }

    await prisma.teacher.update({
      where: { id: formData.teacherId },
      data: { photocopyRatePerPage: new Prisma.Decimal(rate) },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);

    return {
      success: true,
      error: false,
      message: `Tarif de photocopie mis à jour à ${rate} DZD/page avec succès / تم تحديث سعر النسخ إلى ${rate} دج/صفحة بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in updateTeacherPhotocopyRateAction:", error);
    return { success: false, error: true, message: error.message || "Échec de mise à jour du tarif de photocopie / فشل تحديث سعر النسخ." };
  }
}

/**
 * Update a teacher's individual payroll percentage (percentageOfSessionFee) - OWNER-ONLY per §2.9.
 * Changing it immediately affects how this teacher's payroll is calculated going forward.
 */
export async function updateTeacherPayrollPercentageAction(formData: {
  teacherId: string;
  percentage: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / تحديد نسبة الأستاذ متاح للمالك فقط." };
    }

    const percentage = Number(formData.percentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return { success: false, error: true, message: "Pourcentage non valide (entre 0 et 100) / يرجى إدخال نسبة مئوية صالحة بين 0 و 100." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: formData.teacherId },
      select: { id: true, name: true },
    });

    if (!teacher) {
      return { success: false, error: true, message: "Enseignant introuvable / لم يتم العثور على الأستاذ المطلوب." };
    }

    // Immediately save new active rate
    await prisma.teacherPayRate.create({
      data: {
        teacherId: formData.teacherId,
        percentageOfSessionFee: new Prisma.Decimal(percentage),
        effectiveFrom: new Date(),
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `Pourcentage de rémunération de l'enseignant ${teacher.name} mis à jour à ${percentage}% avec succès / تم تحديث نسبة أجر الأستاذ ${teacher.name} إلى ${percentage}% بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in updateTeacherPayrollPercentageAction:", error);
    return { success: false, error: true, message: error.message || "Échec de mise à jour de la rémunération / فشل تحديث نسبة الأستاذ." };
  }
}

/**
 * Update or reset a teacher's group-specific payroll percentage - OWNER-ONLY.
 * If percentage is provided (number), upserts the TeacherClassRate record.
 * If percentage is null or undefined, deletes the override so the group falls back to the teacher's overall rate.
 */
export async function updateTeacherGroupPercentageAction(data: {
  teacherId: string;
  classId: number;
  percentage: number | null;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / تحديد نسبة الفوج متاح للمالك فقط.",
      };
    }

    const { teacherId, classId, percentage } = data;

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true },
    });
    if (!teacher) {
      return { success: false, error: true, message: "Enseignant introuvable / لم يتم العثور على الأستاذ المطلوب." };
    }

    const classGroup = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true },
    });
    if (!classGroup) {
      return { success: false, error: true, message: "Groupe introuvable / لم يتم العثور على الفوج المطلوب." };
    }

    if (percentage === null || percentage === undefined) {
      // Revert to global percentage: remove custom group override if exists
      await prisma.teacherClassRate.deleteMany({
        where: { teacherId, classId },
      });

      safeRevalidatePath("/list/teachers");
      safeRevalidatePath(`/list/teachers/${teacherId}`);
      safeRevalidatePath("/list/payroll");
      safeRevalidatePath("/list/finance");

      return {
        success: true,
        error: false,
        message: `Le groupe "${classGroup.name}" utilise désormais le pourcentage global de l'enseignant / تم إعادة ضبط الفوج "${classGroup.name}" إلى النسبة العامة بنجاح.`,
      };
    }

    const pctNum = Number(percentage);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      return {
        success: false,
        error: true,
        message: "Pourcentage non valide (entre 0 et 100) / يرجى إدخال نسبة مئوية صالحة بين 0 و 100.",
      };
    }

    await prisma.teacherClassRate.upsert({
      where: {
        teacherId_classId: { teacherId, classId },
      },
      create: {
        teacherId,
        classId,
        percentage: new Prisma.Decimal(pctNum),
      },
      update: {
        percentage: new Prisma.Decimal(pctNum),
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${teacherId}`);
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `Pourcentage du groupe "${classGroup.name}" fixé à ${pctNum}% avec succès / تم تحديد نسبة الفوج "${classGroup.name}" بـ ${pctNum}% بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in updateTeacherGroupPercentageAction:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Échec de mise à jour du pourcentage du groupe / فشل تحديث نسبة الفوج.",
    };
  }
}

/**
 * Reset all group overrides for a teacher back to the overall default - OWNER-ONLY.
 */
export async function resetAllTeacherGroupPercentagesAction(teacherId: string) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح للمالك فقط.",
      };
    }

    await prisma.teacherClassRate.deleteMany({
      where: { teacherId },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${teacherId}`);
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Toutes les dérogations de groupes ont été réinitialisées au taux global / تم إعادة ضبط جميع الأفواج إلى النسبة العامة.",
    };
  } catch (error: any) {
    console.error("Error in resetAllTeacherGroupPercentagesAction:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Échec de réinitialisation / فشل إعادة الضبط.",
    };
  }
}

// =================================================================
// MISSING MONEY ("MANQUE") ACTIONS (§7.11)
// =================================================================

export async function declareMissingMoneyAction(data: {
  branchId: number;
  amount: number;
  reason?: string;
  date?: string | Date;
}): Promise<{ success: boolean; error: boolean; message: string }> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé / غير مصرح بالعملية",
      };
    }

    const branchId = Number(data.branchId);
    if (isNaN(branchId)) {
      return {
        success: false,
        error: true,
        message: "Identifiant de branche invalide / معرف الفرع غير صالح",
      };
    }

    // Branch admins can strictly declare only for their own branch
    if (session.isBranchAdmin && !session.isOwner) {
      const userBranchId = session.branchIds[0];
      if (userBranchId !== branchId) {
        return {
          success: false,
          error: true,
          message: "Vous ne pouvez déclarer un manque que pour votre propre branche / يمكنك التصريح فقط لفرعك التابع له",
        };
      }
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: true,
        message: "Veuillez saisir un montant manquant supérieur à 0 / يرجى إدخال مبلغ عجز أكبر من الصفر",
      };
    }

    let recordDate = normalizeDateToStartOfDay(new Date());

    if (data.date) {
      if (!session.isOwner) {
        return {
          success: false,
          error: true,
          message: "Seul le propriétaire peut déclarer un manque pour une date spécifique / هذا الإجراء متاح لمالك المؤسسة فقط",
        };
      }
      const parsedDate = new Date(data.date);
      if (isNaN(parsedDate.getTime())) {
        return {
          success: false,
          error: true,
          message: "Date invalide / تاريخ غير صالح",
        };
      }
      recordDate = normalizeDateToStartOfDay(data.date);
    }

    await prisma.missingMoney.create({
      data: {
        branchId,
        date: recordDate,
        amount: new Prisma.Decimal(amount),
        reason: data.reason?.trim() || null,
        declaredBy: session.userId || session.rawRole || "admin",
        status: "PENDING",
      },
    });

    await revalidateFinancialRoutes({ branchId });

    return {
      success: true,
      error: false,
      message: "Déclaration de manque enregistrée avec succès. En attente de confirmation par le propriétaire. / تم تسجيل عجز الصندوق بنجاح. في انتظار تأكيد المالك.",
    };
  } catch (err: any) {
    console.error("declareMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de l'enregistrement / حدث خطأ أثناء التسجيل",
    };
  }
}

export async function confirmMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut confirmer un manque de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const missingRecord = await prisma.missingMoney.findUnique({
      where: { id },
    });

    if (!missingRecord) {
      return {
        success: false,
        error: true,
        message: "Enregistrement de manque introuvable / لم يتم العثور على سجل العجز",
      };
    }

    await prisma.missingMoney.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    await revalidateFinancialRoutes({ branchId: missingRecord.branchId });

    return {
      success: true,
      error: false,
      message: "Manque de caisse confirmé avec succès et déduit du revenu net. / تم تأكيد عجز الصندوق وخصمه من صافي المداخيل.",
    };
  } catch (err: any) {
    console.error("confirmMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la confirmation / حدث خطأ أثناء التأكيد",
    };
  }
}

export async function rejectMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut rejeter un manque de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const rejected = await prisma.missingMoney.update({
      where: { id },
      data: {
        status: "REJECTED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    await revalidateFinancialRoutes({ branchId: rejected.branchId });

    return {
      success: true,
      error: false,
      message: "Déclaration de manque rejetée / تم رفض تصريح عجز الصندوق",
    };
  } catch (err: any) {
    console.error("rejectMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors du rejet / حدث خطأ أثناء الرفض",
    };
  }
}

export async function resetMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut modifier la confirmation / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const reset = await prisma.missingMoney.update({
      where: { id },
      data: {
        status: "PENDING",
        confirmedBy: null,
        confirmedAt: null,
      },
    });

    await revalidateFinancialRoutes({ branchId: reset.branchId });

    return {
      success: true,
      error: false,
      message: "Confirmation réinitialisée (remise en attente) / تمت إعادة الحالة إلى قيد الانتظار",
    };
  } catch (err: any) {
    console.error("resetMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la réinitialisation / حدث خطأ أثناء التحديث",
    };
  }
}

export async function declareSurplusMoneyAction(data: {
  branchId: number;
  amount: number;
  reason?: string;
  date?: string | Date;
}): Promise<{ success: boolean; error: boolean; message: string }> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé / غير مصرح بالعملية",
      };
    }

    const branchId = Number(data.branchId);
    if (isNaN(branchId)) {
      return {
        success: false,
        error: true,
        message: "Identifiant de branche invalide / معرف الفرع غير صالح",
      };
    }

    // Branch admins can strictly declare only for their own branch
    if (session.isBranchAdmin && !session.isOwner) {
      const userBranchId = session.branchIds[0];
      if (userBranchId !== branchId) {
        return {
          success: false,
          error: true,
          message: "Vous ne pouvez déclarer un surplus que pour votre propre branche / يمكنك التصريح فقط لفرعك التابع له",
        };
      }
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: true,
        message: "Veuillez saisir un montant de surplus supérieur à 0 / يرجى إدخال مبلغ فائض أكبر من الصفر",
      };
    }

    let recordDate = normalizeDateToStartOfDay(new Date());

    if (data.date) {
      if (!session.isOwner) {
        return {
          success: false,
          error: true,
          message: "Seul le propriétaire peut déclarer un surplus pour une date spécifique / هذا الإجراء متاح لمالك المؤسسة فقط",
        };
      }
      const parsedDate = new Date(data.date);
      if (isNaN(parsedDate.getTime())) {
        return {
          success: false,
          error: true,
          message: "Date invalide / تاريخ غير صالح",
        };
      }
      recordDate = normalizeDateToStartOfDay(data.date);
    }

    await prisma.surplusMoney.create({
      data: {
        branchId,
        date: recordDate,
        amount: new Prisma.Decimal(amount),
        reason: data.reason?.trim() || null,
        declaredBy: session.userId || session.rawRole || "admin",
        status: "PENDING",
      },
    });

    await revalidateFinancialRoutes({ branchId });

    return {
      success: true,
      error: false,
      message: "Déclaration de surplus enregistrée avec succès. En attente de confirmation par le propriétaire. / تم تسجيل فائض الصندوق بنجاح. في انتظار تأكيد المالك.",
    };
  } catch (err: any) {
    console.error("declareSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de l'enregistrement / حدث خطأ أثناء التسجيل",
    };
  }
}

export async function confirmSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut confirmer un surplus de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const surplusRecord = await prisma.surplusMoney.findUnique({
      where: { id },
    });

    if (!surplusRecord) {
      return {
        success: false,
        error: true,
        message: "Enregistrement de surplus introuvable / لم يتم العثور على سجل الفائض",
      };
    }

    await prisma.surplusMoney.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    await revalidateFinancialRoutes({ branchId: surplusRecord.branchId });

    return {
      success: true,
      error: false,
      message: "Surplus de caisse confirmé avec succès et ajouté au revenu net. / تم تأكيد فائض الصندوق وإضافته إلى صافي المداخيل.",
    };
  } catch (err: any) {
    console.error("confirmSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la confirmation / حدث خطأ أثناء التأكيد",
    };
  }
}

export async function rejectSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut rejeter un surplus de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const rejected = await prisma.surplusMoney.update({
      where: { id },
      data: {
        status: "REJECTED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    await revalidateFinancialRoutes({ branchId: rejected.branchId });

    return {
      success: true,
      error: false,
      message: "Déclaration de surplus rejetée / تم رفض تصريح فائض الصندوق",
    };
  } catch (err: any) {
    console.error("rejectSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors du rejet / حدث خطأ أثناء الرفض",
    };
  }
}

export async function resetSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut modifier la confirmation / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const reset = await prisma.surplusMoney.update({
      where: { id },
      data: {
        status: "PENDING",
        confirmedBy: null,
        confirmedAt: null,
      },
    });

    await revalidateFinancialRoutes({ branchId: reset.branchId });

    return {
      success: true,
      error: false,
      message: "Confirmation réinitialisée (remise en attente) / تمت إعادة الحالة إلى قيد الانتظار",
    };
  } catch (err: any) {
    console.error("resetSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la réinitialisation / حدث خطأ أثناء التحديث",
    };
  }
}

export async function deleteMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut supprimer un manque de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const deleted = await prisma.missingMoney.delete({
      where: { id },
    });

    await revalidateFinancialRoutes({ branchId: deleted.branchId });

    return {
      success: true,
      error: false,
      message: "Déclaration de manque supprimée avec succès / تم حذف تصريح العجز بنجاح",
    };
  } catch (err: any) {
    console.error("deleteMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la suppression / حدث خطأ أثناء الحذف",
    };
  }
}

export async function deleteSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut supprimer un surplus de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const deleted = await prisma.surplusMoney.delete({
      where: { id },
    });

    await revalidateFinancialRoutes({ branchId: deleted.branchId });

    return {
      success: true,
      error: false,
      message: "Déclaration de surplus supprimée avec succès / تم حذف تصريح الفائض بنجاح",
    };
  } catch (err: any) {
    console.error("deleteSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la suppression / حدث خطأ أثناء الحذف",
    };
  }
}

/**
 * Update student payer status flag (§7.18)
 * States: NORMAL (default) | NON_PAYER | SCHOOL_FEES_ONLY
 */
export async function updateStudentPayerStatusAction(
  studentId: string,
  newStatus: string
): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  payerStatus?: string;
}> {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.isOwner && !session.isOwnerOrAdmin && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بهذا الإجراء",
      };
    }

    const validStatuses = ["NORMAL", "NON_PAYER", "SCHOOL_FEES_ONLY"];
    const targetStatus = validStatuses.includes(newStatus) ? newStatus : "NORMAL";

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, registeredBranchId: true, payerStatus: true },
    });

    if (!student) {
      return {
        success: false,
        error: true,
        message: "Élève introuvable / لم يتم العثور على التلميذ",
      };
    }

    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بتعديل حالة الدفع لهذا التلميذ",
      };
    }

    const oldStatus = student.payerStatus || "NORMAL";

    await prisma.$executeRaw`
      UPDATE "Student"
      SET "payerStatus" = ${targetStatus}
      WHERE id = ${studentId}
    `;

    // Audit trail
    try {
      await prisma.auditLog.create({
        data: {
          entityType: "STUDENT",
          entityId: studentId,
          action: "UPDATE_PAYER_STATUS",
          branchId: student.registeredBranchId,
          userId: session.userId || session.rawRole || "system",
          userName: session.userId || session.rawRole || "Admin",
          oldValue: oldStatus,
          newValue: targetStatus,
          details: `Statut de paiement modifié de ${oldStatus} à ${targetStatus}`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

    safeRevalidatePath(`/list/students/${studentId}`);
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");

    const statusLabelsFr: Record<string, string> = {
      NORMAL: "Normal (par défaut)",
      NON_PAYER: "Non-payeur (exonéré)",
      SCHOOL_FEES_ONLY: "Frais d'école uniquement",
    };
    const statusLabelsAr: Record<string, string> = {
      NORMAL: "عادي (افتراضي)",
      NON_PAYER: "معفى من الدفع",
      SCHOOL_FEES_ONLY: "مستحقات المدرسة فقط",
    };

    return {
      success: true,
      error: false,
      message: `Statut mis à jour : ${statusLabelsFr[targetStatus]} / تم تحديث الحالة: ${statusLabelsAr[targetStatus]}`,
      payerStatus: targetStatus,
    };
  } catch (err: any) {
    console.error("updateStudentPayerStatusAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la mise à jour du statut / حدث خطأ أثناء تحديث الحالة",
    };
  }
}

/**
 * Update an enrollment's payerStatus per §7.18.
 * Allows toggling between NORMAL, NON_PAYER, and SCHOOL_FEES_ONLY for a specific enrolled group.
 * Preserves all historical vouchers and logs an immutable audit event.
 */
export async function updateEnrollmentPayerStatusAction(
  studentId: string,
  enrollmentId: number,
  newStatus: string
): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  payerStatus?: string;
  enrollmentId?: number;
}> {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.isOwner && !session.isOwnerOrAdmin && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بهذا الإجراء",
      };
    }

    const validStatuses = ["NORMAL", "NON_PAYER", "SCHOOL_FEES_ONLY"];
    const targetStatus = validStatuses.includes(newStatus) ? newStatus : "NORMAL";

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        class: { include: { branch: true } },
        student: { select: { id: true, name: true, registeredBranchId: true } },
      },
    });

    if (!enrollment || enrollment.studentId !== studentId) {
      return {
        success: false,
        error: true,
        message: "Inscription introuvable / التسجيل غير موجود",
      };
    }

    const branchId = enrollment.class.branchId;
    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بتعديل أفواج هذا الفرع",
      };
    }

    const oldStatus = enrollment.payerStatus || "NORMAL";

    await prisma.$executeRaw`
      UPDATE "Enrollment"
      SET "payerStatus" = ${targetStatus}
      WHERE id = ${enrollmentId}
    `;

    // Audit trail
    try {
      await prisma.auditLog.create({
        data: {
          entityType: "ENROLLMENT",
          entityId: String(enrollmentId),
          action: "UPDATE_ENROLLMENT_PAYER_STATUS",
          branchId: branchId,
          userId: session.userId || session.rawRole || "system",
          userName: session.userId || session.rawRole || "Admin",
          oldValue: oldStatus,
          newValue: targetStatus,
          details: `Statut de paiement du groupe "${enrollment.class.name}" modifié de ${oldStatus} à ${targetStatus}`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

    safeRevalidatePath(`/list/students/${studentId}`);
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath(`/list/classes/${enrollment.classId}`);

    const statusLabelsFr: Record<string, string> = {
      NORMAL: "Normal (par défaut)",
      NON_PAYER: "Non-payeur (exonéré)",
      SCHOOL_FEES_ONLY: "Frais d'école uniquement",
    };
    const statusLabelsAr: Record<string, string> = {
      NORMAL: "عادي (افتراضي)",
      NON_PAYER: "معفى من الدفع",
      SCHOOL_FEES_ONLY: "مستحقات المدرسة فقط",
    };

    return {
      success: true,
      error: false,
      message: `Groupe "${enrollment.class.name}" : statut mis à jour en ${statusLabelsFr[targetStatus]} / فوج "${enrollment.class.name}": تم تحديث الحالة إلى ${statusLabelsAr[targetStatus]}`,
      payerStatus: targetStatus,
      enrollmentId,
    };
  } catch (err: any) {
    console.error("updateEnrollmentPayerStatusAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la mise à jour du statut / حدث خطأ أثناء تحديث الحالة",
    };
  }
}

/**
 * Automatically unsuspend an enrollment and clear debts accumulated prior to return.
 * Triggered when a suspended student either:
 * 1. Makes a payment in the suspended group (trigger: "PAYMENT")
 * 2. Is marked PRESENT in attendance (trigger: "ATTENDANCE")
 * 3. Is manually reinstated to normal (trigger: "MANUAL")
 *
 * In all cases:
 * - Past debts accumulated up to the return date (or excluding the new payment/presence)
 *   are cleared by setting creditResetOffset, resetting past drop-out balance to 0.
 * - The new payment and/or today's attendance remain active and unaffected.
 * - Status is restored from "SUSPENDED" to "ACTIVE".
 * - Payer status is set to "NORMAL".
 */
export async function unsuspendEnrollmentWithDebtClearance(
  client: any,
  params: {
    studentId: string;
    classId: number;
    enrollmentId?: number;
    trigger: "PAYMENT" | "ATTENDANCE" | "MANUAL";
    actorId?: string;
    actorName?: string;
    excludeVoucherIds?: number[];
    excludeLessonIds?: number[];
    referenceDate?: Date;
  }
): Promise<{ success: boolean; creditResetOffset: number; rawCredit: number; enrollmentId?: number }> {
  try {
    const enrollment = await client.enrollment.findFirst({
      where: params.enrollmentId
        ? { id: params.enrollmentId }
        : { studentId: params.studentId, classId: params.classId },
      include: {
        class: {
          include: {
            branch: true,
            lessons: {
              where: { isFree: false },
              select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true },
            },
            vouchers: {
              where: { studentId: params.studentId, isVoided: false },
              include: { refunds: true },
            },
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            payerStatus: true,
            family: true,
            attendances: {
              where: {
                lesson: {
                  classId: params.classId,
                  isFree: false,
                },
              },
              include: {
                lesson: {
                  select: { id: true, startsAt: true, isFree: true, isTeacherAbsent: true, classId: true },
                },
              },
            },
            catchUpAttendances: {
              where: {
                missedLesson: { classId: params.classId },
              },
              include: {
                missedLesson: { select: { id: true, startsAt: true, classId: true } },
                catchUpLesson: { select: { id: true, startsAt: true, classId: true } },
              },
            },
          },
        },
        transfersFrom: true,
        transfersTo: true,
      },
    });

    if (!enrollment || enrollment.status !== "SUSPENDED") {
      return { success: false, creditResetOffset: enrollment?.creditResetOffset || 0, rawCredit: 0, enrollmentId: enrollment?.id };
    }

    const refDate = params.referenceDate || new Date();
    const refDayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(refDate);

    const c = enrollment.class;
    const student = enrollment.student;

    const classVouchers = (c.vouchers || []).filter(
      (v: any) =>
        (v.classId === c.id || !v.classId) &&
        !(params.excludeVoucherIds || []).includes(v.id)
    );

    // Vouchers strictly prior to return date
    const priorTuitionVouchers = classVouchers.filter((v: any) => {
      if (v.paymentType !== "TUITION_4SESSION") return false;
      const vDayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Algiers",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(v.issuedAt));
      return vDayStr < refDayStr;
    });

    const family = student.family;
    const isSiblingDiscount = Boolean(
      family &&
        family.payerStudentId &&
        family.payerStudentId !== student.id
    );
    const siblingDiscountPct = isSiblingDiscount
      ? Number((family as any)?.discountPercentage ?? 50)
      : 0;
    const isSiblingWaived100 = siblingDiscountPct >= 100;

    const cyclePrice = Number(c.pricePerCycle || 0);
    const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
    const effectiveLessonPrice =
      siblingDiscountPct > 0 && siblingDiscountPct < 100
        ? baseLessonPrice * (1 - siblingDiscountPct / 100)
        : isSiblingWaived100
        ? 0
        : baseLessonPrice;

    let priorPurchasedSessions = 0;
    if (isSiblingWaived100) {
      priorPurchasedSessions = 16;
    } else if (effectiveLessonPrice > 0) {
      let totalPaidTuition = 0;
      priorTuitionVouchers.forEach((v: any) => {
        const vAmount = Number(v.amount || 0);
        const vRefunded = v.refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
        totalPaidTuition += Math.max(0, vAmount - vRefunded);
      });
      priorPurchasedSessions = Math.floor(totalPaidTuition / effectiveLessonPrice);
    } else {
      priorPurchasedSessions = priorTuitionVouchers.length * 4;
    }

    const transferredOut = enrollment.transfersFrom.reduce((sum: number, t: any) => sum + t.transferredSessions, 0);
    const transferredIn = enrollment.transfersTo.reduce((sum: number, t: any) => sum + t.transferredSessions, 0);

    // Attendances strictly prior to return date and not excluded
    const priorAtts = (student.attendances || []).filter((att: any) => {
      if (!att.lesson || att.lesson.classId !== c.id || att.lesson.isFree) return false;
      if ((params.excludeLessonIds || []).includes(att.lesson.id)) return false;
      const lDayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Algiers",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(att.lesson.startsAt));
      return lDayStr < refDayStr;
    });

    const priorLessons = priorAtts.map((att: any) => att.lesson);
    const priorCatchUps = (student.catchUpAttendances || []).filter((cu: any) => {
      if (!cu.missedLesson || cu.missedLesson.classId !== c.id) return false;
      const cuDayStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Algiers",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(cu.missedLesson.startsAt));
      return cuDayStr < refDayStr;
    });

    const priorAttendedSessions = computeStudentConsumedSessions({
      lessons: priorLessons,
      attendances: priorAtts.map((att: any) => ({ lessonId: att.lesson.id, status: att.status })),
      catchUps: priorCatchUps.map((cu: any) => ({
        missedLessonId: cu.missedLessonId,
        catchUpLessonId: cu.catchUpLessonId,
      })),
    });

    const currentOffset = enrollment.creditResetOffset || 0;
    const priorRawCredit = (priorPurchasedSessions + transferredIn - transferredOut) - priorAttendedSessions + currentOffset;

    const newCreditResetOffset = priorRawCredit < 0 ? currentOffset - priorRawCredit : currentOffset;

    await client.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "ACTIVE",
        payerStatus: enrollment.payerStatus === "SUSPENDED" ? "NORMAL" : enrollment.payerStatus,
        creditResetOffset: newCreditResetOffset,
      },
    });

    // Audit log
    try {
      await client.auditLog.create({
        data: {
          entityType: "ENROLLMENT",
          entityId: String(enrollment.id),
          action: "REINSTATE_ENROLLMENT",
          branchId: c.branchId,
          userId: params.actorId || "system",
          userName: params.actorName || "Système",
          oldValue: `status:SUSPENDED,priorCredit:${priorRawCredit}`,
          newValue: `status:ACTIVE,payerStatus:NORMAL,creditResetOffset:${newCreditResetOffset}`,
          details: `Rétablissement automatique (${params.trigger === "PAYMENT" ? "Paiement" : params.trigger === "ATTENDANCE" ? "Présence" : "Manuel"}) dans "${c.name}". ${
            priorRawCredit < 0
              ? `Dettes antérieures (${Math.abs(priorRawCredit)} séances) effacées.`
              : `Crédit antérieur conservé (${priorRawCredit} séances).`
          }`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

    safeRevalidatePath(`/list/students/${params.studentId}`);
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath(`/list/payments/class/${c.id}`);
    safeRevalidatePath(`/list/classes/${c.id}`);
    safeRevalidatePath(`/list/attendance/class/${c.id}`);
    safeRevalidatePath(`/list/attendance/take/${c.id}`);
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath("/admin");

    return {
      success: true,
      creditResetOffset: newCreditResetOffset,
      rawCredit: priorRawCredit,
      enrollmentId: enrollment.id,
    };
  } catch (err) {
    console.error("unsuspendEnrollmentWithDebtClearance error:", err);
    return { success: false, creditResetOffset: 0, rawCredit: 0 };
  }
}

/**
 * Toggle enrollment suspension status (ACTIVE/NORMAL <-> SUSPENDED).
 * Suspended students will not appear on the Take Attendance page or in the Dashboard Paying Students section.
 * When restored from SUSPENDED to NORMAL:
 * - All historical records (attendance, vouchers) remain safely stored.
 * - Previous lesson debts/credits are removed and lessons credit is strictly reset to 0.
 */
export async function toggleEnrollmentSuspensionAction(
  studentId: string,
  enrollmentId: number,
  targetStatus: "SUSPENDED" | "NORMAL"
): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  status?: string;
  payerStatus?: string;
  enrollmentId?: number;
}> {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.isOwner && !session.isOwnerOrAdmin && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بهذا الإجراء",
      };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        class: {
          include: {
            branch: true,
            lessons: {
              where: { isFree: false },
              select: { id: true, startsAt: true, isFree: true },
            },
            vouchers: {
              where: { studentId, isVoided: false },
              include: { refunds: true },
            },
          },
        },
        student: {
          select: {
            id: true,
            name: true,
            registeredBranchId: true,
            payerStatus: true,
            family: true,
            attendances: {
              where: {
                lesson: {
                  classId: { not: undefined },
                  isFree: false,
                },
              },
              include: {
                lesson: {
                  select: { id: true, startsAt: true, isFree: true, classId: true },
                },
              },
            },
          },
        },
        transfersFrom: true,
        transfersTo: true,
      },
    });

    if (!enrollment || enrollment.studentId !== studentId) {
      return {
        success: false,
        error: true,
        message: "Inscription introuvable / التسجيل غير موجود",
      };
    }

    const branchId = enrollment.class.branchId;
    if (!session.isOwner && !session.isBranchAdmin && !session.isOwnerOrAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بتعديل أفواج هذا الفرع",
      };
    }

    const oldStatus = enrollment.status || "ACTIVE";
    const oldPayerStatus = enrollment.payerStatus || "NORMAL";

    if (targetStatus === "SUSPENDED") {
      // Mark as SUSPENDED
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: "SUSPENDED",
        },
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            entityType: "ENROLLMENT",
            entityId: String(enrollmentId),
            action: "SUSPEND_ENROLLMENT",
            branchId: branchId,
            userId: session.userId || session.rawRole || "system",
            userName: session.userId || session.rawRole || "Admin",
            oldValue: oldStatus,
            newValue: "SUSPENDED",
            details: `Élève suspendu du groupe "${enrollment.class.name}" / تم تعليق التلميذ من فوج "${enrollment.class.name}"`,
          },
        });
      } catch (auditErr) {
        console.warn("Audit log creation skipped:", auditErr);
      }

      safeRevalidatePath(`/list/students/${studentId}`);
      safeRevalidatePath("/list/students");
      safeRevalidatePath("/list/payments");
      safeRevalidatePath(`/list/payments/class/${enrollment.classId}`);
      safeRevalidatePath(`/list/classes/${enrollment.classId}`);
      safeRevalidatePath(`/list/attendance/class/${enrollment.classId}`);
      safeRevalidatePath(`/list/attendance/take/${enrollment.classId}`);
      safeRevalidatePath("/admin");

      return {
        success: true,
        error: false,
        message: `Groupe "${enrollment.class.name}" : élève suspendu avec succès / فوج "${enrollment.class.name}": تم تعليق التلميذ بنجاح`,
        status: "SUSPENDED",
        payerStatus: oldPayerStatus,
        enrollmentId,
      };
    } else {
      // If already active and normal, return immediately without touching credit
      if (oldStatus === "ACTIVE" && oldPayerStatus === "NORMAL") {
        return {
          success: true,
          error: false,
          message: `Groupe "${enrollment.class.name}" : élève déjà en statut normal / التلميذ في الحالة العادية بالفعل`,
          status: "ACTIVE",
          payerStatus: "NORMAL",
          enrollmentId,
        };
      }

      const res = await unsuspendEnrollmentWithDebtClearance(prisma, {
        studentId,
        classId: enrollment.classId,
        enrollmentId,
        trigger: "MANUAL",
        actorId: session.userId || session.rawRole || "system",
        actorName: session.userId || session.rawRole || "Admin",
        referenceDate: new Date(),
      });

      return {
        success: true,
        error: false,
        message: `Groupe "${enrollment.class.name}" : réinscrit en statut Normal. Dettes antérieures effacées et crédit réinitialisé / تم إعادة التلميذ للحالة العادية وتصفير الديون بنجاح`,
        status: "ACTIVE",
        payerStatus: "NORMAL",
        enrollmentId,
      };
    }
  } catch (err: any) {
    console.error("toggleEnrollmentSuspensionAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la mise à jour du statut / حدث خطأ أثناء تحديث الحالة",
    };
  }
}

