"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import { serializeForClient, getLessonDateTime } from "@/lib/utils";
import { upsertDailyLedger } from "@/lib/ledger";
import { checkForConflicts } from "@/lib/actions";
import { getFormationInscriptionFeeAction } from "@/lib/configurationActions";
import { revalidateFinancialRoutes } from "@/lib/revalidation";
import { buildVoucherBillingSnapshot } from "@/lib/studentBilling";
import { ACTIVE_CLASS_WHERE, isClassInactive } from "@/lib/classStatus";
import {
  applyNormalLessonFutureUpdate,
  findSeriesLessonsWithUsage,
  retireOrDeleteNormalLesson,
} from "@/lib/lessonInstances";
import { getNextUpcomingOccurrence } from "@/lib/lessonRecurrence";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore error when running outside of Next.js HTTP request context (e.g. scripts)
  }
}

function revalidateFormationPaths(opts?: {
  languageId?: number | null;
  classIds?: Array<number | null | undefined>;
}) {
  safeRevalidatePath("/list/formations");
  safeRevalidatePath("/fr/list/formations");
  safeRevalidatePath("/ar/list/formations");
  safeRevalidatePath("/list/classes");
  safeRevalidatePath("/fr/list/classes");
  safeRevalidatePath("/ar/list/classes");
  if (opts?.languageId) {
    safeRevalidatePath(`/list/formations/${opts.languageId}`);
    safeRevalidatePath(`/fr/list/formations/${opts.languageId}`);
    safeRevalidatePath(`/ar/list/formations/${opts.languageId}`);
  }
  for (const cid of opts?.classIds || []) {
    if (cid) {
      safeRevalidatePath(`/list/formations/${cid}`);
      safeRevalidatePath(`/fr/list/formations/${cid}`);
      safeRevalidatePath(`/ar/list/formations/${cid}`);
    }
  }
}

export type ActionResponse<T = any> = {
  success: boolean;
  error: boolean;
  message: string;
  data?: T;
};

// =================================================================
// 1. LANGUAGE ACTIONS
// =================================================================

export async function createLanguage(data: { name: string }): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء مخصص لمالك المؤسسة فقط" };
    }

    const trimmed = data.name.trim();
    if (!trimmed) {
      return { success: false, error: true, message: "Nom de langue obligatoire / اسم اللغة مطلوب" };
    }

    const existing = await prisma.language.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
    });

    if (existing) {
      return { success: false, error: true, message: "Cette langue existe déjà / هذه اللغة موجودة بالفعل" };
    }

    const lang = await prisma.language.create({
      data: { name: trimmed },
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Langue créée avec succès / تم إنشاء اللغة بنجاح", data: lang };
  } catch (err: any) {
    console.error("Error creating language:", err);
    return { success: false, error: true, message: err?.message || "Échec de la création de la langue / فشل في إنشاء اللغة" };
  }
}

export async function updateLanguage(data: { id: number; name: string }): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء مخصص لمالك المؤسسة فقط" };
    }

    const trimmed = data.name.trim();
    if (!trimmed) {
      return { success: false, error: true, message: "Nom de langue obligatoire / اسم اللغة مطلوب" };
    }

    const updated = await prisma.language.update({
      where: { id: data.id },
      data: { name: trimmed },
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Langue modifiée avec succès / تم تعديل اللغة بنجاح", data: updated };
  } catch (err: any) {
    console.error("Error updating language:", err);
    return { success: false, error: true, message: err?.message || "Échec de la modification de la langue / فشل في تعديل اللغة" };
  }
}

export async function deleteLanguage(id: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء مخصص لمالك المؤسسة فقط" };
    }

    // Check if there are formation classes attached
    const levels = await prisma.formationLevel.findMany({
      where: { languageId: id },
      include: { Class: true },
    });

    const hasClasses = levels.some((lvl) => lvl.Class.length > 0);
    if (hasClasses) {
      return {
        success: false,
        error: true,
        message: "Impossible de supprimer cette langue car des groupes y sont rattachés / لا يمكن حذف هذه اللغة لوجود أفواج تكوينية مرتبطة بمستوياتها",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.formationLevel.deleteMany({ where: { languageId: id } });
      await tx.language.delete({ where: { id } });
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Langue supprimée avec succès / تم حذف اللغة بنجاح" };
  } catch (err: any) {
    console.error("Error deleting language:", err);
    return { success: false, error: true, message: err?.message || "Échec de la suppression de la langue / فشل في حذف اللغة" };
  }
}

// =================================================================
// 2. FORMATION LEVEL ACTIONS
// =================================================================

export async function createFormationLevel(data: {
  languageId: number;
  levelNumber?: number;
  name: string;
  lumpSumPrice?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const trimmedName = data.name.trim();
    if (!trimmedName) {
      return { success: false, error: true, message: "Nom du niveau obligatoire / اسم المستوى مطلوب" };
    }

    // Determine level number if not provided
    let levelNum = data.levelNumber;
    if (!levelNum || levelNum < 1) {
      const highest = await prisma.formationLevel.findFirst({
        where: { languageId: data.languageId },
        orderBy: { levelNumber: "desc" },
      });
      levelNum = highest ? highest.levelNumber + 1 : 1;
    }

    const price = data.lumpSumPrice && data.lumpSumPrice >= 0 ? data.lumpSumPrice : 0;

    const level = await prisma.formationLevel.create({
      data: {
        languageId: data.languageId,
        levelNumber: levelNum,
        name: trimmedName,
        lumpSumPrice: new Prisma.Decimal(price),
      },
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Niveau de formation ajouté avec succès / تمت إضافة المستوى التكويني بنجاح", data: serializeForClient(level) };
  } catch (err: any) {
    console.error("Error creating formation level:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'ajout du niveau de formation / فشل في إضافة المستوى التكويني" };
  }
}

export async function updateFormationLevel(data: {
  id: number;
  name: string;
  levelNumber?: number;
  lumpSumPrice?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const updateData: any = {
      name: data.name.trim(),
    };

    if (data.levelNumber !== undefined) {
      updateData.levelNumber = data.levelNumber;
    }
    if (data.lumpSumPrice !== undefined) {
      updateData.lumpSumPrice = new Prisma.Decimal(data.lumpSumPrice);
    }

    const updated = await prisma.formationLevel.update({
      where: { id: data.id },
      data: updateData,
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Niveau de formation mis à jour avec succès / تم تحديث المستوى بنجاح", data: serializeForClient(updated) };
  } catch (err: any) {
    console.error("Error updating formation level:", err);
    return { success: false, error: true, message: err?.message || "Échec de la mise à jour du niveau / فشل في تحديث المستوى" };
  }
}

export async function executeSafeDeleteFormationLevel(
  tx: any,
  levelId: number
): Promise<{ success: boolean; deletedName: string }> {
  const level = await tx.formationLevel.findUnique({
    where: { id: levelId },
    include: {
      Language: true,
      Class: {
        include: {
          enrollments: { select: { id: true } },
          vouchers: { where: { isVoided: false }, select: { id: true } },
        },
      },
      LevelTest: { select: { id: true } },
    },
  });

  if (!level) {
    throw new Error("Niveau de formation introuvable / المستوى غير موجود");
  }

  // 1. Check if any student is actively enrolled in any class of this level
  const totalEnrollments = level.Class.reduce(
    (sum: number, c: any) => sum + c.enrollments.length,
    0
  );
  if (totalEnrollments > 0) {
    throw new Error(
      `Impossible de supprimer le niveau "${level.name}" car il contient des élèves inscrits (${totalEnrollments} élève(s)) / لا يمكن حذف المستوى (${level.name}) لاحتوائه على تلاميذ مسجلين (${totalEnrollments})`
    );
  }

  // 2. Check if any active payment vouchers exist
  const totalActiveVouchers = level.Class.reduce(
    (sum: number, c: any) => sum + c.vouchers.length,
    0
  );
  if (totalActiveVouchers > 0) {
    throw new Error(
      `Impossible de supprimer le niveau "${level.name}" car des reçus de paiement actifs y sont associés / لا يمكن حذف المستوى (${level.name}) لوجود وصولات دفع نشطة مسجلة عليه`
    );
  }

  const classIds = level.Class.map((c: any) => c.id);

  if (classIds.length > 0) {
    // 3. Lessons & attendances
    const lessons = await tx.lesson.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    });
    const lessonIds = lessons.map((l: any) => l.id);

    if (lessonIds.length > 0) {
      await tx.catchUpAttendance.deleteMany({
        where: {
          OR: [
            { missedLessonId: { in: lessonIds } },
            { catchUpLessonId: { in: lessonIds } },
          ],
        },
      });
      await tx.attendance.deleteMany({
        where: { lessonId: { in: lessonIds } },
      });
      await tx.lesson.deleteMany({
        where: { id: { in: lessonIds } },
      });
    }

    // 4. Level tests
    await tx.levelTest.deleteMany({
      where: {
        OR: [
          { classId: { in: classIds } },
          { formationLevelId: levelId },
        ],
      },
    });

    // 5. Photocopy charges
    await tx.photocopyCharge.deleteMany({
      where: { classId: { in: classIds } },
    });

    // 6. Voided vouchers (detach classId)
    await tx.voucher.updateMany({
      where: { classId: { in: classIds } },
      data: { classId: null },
    });

    // 7. Orphaned enrollments / transfers (if any 0-student entries remain)
    const enrollments = await tx.enrollment.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    });
    const enrollmentIds = enrollments.map((e: any) => e.id);
    if (enrollmentIds.length > 0) {
      await tx.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollmentId: { in: enrollmentIds } },
            { toEnrollmentId: { in: enrollmentIds } },
          ],
        },
      });
      await tx.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    }

    // 8. Announcements
    await tx.announcement.deleteMany({
      where: { classId: { in: classIds } },
    });

    // 9. Delete classes
    await tx.class.deleteMany({
      where: { id: { in: classIds } },
    });
  } else {
    // Also clean up any level tests referencing this formationLevelId directly
    await tx.levelTest.deleteMany({
      where: { formationLevelId: levelId },
    });
  }

  // 10. Delete the formation level
  await tx.formationLevel.delete({
    where: { id: levelId },
  });

  return { success: true, deletedName: level.name };
}

export async function deleteFormationLevel(id: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const result = await prisma.$transaction(async (tx) => {
      return await executeSafeDeleteFormationLevel(tx, id);
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: `Niveau "${result.deletedName}" supprimé avec succès / تم حذف المستوى بنجاح`,
    };
  } catch (err: any) {
    console.error("Error deleting formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la suppression du niveau / فشل في حذف المستوى",
    };
  }
}

// =================================================================
// 3. FORMATION GROUP (CLASS) ACTIONS
// =================================================================

export async function createFormationGroup(data: {
  name?: string;
  branchId?: number;
  formationLevelId: number;
  teacherId?: string | null;
  ageGroup?: string;
  pricePerCycle?: number;
  inscriptionFee?: number;
  hasBooks?: boolean;
  bookFee?: number | null;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && !session.isBranchAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const activeBranchId = await getActiveBranchId();

    const level = await prisma.formationLevel.findUnique({
      where: { id: data.formationLevelId },
      include: {
        Language: true,
        _count: { select: { Class: true } },
      },
    });
    if (!level) {
      return { success: false, error: true, message: "Niveau de formation introuvable / المستوى التكويني المحدد غير موجود" };
    }

    const referenceFormationClass = await prisma.class.findFirst({
      where: {
        isFormation: true,
        FormationLevel: { languageId: level.languageId },
      },
      orderBy: { id: "asc" },
    });

    const targetBranchId =
      data.branchId || activeBranchId || referenceFormationClass?.branchId || 1;

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetBranchId)) {
      return { success: false, error: true, message: "Non autorisé à créer un groupe dans cette succursale / غير مصرح لك بإنشاء فوج تكويني في هذا الفرع" };
    }

    const defaultFormationFee = await getFormationInscriptionFeeAction();
    const effectiveInscFee =
      data.inscriptionFee && data.inscriptionFee > 0
        ? data.inscriptionFee
        : referenceFormationClass?.inscriptionFee && Number(referenceFormationClass.inscriptionFee) > 0
        ? Number(referenceFormationClass.inscriptionFee)
        : defaultFormationFee;

    const effectiveHasBooks =
      data.hasBooks !== undefined
        ? Boolean(data.hasBooks)
        : Boolean(referenceFormationClass?.hasBooks);

    const effectiveBookFee =
      effectiveHasBooks
        ? data.bookFee !== undefined && data.bookFee !== null
          ? new Prisma.Decimal(data.bookFee)
          : referenceFormationClass?.bookFee ?? null
        : null;

    const effectivePrice =
      data.pricePerCycle !== undefined && data.pricePerCycle >= 0
        ? new Prisma.Decimal(data.pricePerCycle)
        : level.lumpSumPrice;

    const nextGroupNumber = (level._count?.Class || 0) + 1;
    const resolvedName = data.name?.trim()
      ? data.name.trim()
      : nextGroupNumber === 1
      ? `${level.Language.name} - ${level.name}`
      : `${level.Language.name} - ${level.name} - Groupe ${nextGroupNumber}`;

    const resolvedTeacherId = data.teacherId?.trim() ? data.teacherId.trim() : null;
    const resolvedAgeGroup =
      data.ageGroup?.trim() ||
      referenceFormationClass?.ageGroup ||
      "Adultes (15+ ans)";

    const formationClass = await prisma.class.create({
      data: {
        name: resolvedName,
        branchId: targetBranchId,
        teacherId: resolvedTeacherId,
        isFormation: true,
        formationLevelId: data.formationLevelId,
        ageGroup: resolvedAgeGroup,
        pricePerCycle: effectivePrice,
        inscriptionFee: new Prisma.Decimal(effectiveInscFee),
        hasBooks: effectiveHasBooks,
        bookFee: effectiveBookFee,
      },
      include: {
        branch: true,
        teacher: true,
        FormationLevel: { include: { Language: true } },
      },
    });

    revalidateFormationPaths({
      languageId: level.languageId,
      classIds: [formationClass.id],
    });
    return {
      success: true,
      error: false,
      message: "Groupe de formation créé avec succès / تم إنشاء الفوج التكويني بنجاح",
      data: serializeForClient(formationClass),
    };
  } catch (err: any) {
    console.error("Error creating formation group:", err);
    return { success: false, error: true, message: err?.message || "Échec de la création du groupe / فشل في إنشاء الفوج التكويني" };
  }
}

// =================================================================
// 4. STUDENT ENROLLMENT INTO FORMATION GROUP
// =================================================================

export async function enrollStudentInFormationGroup(data: {
  studentId: string;
  classId: number;
  academicYearId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return { success: false, error: true, message: "Groupe introuvable ou non conforme / الفوج المحدد غير موجود أو ليس فوج تكوين لغوي" };
    }

    if (isClassInactive(targetClass)) {
      return {
        success: false,
        error: true,
        message: `Impossible d'inscrire un élève dans le groupe de formation fermé / en pause (${targetClass.name}) / لا يمكن تسجيل تلميذ في الفوج التكويني المغلق / المتوقف (${targetClass.name})`,
      };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé à inscrire dans cette succursale / غير مصرح لك بالتسجيل في هذا الفرع" };
    }

    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
    });
    if (!student) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود" };
    }

    // Resolve academic year
    let academicYearId = data.academicYearId;
    if (!academicYearId) {
      const year = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
      academicYearId = year ? year.id : 1;
    }

    // Check if already enrolled in this exact class
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId: data.studentId,
        classId: data.classId,
        academicYearId: academicYearId,
      },
    });

    if (existing) {
      return { success: false, error: true, message: "L'élève est déjà inscrit dans ce groupe / التلميذ مسجل بالفعل في هذا الفوج التكويني" };
    }

    // Formations have separate inscription fees and are NOT affected by waiving logic (more than 3 groups)
    const defaultFormationFee = await getFormationInscriptionFeeAction();
    const feeAmount =
      Number(targetClass.inscriptionFee || 0) > 0
        ? targetClass.inscriptionFee
        : new Prisma.Decimal(defaultFormationFee);

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: data.studentId,
        classId: data.classId,
        academicYearId: academicYearId,
        inscriptionFeeCharged: true,
        inscriptionFeeAmount: feeAmount,
        enrolledAt: new Date(),
      },
    });

    await revalidateFinancialRoutes({
      classId: targetClass.id,
      studentId: data.studentId,
      branchId: targetClass.branchId,
    });
    safeRevalidatePath("/list/formations");
    return {
      success: true,
      error: false,
      message: `Élève inscrit avec succès dans (${targetClass.name}) / تم تسجيل التلميذ بنجاح في الفوج (${targetClass.name})`,
      data: serializeForClient(enrollment),
    };
  } catch (err: any) {
    console.error("Error enrolling student in formation group:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'inscription de l'élève / فشل في تسجيل التلميذ" };
  }
}

// =================================================================
// 5. LEVEL TEST (TEST DE NIVEAU) ACTIONS
// =================================================================

export async function recordLevelTest(data: {
  studentId: string;
  classId: number;
  formationLevelId: number;
  testDate: Date | string;
  score?: number | null;
  passed: boolean;
  administeredBy: string;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    // Verify student is enrolled in this formation group
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: data.studentId,
        classId: data.classId,
      },
    });

    if (!enrollment) {
      return {
        success: false,
        error: true,
        message: "L'élève n'est pas inscrit dans ce groupe / التلميذ غير مسجل في هذا الفوج التكويني",
      };
    }

    const currentLevel = await prisma.formationLevel.findUnique({
      where: { id: data.formationLevelId },
      include: { Language: true },
    });

    if (!currentLevel) {
      return { success: false, error: true, message: "Niveau de formation introuvable / المستوى التكويني غير موجود" };
    }

    const dateVal = new Date(data.testDate);

    const levelTest = await prisma.levelTest.create({
      data: {
        studentId: data.studentId,
        classId: data.classId,
        formationLevelId: data.formationLevelId,
        testDate: dateVal,
        score: data.score !== undefined && data.score !== null ? new Prisma.Decimal(data.score) : null,
        passed: !!data.passed,
        administeredBy: data.administeredBy.trim() || session.userId || "Admin",
      },
      include: {
        FormationLevel: { include: { Language: true } },
        Class: true,
        Student: true,
      },
    });

    // Check if next level exists for this language
    let nextLevel: any = null;
    let availableNextGroups: any[] = [];

    if (levelTest.passed) {
      nextLevel = await prisma.formationLevel.findFirst({
        where: {
          languageId: currentLevel.languageId,
          levelNumber: currentLevel.levelNumber + 1,
        },
      });

      if (nextLevel) {
        availableNextGroups = await prisma.class.findMany({
          where: {
            isFormation: true,
            formationLevelId: nextLevel.id,
            ...ACTIVE_CLASS_WHERE,
          },
          include: {
            branch: true,
            lessons: {
              include: { classroom: true, teacher: true },
              orderBy: { startsAt: "asc" },
            },
            _count: {
              select: {
                enrollments: {
                  where: {
                    status: "ACTIVE",
                    transfersFrom: { none: {} },
                  },
                },
              },
            },
          },
        });
      }
    }

    safeRevalidatePath("/list/formations");
    return {
      success: true,
      error: false,
      message: levelTest.passed
        ? `Test réussi ! Prêt pour le niveau supérieur / تم تسجيل اجتياز التلميذ لاختبار المستوى بنجاح!`
        : `Test échoué. L'élève reste au niveau actuel / تم تسجيل نتيجة الاختبار (راسب). يبقى التلميذ في مستواه الحالي.`,
      data: serializeForClient({
        levelTest,
        nextLevel,
        availableNextGroups,
      }),
    };
  } catch (err: any) {
    console.error("Error recording level test:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'enregistrement du test / فشل في تسجيل اختبار المستوى" };
  }
}

// =================================================================
// 6. ASSISTED LEVEL-UP ACTION
// =================================================================

export async function getNextLevelFormationGroups(nextLevelId: number): Promise<ActionResponse> {
  try {
    const groups = await prisma.class.findMany({
      where: {
        isFormation: true,
        formationLevelId: nextLevelId,
        ...ACTIVE_CLASS_WHERE,
      },
      include: {
        branch: true,
        lessons: {
          include: { classroom: true, teacher: true },
          orderBy: { startsAt: "asc" },
        },
        _count: {
          select: {
            enrollments: {
              where: {
                status: "ACTIVE",
                transfersFrom: { none: {} },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      error: false,
      message: "Groupes disponibles récupérés avec succès / تم جلب الأفواج المتاحة",
      data: serializeForClient(groups),
    };
  } catch (err: any) {
    console.error("Error fetching next level groups:", err);
    return { success: false, error: true, message: err?.message || "Échec de la récupération des groupes / فشل في جلب الأفواج" };
  }
}

export async function levelUpStudent(data: {
  studentId: string;
  levelTestId: number;
  targetClassId: number;
  academicYearId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    // 1. Verify LevelTest was passed
    const test = await prisma.levelTest.findUnique({
      where: { id: data.levelTestId },
      include: {
        FormationLevel: true,
        Class: true,
      },
    });

    if (!test) {
      return { success: false, error: true, message: "Fiche de test introuvable / سجل اختبار المستوى غير موجود" };
    }

    if (test.studentId !== data.studentId) {
      return { success: false, error: true, message: "Identifiant élève non conforme / معرف التلميذ لا يتطابق مع اختبار المستوى" };
    }

    if (!test.passed) {
      return { success: false, error: true, message: "Promotion impossible (test non réussi) / لا يمكن ترقية التلميذ لأنه لم يجتز الاختبار بنجاح" };
    }

    // 2. Verify target class is a formation group at the next level
    const targetClass = await prisma.class.findUnique({
      where: { id: data.targetClassId },
      include: {
        FormationLevel: true,
        branch: true,
      },
    });

    if (!targetClass || !targetClass.isFormation || !targetClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe cible invalide / الفوج المستهدف غير صالح" };
    }

    if (isClassInactive(targetClass)) {
      return {
        success: false,
        error: true,
        message: `Impossible de promouvoir l'élève vers le groupe fermé / en pause (${targetClass.name}) / لا يمكن ترقية التلميذ إلى الفوج المغلق / المتوقف (${targetClass.name})`,
      };
    }

    if (targetClass.FormationLevel.languageId !== test.FormationLevel.languageId) {
      return { success: false, error: true, message: "La langue du groupe ne correspond pas au test / لغة الفوج المستهدف لا تطابق لغة الاختبار" };
    }

    if (targetClass.FormationLevel.levelNumber !== test.FormationLevel.levelNumber + 1) {
      return {
        success: false,
        error: true,
        message: `Niveau incohérent : (${targetClass.FormationLevel.name}) vs (${test.FormationLevel.levelNumber + 1}) / الفوج المستهدف في المستوى (${targetClass.FormationLevel.name})، والمطلوب المستوى التالي (${test.FormationLevel.levelNumber + 1})`,
      };
    }

    // 3. Resolve Academic Year
    let yearId = data.academicYearId;
    if (!yearId) {
      const year = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
      yearId = year ? year.id : 1;
    }

    // 4. Check if student is already enrolled in the target class
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: data.studentId,
        classId: data.targetClassId,
        academicYearId: yearId,
      },
    });

    if (existingEnrollment) {
      return {
        success: false,
        error: true,
        message: `L'élève est déjà inscrit dans le groupe (${targetClass.name}) / التلميذ مسجل بالفعل في الفوج المستهدف (${targetClass.name})`,
      };
    }

    // 5. Inscription fee handling for formations (independent from 3-group waiving logic)
    const defaultFormationFee = await getFormationInscriptionFeeAction();
    const feeAmount =
      Number(targetClass.inscriptionFee || 0) > 0
        ? targetClass.inscriptionFee
        : new Prisma.Decimal(defaultFormationFee);

    // 6. Create the new Enrollment (assisted level up)
    const newEnrollment = await prisma.enrollment.create({
      data: {
        studentId: data.studentId,
        classId: data.targetClassId,
        academicYearId: yearId,
        inscriptionFeeCharged: true,
        inscriptionFeeAmount: feeAmount,
        enrolledAt: new Date(),
      },
      include: {
        class: {
          include: { FormationLevel: true, branch: true },
        },
        student: true,
      },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath(`/list/payments/class/${targetClass.id}`);

    return {
      success: true,
      error: false,
      message: `تم ترقية التلميذ (${newEnrollment.student.name}) بنجاح إلى المستوى ${targetClass.FormationLevel.name} في الفوج (${targetClass.name})!`,
      data: serializeForClient(newEnrollment),
    };
  } catch (err: any) {
    console.error("Error leveling up student:", err);
    return { success: false, error: true, message: err?.message || "فشل في ترقية التلميذ." };
  }
}

// =================================================================
// 7. STUDENT LANGUAGE PROGRESSION HISTORY
// =================================================================

export async function getStudentLanguageProgression(studentId: string, languageId: number) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, phone: true },
    });

    if (!student) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود" };
    }

    const language = await prisma.language.findUnique({
      where: { id: languageId },
      include: {
        FormationLevel: {
          orderBy: { levelNumber: "asc" },
        },
      },
    });

    if (!language) {
      return { success: false, error: true, message: "Langue introuvable / اللغة غير موجودة" };
    }

    // Get all enrollments for this student in classes of this language
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: studentId,
        class: {
          isFormation: true,
          FormationLevel: {
            languageId: languageId,
          },
        },
      },
      include: {
        class: {
          include: {
            FormationLevel: true,
            branch: true,
          },
        },
        academicYear: true,
      },
      orderBy: { enrolledAt: "asc" },
    });

    // Get all level tests taken by this student for this language
    const levelTests = await prisma.levelTest.findMany({
      where: {
        studentId: studentId,
        FormationLevel: {
          languageId: languageId,
        },
      },
      include: {
        FormationLevel: true,
        Class: true,
      },
      orderBy: { testDate: "asc" },
    });

    return {
      success: true,
      error: false,
      message: "Parcours de formation récupéré avec succès / تم جلب سجل المسار التكويني بنجاح",
      data: serializeForClient({
        student,
        language,
        enrollments,
        levelTests,
      }),
    };
  } catch (err: any) {
    console.error("Error fetching student language progression:", err);
    return { success: false, error: true, message: err?.message || "فشل في جلب سجل التلميذ." };
  }
}

// =================================================================
// 8. UNIFIED FORMATION CREATION (LANGUAGE + MULTI-LEVEL + INITIAL GROUP)
// =================================================================

export async function createFormationWithLevels(data: {
  languageName: string;
  languageId?: number;
  levels: Array<{
    name: string;
    lumpSumPrice: number;
    teacherId?: string | null;
    groups?: Array<{
      name?: string;
      teacherId?: string | null;
      branchId?: number;
      ageGroup?: string;
    }>;
  }>;
  branchId: number;
  teacherId?: string | null;
  ageGroup?: string;
  initialGroupName?: string;
  hasBooks?: boolean;
  bookFee?: number;
  inscriptionFee?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour créer une formation / صلاحية غير كافية لإنشاء تكوين جديد" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, data.branchId)) {
      return { success: false, error: true, message: "Non autorisé à créer un groupe dans cette succursale / غير مصرح لك بإنشاء فوج في هذا الفرع" };
    }

    const trimmedLangName = data.languageName?.trim();
    if (!trimmedLangName && !data.languageId) {
      return { success: false, error: true, message: "Veuillez sélectionner la langue / يرجى تحديد لغة التكوين" };
    }

    if (!data.levels || data.levels.length === 0) {
      return { success: false, error: true, message: "Au moins un niveau est requis / يجب تحديد مستوى تكويني واحد على الأقل" };
    }

    const defaultFormationFee = await getFormationInscriptionFeeAction();
    const effectiveInscFee =
      data.inscriptionFee && data.inscriptionFee > 0
        ? data.inscriptionFee
        : defaultFormationFee;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create Language
      let language: any;
      if (data.languageId) {
        language = await tx.language.findUnique({ where: { id: data.languageId } });
      } else {
        language = await tx.language.findFirst({
          where: { name: { equals: trimmedLangName, mode: "insensitive" } },
        });
        if (!language) {
          language = await tx.language.create({
            data: { name: trimmedLangName! },
          });
        }
      }

      // 2. Determine base levelNumber
      const highestLevel = await tx.formationLevel.findFirst({
        where: { languageId: language.id },
        orderBy: { levelNumber: "desc" },
      });
      const baseLevelNum = highestLevel ? highestLevel.levelNumber : 0;

      // 3. Create levels
      const createdLevels: any[] = [];
      for (let i = 0; i < data.levels.length; i++) {
        const lvlData = data.levels[i];
        const lvl = await tx.formationLevel.create({
          data: {
            languageId: language.id,
            levelNumber: baseLevelNum + i + 1,
            name: lvlData.name.trim(),
            lumpSumPrice: new Prisma.Decimal(lvlData.lumpSumPrice || 0),
          },
        });
        createdLevels.push(lvl);
      }

      // 4. Create initial groups (Class) for ALL newly created levels (supporting 1 or multiple groups per level)
      let initialFormationGroup: any = null;
      const createdGroups: any[] = [];

      for (let i = 0; i < createdLevels.length; i++) {
        const lvl = createdLevels[i];
        const lvlInput = data.levels[i];
        const groupInputs =
          lvlInput?.groups && lvlInput.groups.length > 0
            ? lvlInput.groups
            : [
                {
                  name: i === 0 && data.initialGroupName?.trim() ? data.initialGroupName.trim() : "",
                  teacherId: lvlInput?.teacherId,
                  branchId: data.branchId,
                  ageGroup: data.ageGroup,
                },
              ];

        for (let gIdx = 0; gIdx < groupInputs.length; gIdx++) {
          const grpInput = groupInputs[gIdx];
          const grpTeacherId = grpInput?.teacherId?.trim() ? grpInput.teacherId.trim() : null;
          const grpBranchId = grpInput?.branchId ? Number(grpInput.branchId) : data.branchId;
          const grpAgeGroup = grpInput?.ageGroup?.trim() || data.ageGroup?.trim() || "Adultes (15+ ans)";

          const fallbackName =
            groupInputs.length === 1
              ? i === 0 && data.initialGroupName?.trim()
                ? data.initialGroupName.trim()
                : `${language.name} - ${lvl.name}`
              : `${language.name} - ${lvl.name} - Groupe ${gIdx + 1}`;

          const groupName = grpInput?.name?.trim() ? grpInput.name.trim() : fallbackName;

          const cls = await tx.class.create({
            data: {
              name: groupName,
              branchId: grpBranchId,
              teacherId: grpTeacherId,
              isFormation: true,
              formationLevelId: lvl.id,
              ageGroup: grpAgeGroup,
              pricePerCycle: lvl.lumpSumPrice,
              hasBooks: !!data.hasBooks,
              bookFee: data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null,
              inscriptionFee: new Prisma.Decimal(effectiveInscFee),
            },
          });

          createdGroups.push(cls);
          if (!initialFormationGroup) {
            initialFormationGroup = cls;
          }
        }
      }

      return { language, levels: createdLevels, group: initialFormationGroup, groups: createdGroups };
    }, { timeout: 30000, maxWait: 10000 });

    revalidateFormationPaths({
      languageId: result.language.id,
      classIds: result.groups.map((g: any) => g.id),
    });
    return {
      success: true,
      error: false,
      message: "Formation et groupes créés avec succès ! / تم إنشاء التكوين والمستويات والأفواج بنجاح!",
      data: serializeForClient(result),
    };
  } catch (err: any) {
    console.error("Error creating formation with levels:", err);
    return { success: false, error: true, message: err?.message || "فشل في إنشاء التكوين." };
  }
}

// =================================================================
// 9. FORMATION LUMP-SUM PAYMENT & VOUCHER ACTIONS
// =================================================================

export async function recordFormationLumpSumPayment(data: {
  studentId: string;
  classId: number;
  amount: number;
  bookFeeAmount?: number;
  isPartial?: boolean;
  remainingBalance?: number;
  completesVoucherId?: number;
  notes?: string;
  isRetake?: boolean;
}): Promise<ActionResponse> {
  // Triggers financial cache revalidation via revalidateFinancialRoutes (/list/daily-ledger, /list/revenue)
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
      include: {
        FormationLevel: true,
        branch: true,
        teacherClassRates: true,
        teacher: {
          include: {
            TeacherPayRate: { orderBy: { effectiveFrom: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!targetClass || !targetClass.isFormation) {
      return { success: false, error: true, message: "Groupe de formation introuvable / الفوج التكويني المحدد غير موجود" };
    }

    const issuingBranchId = activeBranchId || targetClass.branchId;

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, issuingBranchId)) {
      return { success: false, error: true, message: "Non autorisé à émettre des reçus dans cette succursale / غير مصرح لك بإصدار وصولات من هذا الفرع" };
    }

    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
    });
    if (!student) {
      return { success: false, error: true, message: "Élève sélectionné introuvable / التلميذ المحدد غير موجود" };
    }

    const enrollmentForSnap = await prisma.enrollment.findFirst({
      where: { studentId: data.studentId, classId: data.classId },
      orderBy: { id: "desc" },
    });
    const tOverride = (targetClass.teacherClassRates as any[])?.find(
      (tcr: any) => tcr.teacherId === targetClass.teacherId
    )?.percentage;
    const teacherPercentage =
      tOverride != null
        ? Number(tOverride)
        : (targetClass.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee != null
        ? Number((targetClass.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
        : null;
    const baseFormationPrice = Number(
      targetClass.FormationLevel?.lumpSumPrice ?? targetClass.pricePerCycle ?? 0
    );
    const formationSnapshot = buildVoucherBillingSnapshot({
      payerStatus: enrollmentForSnap?.payerStatus || student.payerStatus || "NORMAL",
      discountType: enrollmentForSnap?.discountType,
      discountValue: enrollmentForSnap?.discountValue,
      pricePerCycle: baseFormationPrice,
      teacherPercentage,
      isFormation: true,
    });

    const finalAmount = Number(data.amount) || 0;
    const bookFee = Number(data.bookFeeAmount) || 0;

    if (finalAmount <= 0 && bookFee <= 0) {
      return { success: false, error: true, message: "Montant ou frais de livres invalides / يرجى إدخال مبلغ دفع صالح أو رسوم كتب صالحة" };
    }

    // Resolve continuous voucher series
    const isCrossBranch = issuingBranchId !== targetClass.branchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId: issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId: targetClass.branchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetClass.branchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    const noteAdd = data.isRetake ? "[إعادة المستوى / Retake]" : "";
    const combinedNotes = [data.notes, noteAdd].filter(Boolean).join(" ");

    let createdVoucher: any = null;
    let createdBookVoucher: any = null;

    await prisma.$transaction(async (tx) => {
      // 1. If tuition paid, issue FORMATION voucher
      if (finalAmount > 0) {
        const updatedSeries = await tx.voucherSeries.update({
          where: { id: series.id },
          data: { currentNumber: { increment: 1 } },
        });
        const voucherNumber = updatedSeries.currentNumber;

        createdVoucher = await tx.voucher.create({
          data: {
            seriesId: series.id,
            number: voucherNumber,
            studentId: data.studentId,
            classId: data.classId,
            issuingBranchId: issuingBranchId,
            targetBranchId: targetClass.branchId,
            paymentType: "FORMATION",
            amount: new Prisma.Decimal(finalAmount),
            isPartial: !!data.isPartial,
            completesVoucherId: data.completesVoucherId || null,
            remainingBalance: data.remainingBalance ? new Prisma.Decimal(data.remainingBalance) : null,
            issuedBy: session.userId || "admin",
            isVoided: false,
            appliedPayerStatus: formationSnapshot.appliedPayerStatus,
            baseCyclePrice: new Prisma.Decimal(formationSnapshot.baseCyclePrice),
            effectiveCyclePrice: new Prisma.Decimal(formationSnapshot.effectiveCyclePrice),
            effectiveSessionPrice: new Prisma.Decimal(formationSnapshot.effectiveSessionPrice),
            discountType: formationSnapshot.discountType,
            discountValue:
              formationSnapshot.discountValue !== null
                ? new Prisma.Decimal(formationSnapshot.discountValue)
                : null,
            teacherPayWeight: new Prisma.Decimal(formationSnapshot.teacherPayWeight),
          },
          include: {
            class: {
              include: {
                branch: true,
                level: true,
              },
            },
            student: true,
            series: {
              include: {
                issuingBranch: true,
                targetBranch: true,
                level: true,
              },
            },
          },
        });

        // Update DailyLedger at issuing branch where cash is physically collected (type ATELIER_FORMATION)
        await upsertDailyLedger(tx, {
          branchId: issuingBranchId,
          date: new Date(),
          type: "ATELIER_FORMATION",
          amount: finalAmount,
        });
      }

      // 2. If book fee paid, issue BOOK voucher (§1.2 & §2.11)
      if (bookFee > 0) {
        const bookSeriesUpdate = await tx.voucherSeries.update({
          where: { id: series.id },
          data: { currentNumber: { increment: 1 } },
        });
        let activeTrimesterId: number | null = null;
        try {
          const activeTrimester = await tx.trimester.findFirst({
            where: { status: "active" },
          });
          activeTrimesterId = activeTrimester?.id ?? null;
        } catch {
          // Fallback if status not recognized in stale client
        }

        createdBookVoucher = await tx.voucher.create({
          data: {
            seriesId: series.id,
            number: bookSeriesUpdate.currentNumber,
            studentId: data.studentId,
            classId: data.classId,
            issuingBranchId: issuingBranchId,
            targetBranchId: targetClass.branchId,
            paymentType: "BOOK",
            amount: new Prisma.Decimal(bookFee),
            isPartial: false,
            issuedBy: session.userId || "admin",
            isVoided: false,
            trimesterId: activeTrimesterId,
          },
          include: {
            class: {
              include: {
                branch: true,
                level: true,
              },
            },
            student: true,
            series: {
              include: {
                issuingBranch: true,
                targetBranch: true,
                level: true,
              },
            },
          },
        });

        // Update DailyLedger at issuing branch where cash is physically collected (type BOOK)
        await upsertDailyLedger(tx, {
          branchId: issuingBranchId,
          date: new Date(),
          type: "BOOK",
          amount: bookFee,
        });
      }
    });

    await revalidateFinancialRoutes({
      classId: data.classId,
      studentId: data.studentId,
      branchId: issuingBranchId,
    });
    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.classId}`);

    const voucherNumbers: number[] = [];
    if (createdVoucher?.number) voucherNumbers.push(createdVoucher.number);
    if (createdBookVoucher?.number) voucherNumbers.push(createdBookVoucher.number);

    return {
      success: true,
      error: false,
      message: `تم تسجيل الدفع بنجاح (وصول رقم: ${voucherNumbers.map((n) => `#${n}`).join(", ")}).`,
      data: serializeForClient({
        formationVoucher: createdVoucher,
        bookVoucher: createdBookVoucher,
      }),
    };
  } catch (err: any) {
    console.error("Error recording formation lump sum payment:", err);
    return { success: false, error: true, message: err?.message || "فشل في تسجيل دفع التكوين." };
  }
}

// =================================================================
// 9b. MANUAL LEVEL COMPLETION ACTIONS (§7.15)
// =================================================================

export async function finishFormationLevel(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "صلاحية غير كافية لإنهاء دورة المستوى / Permission refusée pour terminer le cycle.",
      };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return {
        success: false,
        error: true,
        message: "الفوج التكويني المحدد غير موجود / Groupe de formation introuvable.",
      };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return {
        success: false,
        error: true,
        message: "غير مصرح لك بإدارة هذا الفرع / Non autorisé pour cette branche.",
      };
    }

    const updated = await prisma.class.update({
      where: { id: classId },
      data: {
        isCompleted: true,
        completedAt: new Date(),
      },
      include: { FormationLevel: true, branch: true },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${classId}`);
    return {
      success: true,
      error: false,
      message: "تم إنهاء دورة المستوى بنجاح / Le cycle du niveau a été marqué comme terminé avec succès.",
      data: serializeForClient(updated),
    };
  } catch (err: any) {
    console.error("Error finishing formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "فشل في إنهاء دورة المستوى / Échec de finalisation du niveau.",
    };
  }
}

export async function reopenFormationLevel(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "صلاحية غير كافية / Permission refusée.",
      };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
    });

    if (!targetClass || !targetClass.isFormation) {
      return {
        success: false,
        error: true,
        message: "الفوج التكويني غير موجود / Groupe introuvable.",
      };
    }

    const updated = await prisma.class.update({
      where: { id: classId },
      data: {
        isCompleted: false,
        completedAt: null,
      },
      include: { FormationLevel: true, branch: true },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${classId}`);
    return {
      success: true,
      error: false,
      message: "تمت إعادة فتح دورة المستوى بنجاح / Le cycle du niveau a été réouvert avec succès.",
      data: serializeForClient(updated),
    };
  } catch (err: any) {
    console.error("Error reopening formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "فشل في إعادة فتح دورة المستوى.",
    };
  }
}

// =================================================================
// 9c. CASCADING LEVEL CLOSURE & PROGRESSION ACTIONS
// =================================================================

export type LevelClosureDecisionInput = {
  levelNumber: number;
  isClosed?: boolean;
  mode?: "ENROLL_EXISTING" | "CREATE_NEW_KEEP_OPEN" | "CLOSE_GROUP_AND_CREATE_NEW";
  targetClassId?: number;
  closedClassId?: number;
  newGroupName?: string;
  newGroupTeacherId?: string | null;
  newGroupBranchId?: number;
};

export async function getFormationClosurePreview(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permission refusée." };
    }

    const currentClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        FormationLevel: {
          include: {
            Language: true,
          },
        },
        enrollments: {
          where: {
            status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
          },
          include: {
            student: {
              select: { id: true, name: true, phone: true, globalNumber: true },
            },
          },
        },
        LevelTest: {
          orderBy: { testDate: "desc" },
        },
      },
    });

    if (!currentClass || !currentClass.isFormation || !currentClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe de formation introuvable." };
    }

    const currentLevel = currentClass.FormationLevel;
    const language = currentLevel.Language;

    // Find latest test per student in this class
    const latestTestByStudent = new Map<string, any>();
    for (const test of currentClass.LevelTest) {
      if (!latestTestByStudent.has(test.studentId)) {
        latestTestByStudent.set(test.studentId, test);
      }
    }

    const succeededStudents: Array<{ id: string; name: string; score: number | null }> = [];
    const otherStudents: Array<{ id: string; name: string; reason: string }> = [];

    for (const enr of currentClass.enrollments) {
      const test = latestTestByStudent.get(enr.studentId);
      if (test && test.passed) {
        succeededStudents.push({
          id: enr.student.id,
          name: enr.student.name,
          score: test.score ? Number(test.score) : null,
        });
      } else if (test && !test.passed) {
        otherStudents.push({
          id: enr.student.id,
          name: enr.student.name,
          reason: "Test non réussi",
        });
      } else {
        otherStudents.push({
          id: enr.student.id,
          name: enr.student.name,
          reason: "Aucun test passé",
        });
      }
    }

    // Find subsequent levels in this formation along with ALL their groups
    const [nextLevels, branches, teachers] = await Promise.all([
      prisma.formationLevel.findMany({
        where: {
          languageId: language.id,
          levelNumber: { gt: currentLevel.levelNumber },
        },
        include: {
          Class: {
            where: { isFormation: true },
            include: {
              branch: { select: { id: true, name: true } },
              teacher: { select: { id: true, name: true } },
              _count: {
                select: {
                  enrollments: {
                    where: {
                      status: "ACTIVE",
                      transfersFrom: { none: {} },
                    },
                  },
                },
              },
            },
            orderBy: { id: "asc" },
          },
          LevelTest: {
            orderBy: { testDate: "desc" },
          },
        },
        orderBy: { levelNumber: "asc" },
      }),
      prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.teacher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);

    const subsequentLevelsData = nextLevels.map((lvl) => {
      const computePassedForGroup = (grpId: number) => {
        const testsForGroup = lvl.LevelTest.filter((t) => t.classId === grpId);
        const map = new Map<string, boolean>();
        for (const t of testsForGroup) {
          if (!map.has(t.studentId)) {
            map.set(t.studentId, t.passed);
          }
        }
        let passedCount = 0;
        for (const passed of map.values()) {
          if (passed) passedCount++;
        }
        return passedCount;
      };

      const mappedGroups = lvl.Class.map((c) => ({
        id: c.id,
        name: c.name,
        isCompleted: c.isCompleted,
        isPaused: Boolean(c.isPaused),
        isInactive: isClassInactive(c),
        branchId: c.branchId,
        branchName: c.branch?.name || null,
        teacherId: c.teacherId || null,
        teacherName: c.teacher?.name || null,
        ageGroup: c.ageGroup || null,
        enrolledCount: c._count.enrollments,
        passedStudentsCount: computePassedForGroup(c.id),
      }));

      const activeGroups = mappedGroups.filter((g) => !g.isInactive);
      const activeClass = activeGroups[0] || mappedGroups[0] || null;
      const suggestedNewGroupName = `${language.name} - ${lvl.name} - Groupe ${mappedGroups.length + 1}`;

      return {
        levelId: lvl.id,
        levelNumber: lvl.levelNumber,
        levelName: lvl.name,
        lumpSumPrice: Number(lvl.lumpSumPrice || 0),
        totalGroupsCount: mappedGroups.length,
        activeGroups,
        allGroups: mappedGroups,
        activeClass,
        suggestedNewGroupName,
      };
    });

    return {
      success: true,
      error: false,
      message: "Aperçu de clôture récupéré avec succès.",
      data: serializeForClient({
        currentLevel: {
          id: currentLevel.id,
          levelNumber: currentLevel.levelNumber,
          name: currentLevel.name,
        },
        language: {
          id: language.id,
          name: language.name,
        },
        currentClass: {
          id: currentClass.id,
          name: currentClass.name,
          branchId: currentClass.branchId,
          branchName: currentClass.branch?.name || null,
          teacherId: currentClass.teacherId || null,
          teacherName: currentClass.teacher?.name || null,
          isCompleted: currentClass.isCompleted,
          totalEnrolled: currentClass.enrollments.length,
        },
        succeededStudents,
        otherStudents,
        subsequentLevels: subsequentLevelsData,
        branches,
        teachers,
      }),
    };
  } catch (err: any) {
    console.error("Error fetching closure preview:", err);
    return { success: false, error: true, message: err?.message || "Erreur lors du chargement de l'aperçu." };
  }
}

export async function closeFormationLevelsWithCascade(data: {
  startingClassId: number;
  closureDecisions: Array<LevelClosureDecisionInput>;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permission refusée / صلاحية غير كافية." };
    }

    const startingClass = await prisma.class.findUnique({
      where: { id: data.startingClassId },
      include: {
        FormationLevel: {
          include: { Language: true },
        },
      },
    });

    if (!startingClass || !startingClass.isFormation || !startingClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe de formation introuvable." };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, startingClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette succursale." };
    }

    const languageId = startingClass.FormationLevel.languageId;
    const languageName = startingClass.FormationLevel.Language.name;
    const startLevelNum = startingClass.FormationLevel.levelNumber;

    // Fetch all levels of this language with all their formation groups
    const allLevels = await prisma.formationLevel.findMany({
      where: { languageId },
      include: {
        Class: {
          where: { isFormation: true },
          include: {
            enrollments: {
              where: { status: { notIn: ["TRANSFERRED", "UNENROLLED"] } },
              select: { studentId: true },
            },
            LevelTest: { orderBy: { testDate: "desc" } },
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { levelNumber: "asc" },
    });

    const academicYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
    });
    const yearId = academicYear ? academicYear.id : 1;
    const defaultFormationFee = await getFormationInscriptionFeeAction();

    // Normalize decisions by levelNumber
    const decisionsMap = new Map<
      number,
      LevelClosureDecisionInput & {
        effectiveMode: "ENROLL_EXISTING" | "CREATE_NEW_KEEP_OPEN" | "CLOSE_GROUP_AND_CREATE_NEW";
      }
    >();
    for (const d of data.closureDecisions || []) {
      const effectiveMode =
        d.mode ||
        (d.isClosed === true ? "CLOSE_GROUP_AND_CREATE_NEW" : "ENROLL_EXISTING");
      decisionsMap.set(d.levelNumber, { ...d, effectiveMode });
    }

    // Determine which levels have a group being closed:
    // Starting group is always closed; subsequent levels only close a group when mode === "CLOSE_GROUP_AND_CREATE_NEW".
    const levelsToClose: number[] = [startLevelNum];
    for (let lNum = startLevelNum + 1; ; lNum++) {
      const dec = decisionsMap.get(lNum);
      if (dec?.effectiveMode === "CLOSE_GROUP_AND_CREATE_NEW") {
        levelsToClose.push(lNum);
      } else {
        break;
      }
    }

    const resultSummary: {
      closedLevels: number[];
      closedClassIds: number[];
      promotions: Array<{
        fromLevel: number;
        toLevel: number;
        targetClassId: number;
        targetClassName: string;
        studentCount: number;
        isFresh: boolean;
      }>;
    } = {
      closedLevels: [],
      closedClassIds: [],
      promotions: [],
    };

    const touchedClassIds = new Set<number>([startingClass.id]);

    await prisma.$transaction(async (tx) => {
      const sortedLevelsToClose = [...levelsToClose].sort((a, b) => b - a);
      const freshClassesCreated = new Map<number, any>();

      for (const lNum of sortedLevelsToClose) {
        const lvlDef = allLevels.find((l) => l.levelNumber === lNum);
        if (!lvlDef) continue;

        const ownDec = decisionsMap.get(lNum);
        const classToClose =
          lNum === startLevelNum
            ? startingClass
            : (ownDec?.closedClassId
                ? lvlDef.Class.find((c) => c.id === ownDec.closedClassId)
                : undefined) ||
              lvlDef.Class.find((c) => !isClassInactive(c)) ||
              lvlDef.Class[0];

        if (!classToClose) continue;

        // 1. Mark ONLY this specific group as completed
        await tx.class.update({
          where: { id: classToClose.id },
          data: {
            isCompleted: true,
            completedAt: new Date(),
          },
        });
        resultSummary.closedLevels.push(lNum);
        resultSummary.closedClassIds.push(classToClose.id);
        touchedClassIds.add(classToClose.id);

        // 2. Find active students who passed their test in this specific group
        const tests = await tx.levelTest.findMany({
          where: { classId: classToClose.id },
          orderBy: { testDate: "desc" },
        });

        const testStatusMap = new Map<string, boolean>();
        for (const t of tests) {
          if (!testStatusMap.has(t.studentId)) {
            testStatusMap.set(t.studentId, t.passed);
          }
        }

        const enrollments = await tx.enrollment.findMany({
          where: {
            classId: classToClose.id,
            status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
          },
        });

        const succeededStudentIds = enrollments
          .filter((enr) => testStatusMap.get(enr.studentId) === true)
          .map((enr) => enr.studentId);

        // 3. Promote succeeded students to the chosen/created group in the next level
        const nextLevelDef = allLevels.find((l) => l.levelNumber === lNum + 1);
        if (nextLevelDef && succeededStudentIds.length > 0) {
          const nextDec = decisionsMap.get(lNum + 1);
          const nextMode = nextDec?.effectiveMode || "ENROLL_EXISTING";

          let targetClass: any = null;
          let isFreshGroup = false;

          const buildFreshGroupInNextLevel = async () => {
            const currentCount = await tx.class.count({
              where: { isFormation: true, formationLevelId: nextLevelDef.id },
            });
            const fallbackName =
              currentCount === 0
                ? `${languageName} - ${nextLevelDef.name}`
                : `${languageName} - ${nextLevelDef.name} - Groupe ${currentCount + 1}`;
            const resolvedName = nextDec?.newGroupName?.trim() || fallbackName;
            const resolvedBranchId = nextDec?.newGroupBranchId
              ? Number(nextDec.newGroupBranchId)
              : classToClose.branchId;
            const resolvedTeacherId =
              nextDec?.newGroupTeacherId !== undefined
                ? nextDec.newGroupTeacherId?.trim() || null
                : classToClose.teacherId;

            return tx.class.create({
              data: {
                name: resolvedName,
                branchId: resolvedBranchId,
                teacherId: resolvedTeacherId,
                isFormation: true,
                formationLevelId: nextLevelDef.id,
                ageGroup: classToClose.ageGroup || "Adultes (15+ ans)",
                pricePerCycle: nextLevelDef.lumpSumPrice,
                hasBooks: classToClose.hasBooks,
                bookFee: classToClose.bookFee,
                inscriptionFee: classToClose.inscriptionFee,
                isCompleted: false,
              },
            });
          };

          if (nextMode === "CLOSE_GROUP_AND_CREATE_NEW") {
            isFreshGroup = true;
            if (freshClassesCreated.has(nextLevelDef.levelNumber)) {
              targetClass = freshClassesCreated.get(nextLevelDef.levelNumber);
            } else {
              targetClass = await buildFreshGroupInNextLevel();
              freshClassesCreated.set(nextLevelDef.levelNumber, targetClass);
            }
          } else if (nextMode === "CREATE_NEW_KEEP_OPEN") {
            isFreshGroup = true;
            targetClass = await buildFreshGroupInNextLevel();
          } else {
            // ENROLL_EXISTING: prefer explicit targetClassId if active
            if (nextDec?.targetClassId) {
              const explicitTarget = nextLevelDef.Class.find(
                (c) => c.id === nextDec.targetClassId && !isClassInactive(c)
              );
              if (explicitTarget) {
                targetClass = explicitTarget;
              }
            }
            if (!targetClass) {
              targetClass = nextLevelDef.Class.find((c) => !isClassInactive(c));
            }
            if (!targetClass) {
              isFreshGroup = true;
              targetClass = await buildFreshGroupInNextLevel();
            }
          }

          touchedClassIds.add(targetClass.id);

          let enrolledCount = 0;
          for (const sId of succeededStudentIds) {
            const existingEnr = await tx.enrollment.findFirst({
              where: {
                studentId: sId,
                classId: targetClass.id,
                academicYearId: yearId,
              },
            });

            if (!existingEnr) {
              const feeAmount =
                Number(targetClass.inscriptionFee || 0) > 0
                  ? targetClass.inscriptionFee
                  : new Prisma.Decimal(defaultFormationFee);

              await tx.enrollment.create({
                data: {
                  studentId: sId,
                  classId: targetClass.id,
                  academicYearId: yearId,
                  inscriptionFeeCharged: true,
                  inscriptionFeeAmount: feeAmount,
                },
              });
              enrolledCount++;
            } else if (existingEnr.status !== "ACTIVE") {
              await tx.enrollment.update({
                where: { id: existingEnr.id },
                data: { status: "ACTIVE" },
              });
              enrolledCount++;
            }
          }

          resultSummary.promotions.push({
            fromLevel: lNum,
            toLevel: lNum + 1,
            targetClassId: targetClass.id,
            targetClassName: targetClass.name,
            studentCount: enrolledCount,
            isFresh: isFreshGroup,
          });
        }
      }
    });

    revalidateFormationPaths({
      languageId,
      classIds: Array.from(touchedClassIds),
    });

    return {
      success: true,
      error: false,
      message: `Clôture du cycle effectuée avec succès (${resultSummary.closedClassIds.length} groupe(s) clôturé(s)) / تم إنهاء دورة الفوج بنجاح.`,
      data: serializeForClient(resultSummary),
    };
  } catch (err: any) {
    console.error("Error closing formation levels with cascade:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la clôture du cycle.",
    };
  }
}

export async function enrollGraduatedStudentsInNewFormation(data: {
  studentIds: string[];
  targetClassId: number;
  academicYearId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permission refusée." };
    }

    if (!data.studentIds || data.studentIds.length === 0) {
      return { success: false, error: true, message: "Aucun élève sélectionné." };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: data.targetClassId },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return { success: false, error: true, message: "Groupe cible invalide." };
    }

    let yearId = data.academicYearId;
    if (!yearId) {
      const year = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
      yearId = year ? year.id : 1;
    }

    let enrolledCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const sId of data.studentIds) {
        const existing = await tx.enrollment.findFirst({
          where: {
            studentId: sId,
            classId: data.targetClassId,
            academicYearId: yearId,
          },
        });

        if (!existing) {
          const defaultFormationFee = await getFormationInscriptionFeeAction();
          const feeAmount =
            Number(targetClass.inscriptionFee || 0) > 0
              ? targetClass.inscriptionFee
              : new Prisma.Decimal(defaultFormationFee);

          await tx.enrollment.create({
            data: {
              studentId: sId,
              classId: data.targetClassId,
              academicYearId: yearId,
              inscriptionFeeCharged: true,
              inscriptionFeeAmount: feeAmount,
            },
          });
          enrolledCount++;
        }
      }
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.targetClassId}`);

    return {
      success: true,
      error: false,
      message: `${enrolledCount} élève(s) inscrit(s) dans la nouvelle formation avec succès.`,
    };
  } catch (err: any) {
    console.error("Error enrolling graduated students:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de l'inscription.",
    };
  }
}

// =================================================================
// 10. FORMATION ATTENDANCE & SESSION ACTIONS
// =================================================================

export async function saveFormationAttendance(
  lessonId: number,
  attendanceRecords: Record<string, "PRESENT" | "ABSENT">
): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { class: true },
    });

    if (!lesson) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, lesson.branchId)) {
      return { success: false, error: true, message: "Non autorisé à enregistrer la présence dans cette succursale / غير مصرح لك بتسجيل الحضور في هذا الفرع" };
    }

    const studentIds = Object.keys(attendanceRecords);
    if (studentIds.length === 0) {
      return { success: false, error: true, message: "Aucune donnée de présence envoyée / لم يتم إرسال بيانات حضور" };
    }

    await prisma.$transaction(async (tx) => {
      for (const [studentId, status] of Object.entries(attendanceRecords)) {
        const existing = await tx.attendance.findFirst({
          where: { lessonId, studentId },
        });

        if (existing) {
          await tx.attendance.update({
            where: { id: existing.id },
            data: { status },
          });
        } else {
          await tx.attendance.create({
            data: {
              lessonId,
              studentId,
              status,
            },
          });
        }
      }
    });

    safeRevalidatePath(`/list/formations/${lesson.classId}`);
    return { success: true, error: false, message: "Présence enregistrée avec succès / تم حفظ الحضور بنجاح" };
  } catch (err: any) {
    console.error("Error saving formation attendance:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'enregistrement de présence / فشل في حفظ الحضور" };
  }
}

export async function addFormationSession(data: {
  classId: number;
  day?: string;
  startTime?: string;
  endTime?: string;
  startsAt?: string | Date;
  endsAt?: string | Date;
  teacherId?: string;
  classroomId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
    });

    if (!targetClass) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (isClassInactive(targetClass)) {
      return {
        success: false,
        error: true,
        message: `Impossible de programmer une séance pour le groupe fermé / en pause "${targetClass.name}" / لا يمكن برمجة حصة للفوج المغلق / المتوقف "${targetClass.name}"`,
      };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé à programmer une séance dans cette succursale / غير مصرح لك ببرمجة حصة في هذا الفرع" };
    }

    const teacherId = data.teacherId || targetClass.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Veuillez assigner un enseignant / يرجى تعيين أستاذ للحصة" };
    }

    // If classroomId not provided, look for one in that branch or default
    let classroomId = data.classroomId;
    if (!classroomId) {
      const defaultRoom = await prisma.classroom.findFirst({
        where: { branchId: targetClass.branchId },
      });
      if (defaultRoom) {
        classroomId = defaultRoom.id;
      }
    }

    if (!classroomId) {
      return { success: false, error: true, message: "Veuillez spécifier la salle / يرجى تحديد القاعة لهذه الحصة" };
    }

    let startsAt: Date;
    let endsAt: Date;

    if (data.day && data.startTime && data.endTime) {
      startsAt = getLessonDateTime(data.day, data.startTime);
      endsAt = getLessonDateTime(data.day, data.endTime);
    } else if (data.startsAt && data.endsAt) {
      startsAt = new Date(data.startsAt);
      endsAt = new Date(data.endsAt);
    } else {
      return { success: false, error: true, message: "Horaires ou jour invalides / يرجى تحديد التوقيت واليوم." };
    }

    // School timetable conflict check
    const dayName = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Africa/Algiers",
    }).format(startsAt).toUpperCase();

    const startTimeStr = startsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
    const endTimeStr = endsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });

    const conflict = await checkForConflicts({
      classId: data.classId,
      teacherId,
      classroomId,
      day: dayName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      startsAt,
      endsAt,
    });

    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const lesson = await prisma.lesson.create({
      data: {
        classId: data.classId,
        branchId: targetClass.branchId,
        teacherId: teacherId,
        classroomId: classroomId,
        startsAt,
        endsAt,
      },
    });

    // Automatically create school-wide Arabic announcement expiring when lesson ends
    try {
      const branchRecord = await prisma.branch.findUnique({ where: { id: targetClass.branchId } });
      const classroomRecord = await prisma.classroom.findUnique({ where: { id: classroomId } });
      const dayNameAr = startsAt.toLocaleDateString("ar-DZ", {
        weekday: "long",
      });

      const desc = `حصة تكوينية أسبوعية جديدة لفوج ${targetClass.name} في ${branchRecord?.name || ""} ${classroomRecord ? `- قاعة ${classroomRecord.name}` : ""} كل يوم ${dayNameAr} من ${startTimeStr} إلى ${endTimeStr}`;

      await prisma.announcement.create({
        data: {
          title: "حصة تكوينية أسبوعية جديدة",
          description: desc,
          classId: data.classId,
          branchId: null, // school-wide
          lessonId: lesson.id,
          createdBy: session.userId || "admin",
          pinned: true,
          expiresAt: endsAt,
        },
      });
      safeRevalidatePath("/list/announcements");
    } catch (annErr) {
      console.warn("Could not create automatic formation session announcement:", annErr);
    }

    safeRevalidatePath("/list/lessons");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    return { success: true, error: false, message: "Séance ajoutée avec succès / تمت إضافة الحصة بنجاح", data: serializeForClient(lesson) };
  } catch (err: any) {
    console.error("Error adding formation session:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'ajout de la séance / فشل في إضافة الحصة" };
  }
}

export async function updateFormationSession(data: {
  sessionId: number;
  classId: number;
  day: string;
  startTime: string;
  endTime: string;
  teacherId?: string;
  classroomId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
    });
    if (!targetClass) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (isClassInactive(targetClass)) {
      return {
        success: false,
        error: true,
        message: `Impossible de modifier une séance pour le groupe fermé / en pause "${targetClass.name}" / لا يمكن تعديل حصة للفوج المغلق / المتوقف "${targetClass.name}"`,
      };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé dans cette succursale / غير مصرح لك في هذا الفرع" };
    }

    const existingLesson = await prisma.lesson.findUnique({
      where: { id: data.sessionId },
      include: { class: true },
    });
    if (!existingLesson) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة" };
    }

    const teacherId = data.teacherId || targetClass.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Veuillez assigner un enseignant / يرجى تعيين أستاذ للحصة" };
    }

    const classroomId = data.classroomId || existingLesson.classroomId;
    if (!classroomId) {
      return { success: false, error: true, message: "Veuillez spécifier la salle / يرجى تحديد القاعة" };
    }

    if (data.startTime >= data.endTime) {
      return { success: false, error: true, message: "L'heure de fin doit être postérieure à l'heure de début / وقت النهاية يجب أن يكون بعد وقت البداية" };
    }

    const now = new Date();
    const seriesData = await findSeriesLessonsWithUsage(data.sessionId, now);
    const nextOcc = getNextUpcomingOccurrence({
      day: data.day,
      startTime: data.startTime,
      endTime: data.endTime,
      now,
      skipDates: seriesData.frozenDates,
    });
    const startsAt = nextOcc.startsAt;
    const endsAt = nextOcc.endsAt;

    if (startsAt >= endsAt) {
      return { success: false, error: true, message: "L'heure de fin doit être postérieure à l'heure de début / وقت النهاية يجب أن يكون بعد وقت البداية" };
    }

    const dayName = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Africa/Algiers",
    }).format(startsAt).toUpperCase();

    const startTimeStr = startsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });
    const endTimeStr = endsAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Algiers" });

    const conflict = await checkForConflicts({
      classId: data.classId,
      teacherId,
      classroomId,
      day: dayName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      excludeId: data.sessionId,
      excludeIds: seriesData.allSeriesIds,
      startsAt,
      endsAt,
    });

    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const classroomRecordForBranch = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { branchId: true, name: true },
    });
    const effectiveBranchId =
      classroomRecordForBranch?.branchId || existingLesson.branchId || targetClass.branchId;

    const updateResult = await applyNormalLessonFutureUpdate({
      lessonId: data.sessionId,
      classId: data.classId,
      teacherId,
      classroomId,
      branchId: effectiveBranchId,
      allAssociatedClassIds: [data.classId],
      newStartsAt: startsAt,
      newEndsAt: endsAt,
      isExtra: false,
      isCatchUp: false,
      isFree: false,
      frozenRows: seriesData.frozenRows,
      mutableFutureRows: seriesData.mutableFutureRows,
      now,
    });
    const updated = updateResult.lesson;

    try {
      const branchRecord = await prisma.branch.findUnique({ where: { id: effectiveBranchId } });
      const dayNameAr = startsAt.toLocaleDateString("ar-DZ", {
        weekday: "long",
        timeZone: "Africa/Algiers",
      });

      const desc = `حصة تكوينية أسبوعية لفوج ${targetClass.name} في ${branchRecord?.name || ""} ${classroomRecordForBranch ? `- قاعة ${classroomRecordForBranch.name}` : ""} كل يوم ${dayNameAr} من ${startTimeStr} إلى ${endTimeStr}`;

      const existingAnn = await prisma.announcement.findFirst({
        where: { lessonId: updated.id },
      });
      if (existingAnn) {
        await prisma.announcement.update({
          where: { id: existingAnn.id },
          data: {
            title: "حصة تكوينية أسبوعية",
            description: desc,
            expiresAt: endsAt,
          },
        });
      } else {
        await prisma.announcement.create({
          data: {
            title: "حصة تكوينية أسبوعية",
            description: desc,
            classId: data.classId,
            branchId: null,
            authorBranchId: effectiveBranchId,
            lessonId: updated.id,
            createdBy: session.userId || "admin",
            pinned: true,
            expiresAt: endsAt,
          },
        });
      }
      safeRevalidatePath("/list/announcements");
    } catch (annErr) {
      console.warn("Could not sync announcement on formation session update:", annErr);
    }

    safeRevalidatePath("/list/lessons");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/attendance/class/${data.classId}`);

    return {
      success: true,
      error: false,
      message: "Séance mise à jour pour les prochaines dates (historique conservé) / تم تحديث الحصة للمواعيد القادمة فقط مع الحفاظ على التواريخ السابقة",
      data: serializeForClient(updated),
    };
  } catch (err: any) {
    console.error("Error updating formation session:", err);
    return { success: false, error: true, message: err?.message || "Échec de la mise à jour de la séance / فشل في تحديث الحصة" };
  }
}

export async function deleteFormationSession(data: {
  sessionId: number;
  classId: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const existing = await prisma.lesson.findUnique({
      where: { id: data.sessionId },
      select: { branchId: true, classId: true },
    });
    if (!existing) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, existing.branchId)) {
      return { success: false, error: true, message: "Non autorisé dans cette succursale / غير مصرح لك في هذا الفرع" };
    }

    const res = await retireOrDeleteNormalLesson(data.sessionId, new Date());

    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/list/lessons");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/attendance/class/${data.classId}`);

    return {
      success: true,
      error: false,
      message:
        res.mode === "already_retired"
          ? "Les séances futures sont déjà supprimées ; les anciennes séances et leurs enregistrements restent conservés / الحصص القادمة محذوفة بالفعل؛ الحصص السابقة وسجلاتها محفوظة"
          : res.mode === "retired"
          ? "Séances futures supprimées ; les anciennes séances et leurs enregistrements ont été conservés / تم حذف الحصص القادمة فقط مع الحفاظ على الحصص السابقة وسجلاتها"
          : "Séance supprimée avec succès / تم حذف الحصة بنجاح",
    };
  } catch (err: any) {
    console.error("Error deleting formation session:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la suppression de la séance / فشل في حذف الحصة",
    };
  }
}

export async function executeSafeDeleteFormationGroup(
  tx: any,
  classId: number,
  opts?: { requireRemainingSiblingGroup?: boolean }
): Promise<{ deletedName: string; languageId: number | null; formationLevelId: number | null }> {
  const targetClass = await tx.class.findUnique({
    where: { id: classId },
    include: {
      FormationLevel: true,
      enrollments: {
        where: { status: { notIn: ["TRANSFERRED", "UNENROLLED"] } },
        select: { id: true },
      },
      vouchers: {
        where: { isVoided: false },
        select: { id: true },
      },
    },
  });

  if (!targetClass || !targetClass.isFormation) {
    throw new Error("Groupe de formation introuvable / الفوج التكويني غير موجود");
  }

  if (opts?.requireRemainingSiblingGroup && targetClass.formationLevelId) {
    const siblingCount = await tx.class.count({
      where: {
        isFormation: true,
        formationLevelId: targetClass.formationLevelId,
      },
    });
    if (siblingCount <= 1) {
      throw new Error(
        `Impossible de supprimer le seul groupe du niveau "${targetClass.FormationLevel?.name || ""}". Modifiez-le ou supprimez le niveau entier / لا يمكن حذف الفوج الوحيد في هذا المستوى. يمكنك تعديله أو حذف المستوى بالكامل`
      );
    }
  }

  if (targetClass.enrollments.length > 0) {
    throw new Error(
      `Impossible de supprimer le groupe "${targetClass.name}" car il contient des élèves inscrits (${targetClass.enrollments.length} élève(s)) / لا يمكن حذف الفوج (${targetClass.name}) لاحتوائه على تلاميذ مسجلين (${targetClass.enrollments.length})`
    );
  }

  if (targetClass.vouchers.length > 0) {
    throw new Error(
      `Impossible de supprimer le groupe "${targetClass.name}" car des reçus actifs y sont associés / لا يمكن حذف هذا الفوج لوجود وصولات دفع نشطة مسجلة عليه`
    );
  }

  const lessons = await tx.lesson.findMany({
    where: { classId },
    select: { id: true },
  });
  const lessonIds = lessons.map((l: any) => l.id);

  if (lessonIds.length > 0) {
    await tx.catchUpAttendance.deleteMany({
      where: {
        OR: [
          { missedLessonId: { in: lessonIds } },
          { catchUpLessonId: { in: lessonIds } },
        ],
      },
    });
    await tx.attendance.deleteMany({
      where: { lessonId: { in: lessonIds } },
    });
    await tx.lessonGroup.deleteMany({
      where: { lessonId: { in: lessonIds } },
    });
    await tx.lesson.deleteMany({
      where: { id: { in: lessonIds } },
    });
  }

  await tx.lessonGroup.deleteMany({ where: { classId } });
  await tx.levelTest.deleteMany({ where: { classId } });
  await tx.photocopyCharge.deleteMany({ where: { classId } });
  await tx.voucher.updateMany({
    where: { classId },
    data: { classId: null },
  });

  const residualEnrollments = await tx.enrollment.findMany({
    where: { classId },
    select: { id: true },
  });
  const residualIds = residualEnrollments.map((e: any) => e.id);
  if (residualIds.length > 0) {
    await tx.enrollmentTransfer.deleteMany({
      where: {
        OR: [
          { fromEnrollmentId: { in: residualIds } },
          { toEnrollmentId: { in: residualIds } },
        ],
      },
    });
    await tx.enrollment.deleteMany({ where: { id: { in: residualIds } } });
  }

  await tx.announcement.deleteMany({ where: { classId } });
  await tx.class.delete({ where: { id: classId } });

  return {
    deletedName: targetClass.name,
    languageId: targetClass.FormationLevel?.languageId ?? null,
    formationLevelId: targetClass.formationLevelId,
  };
}

export async function deleteFormationGroup(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour supprimer le groupe / صلاحية غير كافية لحذف الفوج" };
    }

    const existing = await prisma.class.findUnique({
      where: { id: classId },
      select: { branchId: true },
    });
    if (!existing) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, existing.branchId)) {
      return { success: false, error: true, message: "Non autorisé dans cette succursale / غير مصرح لك في هذا الفرع" };
    }

    const res = await prisma.$transaction(async (tx) => {
      return await executeSafeDeleteFormationGroup(tx, classId, {
        requireRemainingSiblingGroup: true,
      });
    });

    revalidateFormationPaths({
      languageId: res.languageId,
      classIds: [classId],
    });
    return {
      success: true,
      error: false,
      message: `Groupe "${res.deletedName}" supprimé avec succès / تم حذف الفوج بنجاح`,
    };
  } catch (err: any) {
    console.error("Error deleting formation group:", err);
    return { success: false, error: true, message: err?.message || "Échec de la suppression du groupe / فشل في حذف الفوج" };
  }
}

export async function updateFormationGroup(data: {
  id: number;
  name: string;
  branchId?: number;
  teacherId?: string | null;
  ageGroup?: string;
  hasBooks?: boolean;
  bookFee?: number | null;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && !session.isBranchAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour modifier le groupe / صلاحية غير كافية لتعديل الفوج" };
    }

    const existing = await prisma.class.findUnique({
      where: { id: data.id },
      include: { FormationLevel: true },
    });
    if (!existing || !existing.isFormation) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    const targetBranchId = data.branchId ? Number(data.branchId) : existing.branchId;
    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetBranchId)) {
      return { success: false, error: true, message: "Non autorisé dans cette succursale / غير مصرح لك في هذا الفرع" };
    }

    const trimmedName = data.name.trim();
    if (!trimmedName) {
      return { success: false, error: true, message: "Le nom du groupe est obligatoire / اسم الفوج مطلوب" };
    }

    const updatePayload: any = {
      name: trimmedName,
      branchId: targetBranchId,
      teacherId: data.teacherId?.trim() ? data.teacherId.trim() : null,
      ageGroup: data.ageGroup !== undefined ? (data.ageGroup.trim() || null) : existing.ageGroup,
    };

    if (data.hasBooks !== undefined) {
      updatePayload.hasBooks = !!data.hasBooks;
      updatePayload.bookFee =
        data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null;
    }

    const updated = await prisma.class.update({
      where: { id: data.id },
      data: updatePayload,
      include: {
        branch: true,
        teacher: true,
        FormationLevel: { include: { Language: true } },
      },
    });

    revalidateFormationPaths({
      languageId: updated.FormationLevel?.languageId ?? null,
      classIds: [data.id],
    });
    return { success: true, error: false, message: "Groupe mis à jour avec succès / تم تحديث بيانات الفوج بنجاح", data: serializeForClient(updated) };
  } catch (err: any) {
    console.error("Error updating formation group:", err);
    return { success: false, error: true, message: err?.message || "فشل في تحديث بيانات الفوج." };
  }
}

export async function updateFormationWithLevels(data: {
  id: number;
  languageId?: number;
  name: string;
  branchId?: number;
  teacherId?: string | null;
  ageGroup?: string;
  hasBooks?: boolean;
  bookFee?: number | null;
  levels?: Array<{
    id?: number;
    name: string;
    lumpSumPrice: number;
    teacherId?: string | null;
    isDeleted?: boolean;
    groups?: Array<{
      id?: number;
      name: string;
      teacherId?: string | null;
      branchId?: number;
      ageGroup?: string;
      isDeleted?: boolean;
    }>;
  }>;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour modifier le groupe / صلاحية غير كافية لتعديل الفوج" };
    }

    let languageId: number | null = data.languageId ? Number(data.languageId) : null;
    let targetClass: any = null;

    if (languageId) {
      const langCheck = await prisma.language.findUnique({ where: { id: languageId } });
      if (!langCheck) {
        languageId = null;
      } else {
        targetClass = await prisma.class.findFirst({
          where: { isFormation: true, FormationLevel: { languageId } },
          include: { FormationLevel: true },
          orderBy: { id: "asc" },
        });
      }
    }

    if (!languageId) {
      targetClass = await prisma.class.findUnique({
        where: { id: data.id },
        include: { FormationLevel: true },
      });

      if (targetClass?.isFormation && targetClass.FormationLevel) {
        languageId = targetClass.FormationLevel.languageId;
      } else {
        const langById = await prisma.language.findUnique({ where: { id: data.id } });
        if (langById) {
          languageId = langById.id;
          targetClass = await prisma.class.findFirst({
            where: { isFormation: true, FormationLevel: { languageId } },
            include: { FormationLevel: true },
            orderBy: { id: "asc" },
          });
        }
      }
    }

    if (!languageId) {
      return { success: false, error: true, message: "Formation introuvable / التكوين غير موجود." };
    }

    const defaultFormationFee = await getFormationInscriptionFeeAction();
    const resolvedDefaultBranchId =
      data.branchId ? Number(data.branchId) : targetClass?.branchId || 1;
    const resolvedDefaultAgeGroup =
      data.ageGroup?.trim() || targetClass?.ageGroup || "Adultes (15+ ans)";
    const resolvedInscriptionFee =
      targetClass?.inscriptionFee && Number(targetClass.inscriptionFee) > 0
        ? targetClass.inscriptionFee
        : new Prisma.Decimal(defaultFormationFee);

    const touchedClassIds = new Set<number>();
    if (targetClass?.id) touchedClassIds.add(targetClass.id);

    await prisma.$transaction(
      async (tx) => {
        const resolvedLanguageId = languageId!;
        const trimmedFormationName = data.name?.trim() || "";

        // 1. Update Language name if provided
        if (trimmedFormationName) {
          await tx.language.update({
            where: { id: resolvedLanguageId },
            data: { name: trimmedFormationName },
          });
        }

        const currentLanguage = await tx.language.findUnique({
          where: { id: resolvedLanguageId },
        });
        const effectiveLangName = currentLanguage?.name || trimmedFormationName || "Formation";

        // 2. Sync shared book fee configuration across all groups of this formation
        // (preserving each group's own branchId, teacherId, ageGroup, and custom group name)
        const sharedBookFee =
          data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null;

        await tx.class.updateMany({
          where: {
            isFormation: true,
            FormationLevel: { languageId: resolvedLanguageId },
          },
          data: {
            hasBooks: !!data.hasBooks,
            bookFee: sharedBookFee,
          },
        });

        // 3. Process levels & per-level groups
        if (data.levels && data.levels.length > 0) {
          const existingLevels = await tx.formationLevel.findMany({
            where: { languageId: resolvedLanguageId },
            include: {
              Class: {
                where: { isFormation: true },
                orderBy: { id: "asc" },
              },
              LevelTest: { select: { id: true } },
            },
            orderBy: { levelNumber: "asc" },
          });

          const remainingActive = data.levels.filter((l) => !l.isDeleted);
          if (remainingActive.length === 0) {
            throw new Error(
              "Impossible de supprimer tous les niveaux. Une formation doit comporter au moins un niveau / لا يمكن حذف جميع المستويات. يجب أن يحتوي التكوين على مستوى واحد على الأقل"
            );
          }

          // 3a. Delete levels marked for deletion
          for (const lvl of data.levels) {
            if (lvl.id && lvl.isDeleted) {
              await executeSafeDeleteFormationLevel(tx, lvl.id);
            }
          }

          // 3b. Update existing non-deleted levels and their groups
          for (const lvl of data.levels) {
            if (lvl.id && !lvl.isDeleted) {
              const existingLvl = existingLevels.find((el) => el.id === lvl.id);
              const trimmedLvlName = lvl.name.trim();
              const newPriceDecimal = new Prisma.Decimal(lvl.lumpSumPrice || 0);
              const nameChanged = existingLvl && existingLvl.name !== trimmedLvlName;
              const priceChanged =
                existingLvl &&
                Number(existingLvl.lumpSumPrice) !== Number(lvl.lumpSumPrice || 0);

              if (nameChanged || priceChanged) {
                await tx.formationLevel.update({
                  where: { id: lvl.id },
                  data: {
                    name: trimmedLvlName,
                    lumpSumPrice: newPriceDecimal,
                  },
                });
              }

              // Always keep all groups in this level synced to the level's shared lumpSumPrice
              if (priceChanged) {
                await tx.class.updateMany({
                  where: { isFormation: true, formationLevelId: lvl.id },
                  data: { pricePerCycle: newPriceDecimal },
                });
              }

              if (lvl.groups && lvl.groups.length > 0) {
                const activeGroupInputs = lvl.groups.filter((g) => !g.isDeleted);
                if (activeGroupInputs.length === 0) {
                  throw new Error(
                    `Le niveau "${trimmedLvlName}" doit conserver au moins un groupe / يجب أن يحتوي المستوى (${trimmedLvlName}) على فوج واحد على الأقل`
                  );
                }

                // Delete groups marked as deleted
                for (const grp of lvl.groups) {
                  if (grp.id && grp.isDeleted) {
                    touchedClassIds.add(grp.id);
                    await executeSafeDeleteFormationGroup(tx, grp.id, {
                      requireRemainingSiblingGroup: false,
                    });
                  }
                }

                // Update or create remaining groups
                for (let gIdx = 0; gIdx < activeGroupInputs.length; gIdx++) {
                  const grp = activeGroupInputs[gIdx];
                  const fallbackName =
                    activeGroupInputs.length === 1
                      ? `${effectiveLangName} - ${trimmedLvlName}`
                      : `${effectiveLangName} - ${trimmedLvlName} - Groupe ${gIdx + 1}`;
                  const resolvedGrpName = grp.name?.trim() || fallbackName;
                  const resolvedGrpBranchId = grp.branchId
                    ? Number(grp.branchId)
                    : resolvedDefaultBranchId;
                  const resolvedGrpTeacherId = grp.teacherId?.trim()
                    ? grp.teacherId.trim()
                    : null;
                  const resolvedGrpAgeGroup =
                    grp.ageGroup?.trim() || resolvedDefaultAgeGroup;

                  if (grp.id) {
                    await tx.class.update({
                      where: { id: grp.id },
                      data: {
                        name: resolvedGrpName,
                        branchId: resolvedGrpBranchId,
                        teacherId: resolvedGrpTeacherId,
                        ageGroup: resolvedGrpAgeGroup,
                        pricePerCycle: newPriceDecimal,
                        hasBooks: !!data.hasBooks,
                        bookFee: sharedBookFee,
                      },
                    });
                    touchedClassIds.add(grp.id);
                  } else {
                    const createdGrp = await tx.class.create({
                      data: {
                        name: resolvedGrpName,
                        branchId: resolvedGrpBranchId,
                        teacherId: resolvedGrpTeacherId,
                        isFormation: true,
                        formationLevelId: lvl.id,
                        ageGroup: resolvedGrpAgeGroup,
                        pricePerCycle: newPriceDecimal,
                        hasBooks: !!data.hasBooks,
                        bookFee: sharedBookFee,
                        inscriptionFee: resolvedInscriptionFee,
                      },
                    });
                    touchedClassIds.add(createdGrp.id);
                  }
                }
              } else if (existingLvl?.Class[0] && lvl.teacherId !== undefined) {
                // Legacy fallback when caller does not pass lvl.groups
                const firstCls = existingLvl.Class[0];
                await tx.class.update({
                  where: { id: firstCls.id },
                  data: {
                    teacherId: lvl.teacherId?.trim() ? lvl.teacherId.trim() : null,
                  },
                });
                touchedClassIds.add(firstCls.id);
              }
            }
          }

          // 3c. Create new levels and all their configured groups
          let highestLevelNum = existingLevels.reduce(
            (max, el) => Math.max(max, el.levelNumber),
            0
          );

          for (const lvl of data.levels) {
            if (!lvl.id && !lvl.isDeleted && lvl.name.trim()) {
              highestLevelNum += 1;
              const trimmedLvlName = lvl.name.trim();
              const newLvl = await tx.formationLevel.create({
                data: {
                  languageId: resolvedLanguageId,
                  levelNumber: highestLevelNum,
                  name: trimmedLvlName,
                  lumpSumPrice: new Prisma.Decimal(lvl.lumpSumPrice || 0),
                },
              });

              const groupInputs =
                lvl.groups && lvl.groups.filter((g) => !g.isDeleted).length > 0
                  ? lvl.groups.filter((g) => !g.isDeleted)
                  : [
                      {
                        name: "",
                        teacherId: lvl.teacherId,
                        branchId: resolvedDefaultBranchId,
                        ageGroup: resolvedDefaultAgeGroup,
                      },
                    ];

              for (let gIdx = 0; gIdx < groupInputs.length; gIdx++) {
                const grp = groupInputs[gIdx];
                const fallbackName =
                  groupInputs.length === 1
                    ? `${effectiveLangName} - ${newLvl.name}`
                    : `${effectiveLangName} - ${newLvl.name} - Groupe ${gIdx + 1}`;
                const createdGrp = await tx.class.create({
                  data: {
                    name: grp.name?.trim() || fallbackName,
                    branchId: grp.branchId ? Number(grp.branchId) : resolvedDefaultBranchId,
                    teacherId: grp.teacherId?.trim() ? grp.teacherId.trim() : null,
                    isFormation: true,
                    formationLevelId: newLvl.id,
                    ageGroup: grp.ageGroup?.trim() || resolvedDefaultAgeGroup,
                    pricePerCycle: newLvl.lumpSumPrice,
                    hasBooks: !!data.hasBooks,
                    bookFee: sharedBookFee,
                    inscriptionFee: resolvedInscriptionFee,
                  },
                });
                touchedClassIds.add(createdGrp.id);
              }
            }
          }
        }
      },
      { timeout: 30000, maxWait: 10000 }
    );

    revalidateFormationPaths({
      languageId,
      classIds: [data.id, ...Array.from(touchedClassIds)],
    });

    return {
      success: true,
      error: false,
      message: "Formation, niveaux et groupes mis à jour avec succès / تم تحديث بيانات التكوين والمستويات والأفواج بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating formation with levels:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la mise à jour de la formation et des niveaux.",
    };
  }
}

// =================================================================
// 11. SAME-LEVEL FORMATION GROUP TRANSFER (PRESERVES VOUCHERS & TESTS)
// =================================================================

export async function executeFormationGroupTransferTx(
  tx: any,
  params: {
    fromEnrollmentId: number;
    toClassId: number;
    studentId: string;
    notes?: string | null;
    performedBy: string;
  }
): Promise<{
  fromClass: any;
  toClass: any;
  toEnrollment: any;
  movedVoucherIds: number[];
  netMovedFormationAmount: number;
}> {
  const fromEnrollment = await tx.enrollment.findUnique({
    where: { id: params.fromEnrollmentId },
    include: {
      class: {
        include: {
          FormationLevel: true,
          branch: true,
        },
      },
    },
  });

  if (!fromEnrollment || fromEnrollment.studentId !== params.studentId) {
    throw new Error("Inscription d'origine introuvable / التسجيل الأصلي غير موجود");
  }

  const fromClass = fromEnrollment.class;
  const toClass = await tx.class.findUnique({
    where: { id: params.toClassId },
    include: {
      FormationLevel: true,
      branch: true,
    },
  });

  if (!toClass || !fromClass.isFormation || !toClass.isFormation) {
    throw new Error("Groupe cible invalide / الفوج المستهدف غير صالح");
  }

  if (fromClass.id === toClass.id) {
    throw new Error("Le groupe cible doit être différent du groupe actuel / الفوج المستهدف يجب أن يكون مختلفاً عن الفوج الحالي");
  }

  if (
    !fromClass.formationLevelId ||
    fromClass.formationLevelId !== toClass.formationLevelId
  ) {
    throw new Error(
      "Le transfert n'est autorisé qu'entre des groupes du même niveau de formation / لا يمكن نقل التلميذ إلا بين أفواج من نفس المستوى التكويني"
    );
  }

  if (isClassInactive(toClass)) {
    throw new Error(
      `Impossible de transférer l'élève vers le groupe fermé / en pause "${toClass.name}" / لا يمكن نقل التلميذ إلى الفوج المغلق / المتوقف "${toClass.name}"`
    );
  }

  // 1. Find or create target enrollment preserving payer status & discount metadata
  let toEnrollment = await tx.enrollment.findFirst({
    where: {
      studentId: params.studentId,
      classId: toClass.id,
      academicYearId: fromEnrollment.academicYearId,
    },
  });

  if (!toEnrollment) {
    toEnrollment = await tx.enrollment.create({
      data: {
        studentId: params.studentId,
        classId: toClass.id,
        academicYearId: fromEnrollment.academicYearId,
        inscriptionFeeCharged: fromEnrollment.inscriptionFeeCharged,
        inscriptionFeeAmount: fromEnrollment.inscriptionFeeAmount,
        payerStatus: fromEnrollment.payerStatus || "NORMAL",
        discountType: fromEnrollment.discountType,
        discountValue: fromEnrollment.discountValue,
        discountReason: fromEnrollment.discountReason,
        discountUpdatedBy: fromEnrollment.discountUpdatedBy,
        discountUpdatedAt: fromEnrollment.discountUpdatedAt,
        feeOverriddenByOwner: fromEnrollment.feeOverriddenByOwner,
        feeOverrideNote: fromEnrollment.feeOverrideNote,
        status: "ACTIVE",
      },
    });
    await tx.enrollmentPayerHistory.create({
      data: {
        enrollmentId: toEnrollment.id,
        payerStatus: fromEnrollment.payerStatus || "NORMAL",
        discountType: fromEnrollment.discountType,
        discountValue: fromEnrollment.discountValue,
        reason: `Transfert depuis ${fromClass.name}`,
        changedBy: params.performedBy,
        effectiveFrom: new Date(),
      },
    });
  } else {
    toEnrollment = await tx.enrollment.update({
      where: { id: toEnrollment.id },
      data: {
        status: "ACTIVE",
        payerStatus: fromEnrollment.payerStatus || toEnrollment.payerStatus || "NORMAL",
        discountType: fromEnrollment.discountType ?? toEnrollment.discountType,
        discountValue: fromEnrollment.discountValue ?? toEnrollment.discountValue,
        discountReason: fromEnrollment.discountReason ?? toEnrollment.discountReason,
        inscriptionFeeCharged: fromEnrollment.inscriptionFeeCharged,
        inscriptionFeeAmount: fromEnrollment.inscriptionFeeAmount ?? toEnrollment.inscriptionFeeAmount,
      },
    });
  }

  // 2. Mark source enrollment as TRANSFERRED (preserving historical session attendances in fromClass)
  await tx.enrollment.update({
    where: { id: fromEnrollment.id },
    data: { status: "TRANSFERRED" },
  });

  // 3. Move active non-voided formation/book/inscription vouchers from fromClass to toClass
  // Note: issuingBranchId and issuedAt remain untouched so historical DailyLedger entries never mutate!
  const vouchersToMove = await tx.voucher.findMany({
    where: {
      studentId: params.studentId,
      classId: fromClass.id,
      isVoided: false,
      isRefund: false,
      paymentType: { in: ["FORMATION", "BOOK", "INSCRIPTION", "TUITION_4SESSION"] },
    },
    include: { refunds: true },
    orderBy: { issuedAt: "asc" },
  });

  const movedVoucherIds: number[] = [];
  let netMovedFormationAmount = 0;
  const auditReason =
    params.notes?.trim() ||
    `Transfert de groupe même niveau (${fromClass.name} -> ${toClass.name})`;

  for (const v of vouchersToMove) {
    movedVoucherIds.push(v.id);
    if (v.paymentType === "FORMATION" || v.paymentType === "TUITION_4SESSION") {
      const gross = Number(v.amount || 0);
      const refunded = (v.refunds || []).reduce(
        (s: number, r: any) => s + Number(r.amount || 0),
        0
      );
      netMovedFormationAmount += Math.max(0, gross - refunded);
    }

    await tx.voucher.update({
      where: { id: v.id },
      data: {
        classId: toClass.id,
        targetBranchId: toClass.branchId,
        lastEditedAt: new Date(),
        lastEditedBy: params.performedBy,
      },
    });

    await tx.voucherEdit.create({
      data: {
        voucherId: v.id,
        editedBy: params.performedBy,
        fieldName: "classId",
        oldValue: String(fromClass.id),
        newValue: String(toClass.id),
        reason: auditReason,
      },
    });
  }

  // 4. Move level test records of this formation level from fromClass to toClass
  await tx.levelTest.updateMany({
    where: {
      studentId: params.studentId,
      classId: fromClass.id,
      formationLevelId: fromClass.formationLevelId,
    },
    data: {
      classId: toClass.id,
    },
  });

  // 5. Record EnrollmentTransfer audit log (embedding moved voucher IDs for reversible undo)
  const voucherMetaTag =
    movedVoucherIds.length > 0
      ? `[FORMATION_VOUCHERS:${movedVoucherIds.join(",")}]`
      : "[FORMATION_SWITCH]";
  const combinedNotes = [params.notes?.trim(), voucherMetaTag]
    .filter(Boolean)
    .join(" ");

  await tx.enrollmentTransfer.create({
    data: {
      fromEnrollmentId: fromEnrollment.id,
      toEnrollmentId: toEnrollment.id,
      transferredSessions: 0,
      amount: new Prisma.Decimal(Math.round(netMovedFormationAmount * 100) / 100),
      notes: combinedNotes || null,
      transferredAt: new Date(),
      transferredBy: params.performedBy,
    },
  });

  return {
    fromClass,
    toClass,
    toEnrollment,
    movedVoucherIds,
    netMovedFormationAmount,
  };
}

export async function transferStudentFormationGroup(data: {
  enrollmentId: number;
  fromClassId?: number;
  toClassId: number;
  studentId: string;
  notes?: string;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && !session.isBranchAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "Permissions insuffisantes / صلاحية غير كافية",
      };
    }

    const [srcCheck, dstCheck] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { id: data.enrollmentId },
        include: { class: { include: { FormationLevel: true } } },
      }),
      prisma.class.findUnique({
        where: { id: data.toClassId },
        select: { id: true, branchId: true },
      }),
    ]);

    if (!srcCheck || !dstCheck) {
      return {
        success: false,
        error: true,
        message: "Inscription ou groupe cible introuvable / التسجيل أو الفوج المستهدف غير موجود",
      };
    }

    if (
      session.branchIds.length > 0 &&
      !canUserAccessBranch(session.rawRole, session.branchIds, srcCheck.class.branchId) &&
      !canUserAccessBranch(session.rawRole, session.branchIds, dstCheck.branchId)
    ) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع",
      };
    }

    const txRes = await prisma.$transaction(async (tx) => {
      return await executeFormationGroupTransferTx(tx, {
        fromEnrollmentId: data.enrollmentId,
        toClassId: data.toClassId,
        studentId: data.studentId,
        notes: data.notes,
        performedBy: session.userId || "admin",
      });
    });

    await revalidateFinancialRoutes({
      classId: txRes.toClass.id,
      studentId: data.studentId,
      branchId: txRes.toClass.branchId,
    });
    await revalidateFinancialRoutes({
      classId: txRes.fromClass.id,
      branchId: txRes.fromClass.branchId,
    });
    revalidateFormationPaths({
      languageId: txRes.toClass.FormationLevel?.languageId ?? null,
      classIds: [txRes.fromClass.id, txRes.toClass.id],
    });
    safeRevalidatePath(`/list/attendance/class/${txRes.fromClass.id}`);
    safeRevalidatePath(`/list/attendance/class/${txRes.toClass.id}`);
    safeRevalidatePath("/list/payroll");

    return {
      success: true,
      error: false,
      message: `Élève transféré avec succès de "${txRes.fromClass.name}" vers "${txRes.toClass.name}" (paiements et tests conservés) / تم نقل التلميذ بنجاح من "${txRes.fromClass.name}" إلى "${txRes.toClass.name}" مع الحفاظ على المدفوعات والاختبارات`,
      data: serializeForClient(txRes),
    };
  } catch (err: any) {
    console.error("Error transferring student between formation groups:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec du transfert de groupe / فشل في نقل التلميذ إلى الفوج الآخر",
    };
  }
}

export async function deleteEntireFormation(formationId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour supprimer la formation / صلاحية غير كافية لحذف التكوين" };
    }

    const lang = await prisma.language.findUnique({
      where: { id: formationId },
      include: {
        FormationLevel: {
          include: {
            Class: {
              include: {
                vouchers: { where: { isVoided: false } },
              },
            },
          },
        },
      },
    });

    if (!lang) {
      return { success: false, error: true, message: "Formation introuvable / التكوين غير موجود" };
    }

    const allClasses = lang.FormationLevel.flatMap((lvl) => lvl.Class);
    const hasActiveVouchers = allClasses.some((c) => c.vouchers.length > 0);
    if (hasActiveVouchers) {
      return {
        success: false,
        error: true,
        message: "Impossible de supprimer cette formation car des reçus de paiement actifs y sont associés / لا يمكن حذف هذا التكوين لوجود وصولات دفع نشطة مسجلة عليه",
      };
    }

    await prisma.$transaction(async (tx) => {
      const classIds = allClasses.map((c) => c.id);
      if (classIds.length > 0) {
        const lessons = await tx.lesson.findMany({ where: { classId: { in: classIds } }, select: { id: true } });
        const lessonIds = lessons.map((l) => l.id);
        if (lessonIds.length > 0) {
          await tx.attendance.deleteMany({ where: { lessonId: { in: lessonIds } } });
          await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
        }
        await tx.levelTest.deleteMany({ where: { classId: { in: classIds } } });
        await tx.enrollment.deleteMany({ where: { classId: { in: classIds } } });
        await tx.class.deleteMany({ where: { id: { in: classIds } } });
      }
      await tx.formationLevel.deleteMany({ where: { languageId: formationId } });
      await tx.language.delete({ where: { id: formationId } });
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Formation supprimée avec succès / تم حذف التكوين بنجاح" };
  } catch (err: any) {
    console.error("Error deleting entire formation:", err);
    return { success: false, error: true, message: err?.message || "Échec de la suppression de la formation / فشل في حذف التكوين" };
  }
}

export async function deleteFormationAction(
  currentState: any,
  formData: FormData
): Promise<ActionResponse> {
  const idStr = formData.get("id") as string;
  const parsedId = parseInt(idStr, 10);
  try {
    const isLanguage = await prisma.language.findUnique({
      where: { id: parsedId },
      select: { id: true },
    });
    if (isLanguage) {
      return await deleteEntireFormation(parsedId);
    }
    return await deleteFormationGroup(parsedId);
  } catch (err: any) {
    return { success: false, error: true, message: err?.message || "فشل في حذف التكوين." };
  }
}

// =================================================================
// 12. DELETE REGISTERED STUDENT(S) FROM FORMATION LEVEL
// =================================================================

export async function deleteStudentFromFormationLevel(data: {
  enrollmentId: number;
  classId: number;
  studentId: string;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "Permissions insuffisantes pour supprimer cet élève / صلاحية غير كافية لحذف التلميذ",
      };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: data.enrollmentId },
      include: {
        class: true,
        student: true,
      },
    });

    if (!enrollment || enrollment.classId !== data.classId) {
      return {
        success: false,
        error: true,
        message: "Inscription introuvable / التسجيل غير موجود",
      };
    }

    if (
      session.branchIds.length > 0 &&
      !canUserAccessBranch(session.rawRole, session.branchIds, enrollment.class.branchId)
    ) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع",
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Remove enrollment transfers referencing this enrollment
      await tx.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollmentId: data.enrollmentId },
            { toEnrollmentId: data.enrollmentId },
          ],
        },
      });

      // 2. Remove level test records for this student in this formation group
      await tx.levelTest.deleteMany({
        where: {
          studentId: data.studentId,
          classId: data.classId,
        },
      });

      // 3. Remove attendances for lessons of this formation group
      const lessons = await tx.lesson.findMany({
        where: { classId: data.classId },
        select: { id: true },
      });
      const lessonIds = lessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        await tx.attendance.deleteMany({
          where: {
            studentId: data.studentId,
            lessonId: { in: lessonIds },
          },
        });
      }

      // 4. Delete the enrollment record
      await tx.enrollment.delete({
        where: { id: data.enrollmentId },
      });
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    safeRevalidatePath(`/list/payments/class/${data.classId}`);
    safeRevalidatePath("/list/students");

    return {
      success: true,
      error: false,
      message: "Élève désinscrit du niveau avec succès (profil conservé) / تم إلغاء تسجيل التلميذ من المستوى بنجاح (الملف محفوظ)",
    };
  } catch (err: any) {
    console.error("Error un-enrolling student from formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la désinscription de l'élève / فشل في إلغاء تسجيل التلميذ من المستوى",
    };
  }
}

export async function deleteMultipleStudentsFromFormationLevel(data: {
  classId: number;
  enrollments: Array<{ enrollmentId: number; studentId: string }>;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "Permissions insuffisantes / صلاحية غير كافية",
      };
    }

    const cls = await prisma.class.findUnique({
      where: { id: data.classId },
      select: { id: true, branchId: true },
    });
    if (!cls) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (
      session.branchIds.length > 0 &&
      !canUserAccessBranch(session.rawRole, session.branchIds, cls.branchId)
    ) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع",
      };
    }

    const enrollmentIds = data.enrollments.map((e) => e.enrollmentId);
    const studentIds = data.enrollments.map((e) => e.studentId);

    await prisma.$transaction(async (tx) => {
      await tx.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollmentId: { in: enrollmentIds } },
            { toEnrollmentId: { in: enrollmentIds } },
          ],
        },
      });

      await tx.levelTest.deleteMany({
        where: {
          classId: data.classId,
          studentId: { in: studentIds },
        },
      });

      const lessons = await tx.lesson.findMany({
        where: { classId: data.classId },
        select: { id: true },
      });
      const lessonIds = lessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        await tx.attendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            lessonId: { in: lessonIds },
          },
        });
      }

      await tx.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    safeRevalidatePath(`/list/payments/class/${data.classId}`);
    safeRevalidatePath("/list/students");

    return {
      success: true,
      error: false,
      message: `${enrollmentIds.length} élève(s) désinscrit(s) du niveau avec succès / تم إلغاء تسجيل التلاميذ بنجاح`,
    };
  } catch (err: any) {
    console.error("Error batch un-enrolling students from formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la désinscription / فشل في إلغاء التسجيل",
    };
  }
}


