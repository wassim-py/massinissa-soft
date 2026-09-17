"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { getActiveTrimester } from "@/lib/configurationActions";

function safeRevalidatePath(path: string, type?: "page" | "layout") {
  try {
    if (type) {
      revalidatePath(path, type);
    } else {
      revalidatePath(path);
    }
  } catch {
    // Ignore outside Next.js request context (e.g. scripts/unit tests)
  }
}

export type ActionResponse = {
  success: boolean;
  error: boolean;
  message: string;
  data?: any;
};

/**
 * 1. Create a new Book model scoped to teacher + level + active trimester (§7.20)
 * Scoped to teacher + level + trimester, NOT to a single group.
 * A book added from any one group automatically appears on every sibling group.
 */
export async function createBookAction(formData: {
  title: string;
  levelId: number;
  teacherId: string;
  classId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بإضافة كتب.",
      };
    }

    if (!formData.title || !formData.title.trim()) {
      return {
        success: false,
        error: true,
        message: "Le titre du livre est obligatoire / عنوان الكتاب مطلوب.",
      };
    }

    if (!formData.teacherId || !formData.levelId) {
      return {
        success: false,
        error: true,
        message: "L'enseignant et le niveau scolaire sont requis / الأستاذ والمستوى الدراسي مطلوبان.",
      };
    }

    // Resolve active trimester
    const activeTrimester = await getActiveTrimester();

    if (!activeTrimester) {
      return {
        success: false,
        error: true,
        message:
          "Aucun trimestre n'est actuellement actif. Activez un trimestre dans les configurations / لا يوجد فصل دراسي نشط حالياً. يرجى تفعيل فصل دراسي من الإعدادات.",
      };
    }

    // Create the book scoped to teacher + level + active trimester
    const newBook = await prisma.book.create({
      data: {
        title: formData.title.trim(),
        teacherId: formData.teacherId,
        levelId: Number(formData.levelId),
        trimesterId: activeTrimester.id,
      },
      include: {
        level: true,
        teacher: true,
        trimester: true,
      },
    });

    // Revalidate affected routes
    safeRevalidatePath("/list/classes");
    if (formData.classId) {
      safeRevalidatePath(`/list/classes/${formData.classId}`);
      safeRevalidatePath(`/list/payments/class/${formData.classId}`);
      safeRevalidatePath(`/list/attendance/class/${formData.classId}`);
    }
    safeRevalidatePath("/list/attendance");

    return {
      success: true,
      error: false,
      message: `Livre "${newBook.title}" ajouté avec succès pour le niveau ${newBook.level.name} (${activeTrimester.label}) / تم إضافة الكتاب "${newBook.title}" بنجاح لهذا المستوى.`,
      data: newBook,
    };
  } catch (error: any) {
    console.error("Error in createBookAction:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "Échec de l'ajout du livre / فشل في إضافة الكتاب.",
    };
  }
}

/**
 * 2. Toggle "received" checkbox for (studentId, bookId) (§7.20 & §7.19)
 * Single source of truth shared between Books Tab and Take-Attendance page.
 * Exactly one record per student + book in BookReceipt.
 */
export async function toggleBookReceiptAction(data: {
  studentId: string;
  bookId: number;
  received: boolean;
  classId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner && !session.isBranchAdmin && session.role !== "teacher") {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بتسليم الكتب.",
      };
    }

    const { studentId, bookId, received } = data;

    // Fetch book and verify trimester status
    const book = await prisma.book.findUnique({
      where: { id: Number(bookId) },
      include: { trimester: true, level: true },
    });

    if (!book) {
      return {
        success: false,
        error: true,
        message: "Livre introuvable / الكتاب غير موجود.",
      };
    }

    // Freeze check: finished trimester is read-only history
    if (book.trimester && book.trimester.status === "finished") {
      return {
        success: false,
        error: true,
        message:
          "Ce trimestre est clôturé et gelé en lecture seule / هذا الفصل الدراسي منتهي ومجمد كأرشيف للقراءة فقط.",
      };
    }

    // Entitlement check: Student must have a valid BOOK voucher for this trimester & teacher+level
    if (book.trimesterId) {
      const hasPaid = await prisma.voucher.findFirst({
        where: {
          studentId,
          paymentType: "BOOK",
          isVoided: false,
          trimesterId: book.trimesterId,
          OR: [
            {
              class: {
                teacherId: book.teacherId,
                levelId: book.levelId,
              },
            },
            ...(data.classId ? [{ classId: data.classId }] : []),
          ],
        },
      });

      if (!hasPaid) {
        return {
          success: false,
          error: true,
          message:
            "L'élève n'a pas réglé les frais de livres pour ce trimestre / التلميذ لم يدفع معاليم الكتب لهذا الفصل بعد.",
        };
      }
    }

    if (received) {
      // Upsert BookReceipt (single record per student+book)
      await prisma.bookReceipt.upsert({
        where: {
          studentId_bookId: {
            studentId,
            bookId: book.id,
          },
        },
        update: {
          receivedAt: new Date(),
          receivedBy: session.userId || "admin",
        },
        create: {
          studentId,
          bookId: book.id,
          receivedAt: new Date(),
          receivedBy: session.userId || "admin",
        },
      });
    } else {
      // Delete BookReceipt
      await prisma.bookReceipt.deleteMany({
        where: {
          studentId,
          bookId: book.id,
        },
      });
    }

    if (data.classId) {
      safeRevalidatePath(`/list/classes/${data.classId}`);
      safeRevalidatePath(`/list/classes/${data.classId}`, "layout");
      safeRevalidatePath(`/list/payments/class/${data.classId}`);
      safeRevalidatePath(`/list/attendance/class/${data.classId}`);
    }
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath("/list/attendance", "layout");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/classes", "layout");

    return {
      success: true,
      error: false,
      message: received
        ? `Livre "${book.title}" marqué comme remis / تم تأكيد استلام كتاب "${book.title}".`
        : `Remise du livre "${book.title}" annulée / تم إلغاء استلام كتاب "${book.title}".`,
      data: { studentId, bookId: book.id, received },
    };
  } catch (error: any) {
    console.error("Error in toggleBookReceiptAction:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "Échec de mise à jour du statut de remise / فشل في تحديث حالة الاستلام.",
    };
  }
}

/**
 * 3. Fetch full data for a group's Books Tab (§7.20)
 * Live query of books (teacher + level + active trimester) and live fee-paid students.
 */
export async function getGroupBooksData(classId: number) {
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      branch: true,
      teacher: true,
      level: true,
      enrollments: {
        include: {
          student: {
            include: {
              registeredBranch: true,
              parentPhoneNumbers: true,
            },
          },
        },
        orderBy: { student: { name: "asc" } },
      },
    },
  });

  if (!classData) return null;

  // Resolve active trimester (or latest if none active)
  const activeTrimester = await getActiveTrimester();

  // Also fetch all trimesters of the current year for history / status display
  const allTrimesters = activeTrimester
    ? await prisma.trimester.findMany({
        where: { academicYearId: activeTrimester.academicYearId },
        orderBy: { startDate: "asc" },
      })
    : [];

  const teacherId = classData.teacherId;
  const levelId = classData.levelId;

  let books: Array<{
    id: number;
    title: string;
    teacherId: string;
    levelId: number;
    trimesterId: number | null;
    createdAt: Date;
  }> = [];

  let feePaidStudents: Array<{
    id: string;
    name: string;
    phone: string | null;
    parentPhone: string | null;
    globalNumber: number;
    voucherNumber: number;
    voucherDate: Date;
    receipts: Record<number, { received: boolean; receivedAt: Date | null }>;
  }> = [];

  if (activeTrimester && teacherId && levelId) {
    // 1. Fetch books belonging to teacher + level + active trimester
    books = await prisma.book.findMany({
      where: {
        teacherId,
        levelId,
        trimesterId: activeTrimester.id,
      },
      orderBy: { createdAt: "asc" },
    });

    // 2. Fetch live fee-paid students for THIS class & THIS active trimester
    const enrolledStudentIds = classData.enrollments.map((e) => e.studentId);

    const paidVouchers = await prisma.voucher.findMany({
      where: {
        studentId: { in: enrolledStudentIds },
        trimesterId: activeTrimester.id,
        paymentType: "BOOK",
        isVoided: false,
        OR: [
          { classId: classData.id },
          {
            class: {
              teacherId: teacherId,
              levelId: levelId,
            },
          },
        ],
      },
      include: {
        student: {
          include: {
            parentPhoneNumbers: true,
          },
        },
      },
      orderBy: { issuedAt: "asc" },
    });

    // Deduplicate in case a student has multiple book vouchers for the group
    const studentVoucherMap = new Map<string, typeof paidVouchers[0]>();
    for (const v of paidVouchers) {
      if (!studentVoucherMap.has(v.studentId)) {
        studentVoucherMap.set(v.studentId, v);
      }
    }

    const paidStudentsList = Array.from(studentVoucherMap.values());
    const paidStudentIds = paidStudentsList.map((v) => v.studentId);
    const bookIds = books.map((b) => b.id);

    // 3. Fetch BookReceipt records for (paidStudentIds × bookIds)
    const receipts =
      paidStudentIds.length > 0 && bookIds.length > 0
        ? await prisma.bookReceipt.findMany({
            where: {
              studentId: { in: paidStudentIds },
              bookId: { in: bookIds },
            },
          })
        : [];

    const receiptLookup = new Map<string, Date>();
    for (const r of receipts) {
      receiptLookup.set(`${r.studentId}_${r.bookId}`, r.receivedAt);
    }

    // Build student rows
    feePaidStudents = paidStudentsList.map((v) => {
      const s = v.student;
      const studentReceipts: Record<number, { received: boolean; receivedAt: Date | null }> = {};

      for (const b of books) {
        const key = `${s.id}_${b.id}`;
        const hasReceipt = receiptLookup.has(key);
        studentReceipts[b.id] = {
          received: hasReceipt,
          receivedAt: hasReceipt ? receiptLookup.get(key)! : null,
        };
      }

      return {
        id: s.id,
        name: s.name,
        phone: s.phone || null,
        parentPhone: s.parentPhoneNumbers?.[0]?.phone || null,
        globalNumber: s.globalNumber,
        voucherNumber: v.number,
        voucherDate: v.issuedAt,
        receipts: studentReceipts,
      };
    });

    // Sort alphabetically by student name
    feePaidStudents.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }

  // Fetch all levels for the "Add Book" modal level selector
  const allLevels = await prisma.level.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  return {
    classData: {
      id: classData.id,
      name: classData.name,
      branchId: classData.branchId,
      branchName: classData.branch.name,
      teacherId: classData.teacherId,
      teacherName: classData.teacher?.name || null,
      levelId: classData.levelId,
      levelName: classData.level?.name || null,
      hasBooks: classData.hasBooks,
      bookFee: classData.bookFee ? Number(classData.bookFee) : null,
      enrollmentsCount: classData.enrollments.length,
    },
    activeTrimester: activeTrimester
      ? {
          id: activeTrimester.id,
          name: activeTrimester.name,
          label: activeTrimester.label,
          status: activeTrimester.status,
          startDate: activeTrimester.startDate.toISOString(),
          endDate: activeTrimester.endDate.toISOString(),
        }
      : null,
    allTrimesters: allTrimesters.map((t) => ({
      id: t.id,
      name: t.name,
      label: t.label,
      status: t.status,
    })),
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      teacherId: b.teacherId,
      levelId: b.levelId,
      trimesterId: b.trimesterId,
      createdAt: b.createdAt.toISOString(),
    })),
    feePaidStudents: feePaidStudents.map((s) => ({
      ...s,
      voucherDate: s.voucherDate.toISOString(),
      receipts: Object.fromEntries(
        Object.entries(s.receipts).map(([bId, r]) => [
          bId,
          {
            received: r.received,
            receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
          },
        ])
      ),
    })),
    allLevels,
  };
}
