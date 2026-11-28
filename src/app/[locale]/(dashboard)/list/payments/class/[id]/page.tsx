import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import PaymentGrid from "@/components/PaymentGrid";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import GroupTabs from "@/components/groups/GroupTabs";
import ClassStatusToggleButton from "@/components/groups/ClassStatusToggleButton";
import { ACTIVE_CLASS_WHERE, isClassInactive } from "@/lib/classStatus";
import { serializeForClient } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import { getActiveTrimester, getFixedInscriptionFeeAction, getFormationInscriptionFeeAction } from "@/lib/configurationActions";

const ClassPaymentHistoryPage = async (
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const params = await props.params;
  const [t, locale, session] = await Promise.all([
    getTranslations("payments"),
    getLocale(),
    getAuthSession(),
  ]);

  if (!session.isOwnerOrAdmin && !session.isBranchAdmin) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedDesc")}
          </p>
        </div>
      </Card>
    );
  }

  const classId = parseInt(params.id, 10);
  if (isNaN(classId)) {
    notFound();
  }

  // Fetch class details, multi-group lessons, transfer target classes, and cached reference values in parallel
  const [classData, multiGroupLessons, availableClasses, activeTrimester, fixedFee, formationFee] =
    await Promise.all([
      prisma.class.findUnique({
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
          enrollments: {
            where: {
              OR: [
                { status: "ACTIVE" },
                { status: "SUSPENDED" },
                { status: "TRANSFERRED" },
                { transfersFrom: { some: {} } },
              ],
            },
            include: {
              student: {
                include: {
                  family: {
                    include: {
                      payerStudent: {
                        include: {
                          enrollments: {
                            where: { classId },
                            include: {
                              transfersFrom: true,
                              transfersTo: true,
                              payerHistory: { orderBy: { effectiveFrom: "asc" } },
                              class: true,
                            },
                          },
                          vouchers: {
                            where: {
                              isVoided: false,
                              isRefund: false,
                              OR: [{ classId }, { classId: null }],
                            },
                            include: { refunds: true },
                          },
                          attendances: {
                            where: {
                              lesson: {
                                isFree: false,
                                OR: [
                                  { classId },
                                  { lessonGroups: { some: { classId } } },
                                ],
                              },
                            },
                            include: {
                              lesson: {
                                select: { id: true, isFree: true, isTeacherAbsent: true, classId: true, startsAt: true, lessonGroups: { select: { classId: true } } },
                              },
                            },
                          },
                          catchUpAttendances: {
                            where: {
                              missedLesson: {
                                OR: [
                                  { classId },
                                  { lessonGroups: { some: { classId } } },
                                ],
                              },
                            },
                            include: {
                              missedLesson: {
                                select: { id: true, classId: true, startsAt: true, isFree: true, isTeacherAbsent: true, lessonGroups: { select: { classId: true } } },
                              },
                              catchUpLesson: {
                                select: { id: true, classId: true, startsAt: true, isFree: true, isTeacherAbsent: true, lessonGroups: { select: { classId: true } } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  registeredBranch: true,
                  enrollments: {
                    include: {
                      class: {
                        include: {
                          branch: true,
                        },
                      },
                    },
                  },
                  vouchers: {
                    where: {
                      paymentType: "INSCRIPTION",
                      isVoided: false,
                      isRefund: false,
                    },
                    include: {
                      refunds: true,
                    },
                  },
                  catchUpAttendances: {
                    include: {
                      missedLesson: {
                        select: { id: true, classId: true, startsAt: true, isFree: true, isTeacherAbsent: true },
                      },
                      catchUpLesson: {
                        select: { id: true, classId: true, startsAt: true, isFree: true, isTeacherAbsent: true },
                      },
                    },
                  },
                },
              },
              transfersFrom: {
                include: {
                  toEnrollment: {
                    include: {
                      class: {
                        include: {
                          branch: true,
                        },
                      },
                    },
                  },
                },
              },
              transfersTo: {
                include: {
                  fromEnrollment: {
                    include: {
                      class: {
                        include: {
                          branch: true,
                        },
                      },
                    },
                  },
                },
              },
              payerHistory: {
                orderBy: { effectiveFrom: "asc" },
              },
            },
            orderBy: { enrolledAt: "asc" },
          },
          vouchers: {
            include: {
              series: {
                include: {
                  issuingBranch: true,
                  targetBranch: true,
                  level: true,
                },
              },
              edits: {
                orderBy: { editedAt: "desc" },
              },
              refunds: {
                orderBy: { refundedAt: "desc" },
              },
            },
            orderBy: { issuedAt: "asc" },
          },
          lessons: {
            where: { isFree: false },
            include: {
              attendances: true,
              lessonGroups: { select: { classId: true } },
            },
            orderBy: { startsAt: "asc" },
          },
        },
      }),
      prisma.lesson.findMany({
        where: {
          lessonGroups: { some: { classId } },
          classId: { not: classId },
          isFree: false,
        },
        include: {
          attendances: true,
          lessonGroups: { select: { classId: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.class.findMany({
        where: ACTIVE_CLASS_WHERE,
        select: {
          id: true,
          name: true,
          levelId: true,
          formationLevelId: true,
          isFormation: true,
          pricePerCycle: true,
          branch: { select: { id: true, name: true } },
        },
        orderBy: [{ branchId: "asc" }, { name: "asc" }],
      }),
      getActiveTrimester(),
      getFixedInscriptionFeeAction(),
      getFormationInscriptionFeeAction(),
    ]);

  if (!classData) {
    notFound();
  }

  if (multiGroupLessons.length > 0) {
    classData.lessons = [...classData.lessons, ...multiGroupLessons].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  }

  // Branch isolation: a branch admin cannot access payments of a class in another branch
  if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, classData.branchId)) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorizedTitle")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedBranchDesc")}
          </p>
          <div className="mt-2">
            <BackButton />
          </div>
        </div>
      </Card>
    );
  }

  // Deduplicate enrollments by studentId if duplicates exist in database
  const enrollmentMap = new Map<string, typeof classData.enrollments[0]>();
  for (const enr of classData.enrollments) {
    if (!enrollmentMap.has(enr.studentId)) {
      enrollmentMap.set(enr.studentId, enr);
    } else {
      const existing = enrollmentMap.get(enr.studentId)!;
      enrollmentMap.set(enr.studentId, {
        ...enr,
        transfersFrom: [...existing.transfersFrom, ...enr.transfersFrom],
        transfersTo: [...existing.transfersTo, ...enr.transfersTo],
        feeOverriddenByOwner: existing.feeOverriddenByOwner || enr.feeOverriddenByOwner,
        inscriptionFeeCharged: existing.inscriptionFeeCharged && enr.inscriptionFeeCharged,
      });
    }
  }
  classData.enrollments = Array.from(enrollmentMap.values());

  const configuredInscriptionFee = classData.isFormation ? formationFee : fixedFee;

  const teacherId = classData.teacherId;
  const levelId = classData.levelId;

  // Query books belonging to teacher + level
  const classBooks =
    teacherId && levelId && activeTrimester
      ? await prisma.book.findMany({
          where: {
            teacherId,
            levelId,
            trimesterId: activeTrimester.id,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const enrolledStudentIds = classData.enrollments.map((e) => e.studentId);
  const classBookReceipts =
    classBooks.length > 0 && enrolledStudentIds.length > 0
      ? await prisma.bookReceipt.findMany({
          where: {
            studentId: { in: enrolledStudentIds },
            bookId: { in: classBooks.map((b) => b.id) },
          },
        })
      : [];

  const hasBooks = classData.hasBooks || classBooks.length > 0;

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
      <CardContent className="p-4 sm:p-5 md:p-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-4 mb-4 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-page-title text-gray-900">
                {t("gridTitle", { name: classData.name })}
              </h1>
              <Badge variant="primary" size="md">
                {t("branchBadge", { name: classData.branch.name })}
              </Badge>
            </div>
            <p className="text-form-helper text-muted mt-1">
              {t("gridSubtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <ClassStatusToggleButton
              classId={classData.id}
              groupName={classData.name}
              isPaused={classData.isPaused}
              isCompleted={classData.isCompleted}
              pausedAt={classData.pausedAt}
              completedAt={classData.completedAt}
              isOwner={session.isOwner}
              showBadge
            />
            {session.isOwner && (
              <ExportButton
                type="payments"
                options={{ classId: classData.id }}
              />
            )}
            <BackButton />
          </div>
        </div>

        {isClassInactive(classData) && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs font-medium">
            {locale === "ar"
              ? "هذا الفوج مغلق / متوقف مؤقتاً — تم تحرير توقيته في الجدول. جميع الوصولات، تسوية الديون، الاسترجاعات وتحويل الرصيد نحو أفواج نشطة تبقى متاحة بالكامل."
              : "Ce groupe est actuellement fermé / en pause — son créneau dans l'emploi du temps est libéré. Tous les reçus, règlements de dettes, remboursements et transferts de solde vers des groupes actifs restent entièrement accessibles."}
          </div>
        )}

        {/* Group Navigation Tabs (§7.20) */}
        <GroupTabs
          classId={classData.id}
          activeTab="payments"
          hasBooks={hasBooks}
        />

        {/* Excel-Style Interactive Payment Grid */}
        <PaymentGrid
          classData={serializeForClient({ ...classData, hasBooks }) as any}
          availableClassesForTransfer={serializeForClient(availableClasses) as any}
          activeTrimester={serializeForClient(activeTrimester) as any}
          classBooks={serializeForClient(classBooks) as any}
          classBookReceipts={serializeForClient(classBookReceipts) as any}
          configuredInscriptionFee={configuredInscriptionFee}
        />
      </CardContent>
    </Card>
  );
};

export default ClassPaymentHistoryPage;
