import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole, getAuthSession } from "@/lib/auth";
import ExportButton from "@/components/ExportButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import FormationRoster from "@/components/formations/FormationRoster";
import FormationSchedule from "@/components/formations/FormationSchedule";
import FinishLevelButton from "@/components/formations/FinishLevelButton";
import FinalLevelEnrollmentButton from "@/components/formations/FinalLevelEnrollmentButton";
import DeleteFormationLevelModal from "@/components/formations/DeleteFormationLevelModal";
import FormationGroupActionsBar from "@/components/formations/FormationGroupActionsBar";
import ClassStatusToggleButton from "@/components/groups/ClassStatusToggleButton";
import { ACTIVE_CLASS_WHERE, isClassInactive } from "@/lib/classStatus";
import Image from "next/image";
import Link from "next/link";
import {
  serializeForClient,
  resolveActiveFormationSchedule,
} from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import {
  GraduationCap,
  ArrowLeft,
  ArrowRight,
  Layers,
  Users,
  Building2,
} from "lucide-react";
import { Prisma } from "@prisma/client";

export default async function FormationDetailsPage(props: {
  params: Promise<{ id: string; locale?: string }>;
  searchParams?: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const role = await getAuthRole();
  const session = await getAuthSession();
  const canCreateStudent =
    session.can("create", "student") ||
    session.isOwner ||
    session.isBranchAdmin ||
    session.isOwnerOrAdmin;
  const canManageGroups =
    role === "admin" ||
    session.isOwner ||
    session.isBranchAdmin ||
    session.isOwnerOrAdmin;
  const t = await getTranslations("formations");
  const locale = await getLocale();

  const rawId = parseInt(params.id, 10);
  if (isNaN(rawId)) {
    notFound();
  }

  // 1. Resolve whether rawId is a Language (Formation) or a specific Class (Group)
  let languageId: number | null = null;
  let preselectedClassId: number | null = null;
  let classCandidate: any = null;

  const isExplicitLanguageRoute =
    searchParams.lang === "1" ||
    Boolean(searchParams.group) ||
    Boolean(searchParams.level);

  if (isExplicitLanguageRoute) {
    const langCandidate = await prisma.language.findUnique({
      where: { id: rawId },
    });
    if (langCandidate) {
      languageId = langCandidate.id;
    }
  }

  if (!languageId) {
    classCandidate = await prisma.class.findUnique({
      where: { id: rawId },
      include: { FormationLevel: true },
    });

    if (classCandidate?.isFormation && classCandidate.FormationLevel) {
      languageId = classCandidate.FormationLevel.languageId;
      preselectedClassId = classCandidate.id;
    } else {
      const langCandidate = await prisma.language.findUnique({
        where: { id: rawId },
      });
      if (langCandidate) {
        languageId = langCandidate.id;
      }
    }
  }

  if (!languageId) {
    notFound();
  }

  // 2. Fetch Formation Language and all levels (with ALL their groups)
  const language = await prisma.language.findUnique({
    where: { id: languageId },
  });
  if (!language) notFound();

  const allLevelsInFormation = await prisma.formationLevel.findMany({
    where: { languageId },
    include: {
      Language: true,
      Class: {
        where: { isFormation: true },
        include: {
          branch: true,
          teacher: true,
          _count: {
            select: {
              enrollments: {
                where: {
                  status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
                },
              },
              lessons: true,
              vouchers: {
                where: { isVoided: false },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { levelNumber: "asc" },
  });

  // Ensure every level has at least one group ready to accept student registrations
  const baseBranchId =
    classCandidate?.branchId ||
    allLevelsInFormation[0]?.Class[0]?.branchId ||
    1;
  const baseAgeGroup =
    classCandidate?.ageGroup ||
    allLevelsInFormation[0]?.Class[0]?.ageGroup ||
    "Adultes (15+ ans)";
  const baseInscriptionFee =
    classCandidate?.inscriptionFee ||
    allLevelsInFormation[0]?.Class[0]?.inscriptionFee ||
    new Prisma.Decimal(0);
  const baseHasBooks =
    classCandidate?.hasBooks ??
    allLevelsInFormation[0]?.Class[0]?.hasBooks ??
    false;
  const baseBookFee =
    classCandidate?.bookFee ||
    allLevelsInFormation[0]?.Class[0]?.bookFee ||
    null;

  for (const lvl of allLevelsInFormation) {
    if (lvl.Class.length === 0) {
      const createdClass = await prisma.class.create({
        data: {
          name: `${language.name} - ${lvl.name}`,
          branchId: baseBranchId,
          teacherId: null,
          isFormation: true,
          formationLevelId: lvl.id,
          ageGroup: baseAgeGroup,
          pricePerCycle: lvl.lumpSumPrice,
          inscriptionFee: baseInscriptionFee,
          hasBooks: baseHasBooks,
          bookFee: baseBookFee,
        },
        include: {
          branch: true,
          teacher: true,
          _count: {
            select: {
              enrollments: {
                where: {
                  status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
                },
              },
              lessons: true,
              vouchers: {
                where: { isVoided: false },
              },
            },
          },
        },
      });
      lvl.Class.push(createdClass);
    }
  }

  // 3. Determine active class (group) from ?group=..., ?level=..., or direct /list/formations/[classId]
  const requestedGroupClassId = searchParams.group
    ? parseInt(searchParams.group, 10)
    : searchParams.level
    ? parseInt(searchParams.level, 10)
    : null;

  const allFormationClassIds = new Set(
    allLevelsInFormation.flatMap((lvl) => lvl.Class.map((c) => c.id))
  );

  const validRequestedClassId =
    requestedGroupClassId && allFormationClassIds.has(requestedGroupClassId)
      ? requestedGroupClassId
      : null;

  const activeClassId =
    validRequestedClassId ||
    preselectedClassId ||
    allLevelsInFormation[0]?.Class.find((c) => !isClassInactive(c))?.id ||
    allLevelsInFormation[0]?.Class[0]?.id;

  if (!activeClassId) {
    notFound();
  }

  // 4. Fetch the selected Formation Group (Class) with full relations
  const formationGroup = await prisma.class.findUnique({
    where: { id: activeClassId },
    include: {
      branch: true,
      teacher: true,
      FormationLevel: {
        include: {
          Language: true,
        },
      },
      lessons: {
        include: {
          classroom: true,
          teacher: true,
          attendances: true,
        },
        orderBy: { startsAt: "asc" },
      },
      enrollments: {
        where: {
          status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
        },
        include: {
          student: {
            include: {
              family: true,
              enrollments: true,
            },
          },
        },
        orderBy: { enrolledAt: "desc" },
      },
      vouchers: {
        where: {
          paymentType: {
            in: ["FORMATION", "BOOK", "INSCRIPTION", "TUITION_4SESSION"],
          },
        },
        include: {
          refunds: true,
          series: {
            include: {
              issuingBranch: true,
              targetBranch: true,
              level: true,
            },
          },
        },
        orderBy: { issuedAt: "desc" },
      },
      LevelTest: {
        orderBy: { testDate: "desc" },
      },
    },
  });

  if (
    !formationGroup ||
    !formationGroup.isFormation ||
    !formationGroup.FormationLevel
  ) {
    notFound();
  }

  const formationLevel = formationGroup.FormationLevel;
  const currentLevelEntry = allLevelsInFormation.find(
    (lvl) => lvl.id === formationLevel.id
  );
  const groupsInSelectedLevel = currentLevelEntry?.Class || [formationGroup as any];
  // Sort active groups first, then paused/completed groups while preserving creation order
  const sortedGroupsInSelectedLevel = [...groupsInSelectedLevel].sort(
    (a, b) => Number(isClassInactive(a)) - Number(isClassInactive(b)) || a.id - b.id
  );
  const fallbackSiblingGroup =
    sortedGroupsInSelectedLevel.find((g) => g.id !== formationGroup.id) || null;

  // Total counts across all levels & groups in this formation
  const totalGroupsInFormation = allLevelsInFormation.reduce(
    (sum, lvl) => sum + lvl.Class.length,
    0
  );
  const totalEnrolledFormation = allLevelsInFormation.reduce((total, lvl) => {
    return (
      total +
      lvl.Class.reduce((sum, c) => sum + (c._count?.enrollments || 0), 0)
    );
  }, 0);

  const highestLevelNum =
    allLevelsInFormation.length > 0
      ? allLevelsInFormation[allLevelsInFormation.length - 1].levelNumber
      : formationLevel.levelNumber;
  const isFinalLevel = formationLevel.levelNumber >= highestLevelNum;

  let availableFormationsForEnrollment: any[] = [];
  if (isFinalLevel && formationGroup.isCompleted) {
    const rawOtherFormations = await prisma.class.findMany({
      where: {
        isFormation: true,
        ...ACTIVE_CLASS_WHERE,
        id: { not: formationGroup.id },
      },
      include: {
        FormationLevel: {
          include: { Language: true },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    availableFormationsForEnrollment = rawOtherFormations.map((f) => ({
      id: f.id,
      name: f.name,
      levelName: f.FormationLevel?.name,
      languageName: f.FormationLevel?.Language?.name,
      price: Number(f.FormationLevel?.lumpSumPrice || f.pricePerCycle || 0),
    }));
  }

  // Next Level & Active Sibling Groups in the Same Level (for student group switch)
  const [nextLevel, sameLevelActiveGroups, branches, classrooms, teachers, allStudents] =
    await Promise.all([
      prisma.formationLevel.findFirst({
        where: {
          languageId: formationLevel.languageId,
          levelNumber: formationLevel.levelNumber + 1,
        },
      }),
      prisma.class.findMany({
        where: {
          isFormation: true,
          formationLevelId: formationLevel.id,
          id: { not: formationGroup.id },
          ...ACTIVE_CLASS_WHERE,
        },
        include: {
          branch: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          lessons: {
            include: { classroom: true, teacher: true },
            orderBy: { startsAt: "asc" },
          },
          _count: {
            select: {
              enrollments: {
                where: {
                  status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
                },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      }),
      prisma.branch.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.classroom.findMany({
        where: { branchId: formationGroup.branchId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.teacher.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.student.findMany({
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
      }),
    ]);

  let availableNextGroups: any[] = [];
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
                status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });
  }

  let studentRelatedData = { grades: [] as any[], classes: [] as any[] };
  if (canCreateStudent) {
    try {
      const [levels, classes] = await Promise.all([
        prisma.level.findMany({
          select: { id: true, name: true },
          orderBy: { id: "asc" },
        }),
        prisma.class.findMany({
          where: session.isOwner
            ? { ...ACTIVE_CLASS_WHERE }
            : {
                ...ACTIVE_CLASS_WHERE,
                OR: [
                  { branchId: formationGroup.branchId },
                  { id: formationGroup.id },
                ],
              },
          select: { id: true, name: true, levelId: true },
          orderBy: { name: "asc" },
        }),
      ]);

      studentRelatedData = {
        grades: levels.map((lvl) => ({
          id: lvl.id,
          level: lvl.name,
          name: lvl.name,
        })),
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          levelId: c.levelId,
        })),
      };
    } catch (e) {
      console.error(
        "Error fetching student registration relatedData in formation details:",
        e
      );
    }
  }

  // Map vouchers and tests by student for the selected group
  const vouchersByStudent = new Map<string, any[]>();
  for (const v of formationGroup.vouchers) {
    const list = vouchersByStudent.get(v.studentId) || [];
    list.push({
      id: v.id,
      number: v.number,
      paymentType: v.paymentType,
      amount: Number(v.amount),
      isPartial: v.isPartial,
      remainingBalance: v.remainingBalance ? Number(v.remainingBalance) : null,
      completesVoucherId: v.completesVoucherId,
      issuedAt: v.issuedAt,
      isVoided: v.isVoided,
      series: v.series
        ? {
            id: v.series.id,
            scope: v.series.scope,
            currentNumber: v.series.currentNumber,
            issuingBranch: v.series.issuingBranch
              ? { name: v.series.issuingBranch.name }
              : null,
            targetBranch: v.series.targetBranch
              ? { name: v.series.targetBranch.name }
              : null,
          }
        : null,
      refunds: v.refunds.map((r) => ({ id: r.id, amount: Number(r.amount) })),
    });
    vouchersByStudent.set(v.studentId, list);
  }

  const testsByStudent = new Map<string, any[]>();
  for (const tst of formationGroup.LevelTest) {
    const list = testsByStudent.get(tst.studentId) || [];
    list.push({
      id: tst.id,
      score: tst.score ? Number(tst.score) : null,
      passed: tst.passed,
      testDate: tst.testDate,
    });
    testsByStudent.set(tst.studentId, list);
  }

  const enrolledStudentsData = formationGroup.enrollments.map((enr) => {
    const hasAttendedAnyLesson = formationGroup.lessons.some(
      (l) =>
        !l.isFree &&
        !l.isTeacherAbsent &&
        l.attendances.some(
          (a) => a.studentId === enr.student.id && a.status === "PRESENT"
        )
    );
    return {
      id: enr.id,
      enrolledAt: enr.enrolledAt,
      hasNeverAttended: !hasAttendedAnyLesson,
      payerStatus: enr.payerStatus || "NORMAL",
      discountType: enr.discountType || null,
      discountValue:
        enr.discountValue != null ? Number(enr.discountValue) : null,
      discountReason: enr.discountReason || null,
      student: {
        id: enr.student.id,
        globalNumber: enr.student.globalNumber,
        name: enr.student.name,
        phone: enr.student.phone,
        family: enr.student.family,
        enrollments: enr.student.enrollments,
      },
      vouchers: vouchersByStudent.get(enr.student.id) || [],
      levelTests: testsByStudent.get(enr.student.id) || [],
    };
  });

  const enrolledStudentsList = formationGroup.enrollments.map((enr) => ({
    id: enr.student.id,
    name: enr.student.name,
    phone: enr.student.phone,
  }));

  const lumpPrice = Number(
    formationLevel.lumpSumPrice || formationGroup.pricePerCycle || 0
  );

  const activeGroupVoucherCount = formationGroup.vouchers.filter(
    (v) => !v.isVoided
  ).length;

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans">
      {/* 1. TOP BREADCRUMB & HEADER */}
      <div>
        <Link
          href={`/${locale}/list/formations`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-3 group"
        >
          {locale === "ar" ? (
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          ) : (
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          )}
          <span>
            {locale === "ar"
              ? "العودة إلى جميع التكوينات"
              : "Toutes les formations"}
          </span>
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-full text-primary">
                <Image
                  src="/lesson.png"
                  alt={language.name}
                  width={26}
                  height={26}
                />
              </div>
              <h1 className="text-page-title font-bold text-gray-900">
                {language.name}
              </h1>
            </div>
            <p className="text-gray-500 mt-1.5 text-xs md:text-sm flex items-center gap-3 flex-wrap">
              <span className="font-medium text-gray-700">
                {formationGroup.branch.name}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-medium">
                <Layers className="w-3.5 h-3.5 text-primary" />
                {allLevelsInFormation.length}{" "}
                {locale === "ar" ? "مستويات" : "niveaux"}
              </span>
              <span>•</span>
              <span className="font-medium">
                {t("groupsCount", { count: totalGroupsInFormation })}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-medium">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                {totalEnrolledFormation}{" "}
                {locale === "ar"
                  ? "تلاميذ مسجلين إجمالاً"
                  : "stagiaires au total"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isFinalLevel && formationGroup.isCompleted && (
              <FinalLevelEnrollmentButton
                graduatedStudents={enrolledStudentsList}
                availableFormations={availableFormationsForEnrollment}
                role={role}
              />
            )}
            {session.isOwner && (
              <ExportButton
                type="class_attendance"
                options={{ classId: formationGroup.id }}
              />
            )}
          </div>
        </div>
      </div>

      {/* 2. FORMATION LEVELS CARD GRID (EACH LEVEL CAN CONTAIN MULTIPLE GROUPS) */}
      <div className="space-y-3 bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base md:text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>{t("formationLevels")}</span>
              <Badge variant="secondary" size="sm">
                {allLevelsInFormation.length}{" "}
                {locale === "ar" ? "مستويات" : "niveaux"}
              </Badge>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {language.name} • {t("formationLevelsSub")}
            </p>
          </div>
          <span className="text-xs text-gray-400">
            {locale === "ar"
              ? "اضغط على أي مستوى أو فوج لعرض تلاميذه وحصصه أدناه"
              : "Cliquez sur un niveau ou un groupe pour afficher ses stagiaires ci-dessous"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
          {allLevelsInFormation.map((lvl) => {
            const defaultClassForLevel =
              lvl.Class.find((c) => !isClassInactive(c)) || lvl.Class[0];
            const isCurrent = lvl.id === formationLevel.id;
            const price = Number(
              lvl.lumpSumPrice || defaultClassForLevel?.pricePerCycle || 0
            );
            const totalSessionsInLevel = lvl.Class.reduce(
              (sum, c) => sum + Number(c._count?.lessons || 0),
              0
            );
            const totalParticipantsInLevel = lvl.Class.reduce(
              (sum, c) => sum + Number(c._count?.enrollments || 0),
              0
            );
            const activeGroupsInLevelCount = lvl.Class.filter(
              (c) => !isClassInactive(c)
            ).length;
            const targetUrl = defaultClassForLevel
              ? `/${locale}/list/formations/${language.id}?lang=1&group=${defaultClassForLevel.id}#level-details`
              : "#";

            return (
              <Card
                key={lvl.id}
                className={`flex flex-col transition-all overflow-hidden relative ${
                  isCurrent
                    ? "ring-2 ring-primary border-primary shadow-md bg-primary/[0.02]"
                    : "hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                {isCurrent && (
                  <div className="bg-primary text-white text-[10px] font-bold px-3 py-0.5 text-center tracking-wider uppercase">
                    {locale === "ar"
                      ? "المستوى المعروض حالياً"
                      : t("activeLevelBadge")}
                  </div>
                )}

                <div className="p-4 flex-grow flex flex-col gap-3">
                  <Link href={targetUrl} className="block group">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-2 rounded-full shrink-0 ${
                            isCurrent
                              ? "bg-primary text-white"
                              : "bg-primary/10"
                          }`}
                        >
                          <Image
                            src="/lesson.png"
                            alt={lvl.name}
                            width={18}
                            height={18}
                          />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                          {lvl.name}
                        </h3>
                      </div>
                      <Badge
                        variant="primary"
                        size="sm"
                        className="font-mono shrink-0"
                      >
                        {price.toLocaleString(
                          locale === "ar" ? "ar-DZ" : "fr-DZ"
                        )}{" "}
                        DZD
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>
                        {t("groupsCount", { count: lvl.Class.length })} (
                        {activeGroupsInLevelCount}{" "}
                        {locale === "ar" ? "نشط" : "actif(s)"})
                      </span>
                      <span>
                        {t("participantsCount", {
                          count: totalParticipantsInLevel,
                        })}{" "}
                        • {t("sessionsCount", { count: totalSessionsInLevel })}
                      </span>
                    </div>
                  </Link>

                  {/* Interactive Groups List Inside Level Card */}
                  <div className="space-y-1.5 pt-2 border-t border-border/70">
                    {lvl.Class.map((grp) => {
                      const isSelectedGrp = grp.id === formationGroup.id;
                      const grpEnrCount = Number(grp._count?.enrollments || 0);
                      const statusDotClass = grp.isPaused
                        ? "bg-amber-500"
                        : grp.isCompleted
                        ? "bg-slate-400"
                        : "bg-emerald-500";
                      const grpUrl = `/${locale}/list/formations/${language.id}?lang=1&group=${grp.id}#level-details`;

                      return (
                        <Link
                          key={grp.id}
                          href={grpUrl}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                            isSelectedGrp
                              ? "bg-primary/10 border-primary/40 text-primary font-bold"
                              : "bg-gray-50/80 border-gray-200/80 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`}
                            />
                            <span className="truncate">{grp.name}</span>
                          </div>
                          <span className="text-[11px] font-mono shrink-0 opacity-80">
                            {grpEnrCount}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border p-2 bg-surface-subtle flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {canManageGroups && (
                      <FormationGroupActionsBar
                        variant="add-level-group"
                        compact
                        languageId={language.id}
                        languageName={language.name}
                        formationLevel={{
                          id: lvl.id,
                          name: lvl.name,
                          levelNumber: lvl.levelNumber,
                          lumpSumPrice: Number(lvl.lumpSumPrice || 0),
                        }}
                        existingGroupsCount={lvl.Class.length}
                        defaultBranchId={baseBranchId}
                        defaultAgeGroup={baseAgeGroup}
                        branches={serializeForClient(branches)}
                        teachers={serializeForClient(teachers)}
                      />
                    )}

                    {role === "admin" && (
                      <DeleteFormationLevelModal
                        levelId={lvl.id}
                        levelName={lvl.name}
                        enrolledCount={totalParticipantsInLevel}
                        isCurrentLevel={isCurrent}
                      />
                    )}
                  </div>

                  {defaultClassForLevel && (
                    <Link
                      href={targetUrl}
                      className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                        isCurrent
                          ? "text-primary font-bold"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {isCurrent
                        ? locale === "ar"
                          ? "معروض أدناه ↓"
                          : "Affiché ↓"
                        : `${locale === "ar" ? "عرض" : "Voir"} →`}
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 3. SELECTED LEVEL & GROUP DETAILS SECTION */}
      <div id="level-details" className="space-y-4 pt-2">
        {/* Level Switcher + Multi-Group Selector Card */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          {/* Row A: Level Switcher Pills + Add Group Button */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-border/70">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap shrink-0 me-1">
                {locale === "ar" ? "المستوى:" : "Niveau :"}
              </span>
              {allLevelsInFormation.map((lvl) => {
                const cls =
                  lvl.Class.find((c) => !isClassInactive(c)) || lvl.Class[0];
                const isLvlActive = lvl.id === formationLevel.id;
                const enrCount = lvl.Class.reduce(
                  (sum, c) => sum + (c._count?.enrollments || 0),
                  0
                );
                return (
                  <Link
                    key={lvl.id}
                    href={`/${locale}/list/formations/${language.id}?lang=1&group=${cls.id}#level-details`}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                      isLvlActive
                        ? "bg-primary text-white shadow-xs"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {lvl.name} ({enrCount})
                  </Link>
                );
              })}
            </div>

            {canManageGroups && (
              <div className="shrink-0">
                <FormationGroupActionsBar
                  variant="add-level-group"
                  languageId={language.id}
                  languageName={language.name}
                  formationLevel={{
                    id: formationLevel.id,
                    name: formationLevel.name,
                    levelNumber: formationLevel.levelNumber,
                    lumpSumPrice: lumpPrice,
                  }}
                  existingGroupsCount={groupsInSelectedLevel.length}
                  defaultBranchId={formationGroup.branchId}
                  defaultAgeGroup={formationGroup.ageGroup}
                  branches={serializeForClient(branches)}
                  teachers={serializeForClient(teachers)}
                />
              </div>
            )}
          </div>

          {/* Row B: Group Selector Tabs inside the Selected Level */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="font-bold uppercase tracking-wider text-gray-600">
                {t("groupSwitcherLabel", { level: formationLevel.name })} (
                {sortedGroupsInSelectedLevel.length})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {sortedGroupsInSelectedLevel.map((grp) => {
                const isSelected = grp.id === formationGroup.id;
                const grpInactive = isClassInactive(grp);
                const grpEnr = Number(grp._count?.enrollments || 0);
                const grpLessons = Number(grp._count?.lessons || 0);

                return (
                  <Link
                    key={grp.id}
                    href={`/${locale}/list/formations/${language.id}?lang=1&group=${grp.id}#level-details`}
                    className={`p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? "border-primary bg-primary/[0.04] ring-2 ring-primary/25 shadow-2xs"
                        : grpInactive
                        ? "border-gray-200 bg-gray-50/70 opacity-80 hover:opacity-100 hover:border-gray-300"
                        : "border-gray-200 bg-white hover:border-primary/40 hover:bg-surface-subtle"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-bold truncate ${
                          isSelected ? "text-primary" : "text-gray-900"
                        }`}
                      >
                        {grp.name}
                      </span>
                      {grp.isPaused ? (
                        <Badge variant="warning" size="sm">
                          {locale === "ar" ? "متوقف" : "Pause"}
                        </Badge>
                      ) : grp.isCompleted ? (
                        <Badge variant="success" size="sm">
                          {t("levelCompletedBadge")}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm" withDot>
                          {locale === "ar" ? "نشط" : "Actif"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-500 gap-2 flex-wrap">
                      <span className="truncate">
                        {grp.teacher?.name || t("unspecified")}
                        {grp.branch?.name ? ` • ${grp.branch.name}` : ""}
                      </span>
                      <span className="font-semibold text-gray-700 shrink-0">
                        {grpEnr} {t("enrolled")} • {grpLessons}{" "}
                        {locale === "ar" ? "حصص" : "séances"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Row C: Active Group Header & Management Actions */}
          <div className="pt-3 border-t border-border/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {formationLevel.name}
                </span>
                <h2 className="text-lg md:text-xl font-bold text-gray-900">
                  {formationGroup.name}
                </h2>
                <ClassStatusToggleButton
                  classId={formationGroup.id}
                  groupName={formationGroup.name}
                  isPaused={Boolean(formationGroup.isPaused)}
                  isCompleted={Boolean(formationGroup.isCompleted)}
                  pausedAt={formationGroup.pausedAt}
                  completedAt={formationGroup.completedAt}
                  isOwner={session.isOwner}
                  showBadge
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                  <Building2 className="w-3.5 h-3.5 text-muted" />
                  {formationGroup.branch.name}
                </span>
                <span>•</span>
                <span>
                  {t("taughtBy")}{" "}
                  <strong className="text-gray-800">
                    {formationGroup.teacher?.name || t("unspecified")}
                  </strong>
                </span>
                {formationGroup.ageGroup && (
                  <>
                    <span>•</span>
                    <span>{formationGroup.ageGroup}</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/list/attendance/class/${formationGroup.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Image src="/attendance.png" alt="" width={14} height={14} />
                <span>{locale === "ar" ? "سجل الحضور" : "Présences"}</span>
              </Link>

              {canManageGroups && (
                <FormationGroupActionsBar
                  variant="manage-active-group"
                  languageId={language.id}
                  languageName={language.name}
                  formationLevel={{
                    id: formationLevel.id,
                    name: formationLevel.name,
                    levelNumber: formationLevel.levelNumber,
                    lumpSumPrice: lumpPrice,
                  }}
                  activeGroup={{
                    id: formationGroup.id,
                    name: formationGroup.name,
                    branchId: formationGroup.branchId,
                    teacherId: formationGroup.teacherId,
                    ageGroup: formationGroup.ageGroup,
                    enrolledCount: enrolledStudentsData.length,
                    activeVouchersCount: activeGroupVoucherCount,
                  }}
                  totalGroupsInLevel={groupsInSelectedLevel.length}
                  fallbackGroupId={fallbackSiblingGroup?.id || null}
                  defaultBranchId={formationGroup.branchId}
                  defaultAgeGroup={formationGroup.ageGroup}
                  branches={serializeForClient(branches)}
                  teachers={serializeForClient(teachers)}
                />
              )}
            </div>
          </div>
        </div>

        {isClassInactive(formationGroup) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs font-medium text-amber-900">
            {locale === "ar"
              ? "هذا الفوج التكويني مغلق / متوقف حالياً. أوقاته محررة في الجدول الأسبوعي، بينما تبقى جميع سجلات التلاميذ والمدفوعات والحضور متاحة بالكامل."
              : "Ce groupe de formation est actuellement fermé / en pause. Ses créneaux sont libérés dans l'emploi du temps, tandis que tous les dossiers stagiaires, paiements et présences restent intégralement accessibles."}
          </div>
        )}

        {/* Final Level Closed Banner */}
        {isFinalLevel && formationGroup.isCompleted && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-emerald-900 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h4 className="font-bold text-sm">
                  {locale === "ar"
                    ? "اكتملت دورة المستوى النهائي بنجاح!"
                    : "Cycle du niveau final terminé avec succès !"}
                </h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {t("enrollInNewFormationDesc")}
                </p>
              </div>
            </div>
            <FinalLevelEnrollmentButton
              graduatedStudents={enrolledStudentsList}
              availableFormations={availableFormationsForEnrollment}
              role={role}
            />
          </div>
        )}

        {/* Roster & Schedule Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <FormationRoster
              formationClass={serializeForClient(formationGroup)}
              formationLevel={serializeForClient(formationLevel)}
              nextLevel={nextLevel ? serializeForClient(nextLevel) : null}
              availableNextGroups={serializeForClient(availableNextGroups)}
              sameLevelActiveGroups={serializeForClient(sameLevelActiveGroups)}
              branches={serializeForClient(branches)}
              teachers={serializeForClient(teachers)}
              enrolledStudents={serializeForClient(enrolledStudentsData)}
              allStudents={serializeForClient(allStudents)}
              studentRelatedData={serializeForClient(studentRelatedData) as any}
              canCreateStudent={canCreateStudent}
              role={role}
            />
          </div>

          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <h3 className="text-section-title font-bold text-gray-900">
                {t("details")}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">{t("lumpSumPrice")}:</span>
                  <Badge
                    variant="primary"
                    size="sm"
                    className="font-mono font-bold"
                  >
                    {lumpPrice.toLocaleString(
                      locale === "ar" ? "ar-DZ" : "fr-DZ"
                    )}{" "}
                    DZD
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">
                    {t("language")} & {t("level")}:
                  </span>
                  <span className="font-semibold text-gray-800">
                    {language.name} • {formationLevel.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">{t("groupNameLabel")}:</span>
                  <span className="font-semibold text-gray-800">
                    {formationGroup.name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">{t("status")}:</span>
                  <FinishLevelButton
                    classId={formationGroup.id}
                    isCompleted={formationGroup.isCompleted}
                    completedAt={formationGroup.completedAt}
                    role={role}
                    size="sm"
                  />
                </div>
                {formationGroup.hasBooks && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">{t("bookFee")}:</span>
                    <span className="font-semibold text-gray-800 font-mono">
                      {Number(formationGroup.bookFee || 0).toLocaleString(
                        locale === "ar" ? "ar-DZ" : "fr-DZ"
                      )}{" "}
                      DZD
                    </span>
                  </div>
                )}
              </div>
            </Card>

            <FormationSchedule
              formationClass={serializeForClient(formationGroup)}
              sessions={serializeForClient(
                resolveActiveFormationSchedule(formationGroup.lessons)
              )}
              enrolledStudents={serializeForClient(enrolledStudentsList)}
              classrooms={serializeForClient(classrooms)}
              teachers={serializeForClient(teachers)}
              role={role}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
