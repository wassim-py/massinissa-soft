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
import Image from "next/image";
import Link from "next/link";
import {
  serializeForClient,
  getAlgiersWeekBounds,
  resolveRecurringLessonsForWeek,
} from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import { GraduationCap, ArrowLeft, ArrowRight, Layers, Users, Calendar } from "lucide-react";
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
  const t = await getTranslations("formations");
  const locale = await getLocale();

  const rawId = parseInt(params.id, 10);
  if (isNaN(rawId)) {
    notFound();
  }

  // 1. Resolve whether rawId is a Class or a Language (Formation)
  let languageId: number | null = null;
  let preselectedClassId: number | null = null;

  const classCandidate = await prisma.class.findUnique({
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

  if (!languageId) {
    notFound();
  }

  // 2. Fetch Formation Language and all levels in this formation
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
              enrollments: true,
              lessons: true,
            },
          },
        },
        orderBy: { id: "desc" },
      },
    },
    orderBy: { levelNumber: "asc" },
  });

  // Ensure every level has an active Class in this branch ready to accept student registrations
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
              enrollments: true,
              lessons: true,
            },
          },
        },
      });
      lvl.Class.push(createdClass);
    }
  }

  // 3. Determine active class for the selected level
  const requestedLevelClassId = searchParams.level
    ? parseInt(searchParams.level, 10)
    : null;
  const activeClassId =
    requestedLevelClassId ||
    preselectedClassId ||
    allLevelsInFormation[0]?.Class.find((c) => !c.isCompleted)?.id ||
    allLevelsInFormation[0]?.Class[0]?.id;

  if (!activeClassId) {
    notFound();
  }

  // 4. Fetch the selected level's Formation Group (Class) with full relations
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
        where: { paymentType: { in: ["FORMATION", "BOOK", "INSCRIPTION", "TUITION_4SESSION"] } },
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

  if (!formationGroup || !formationGroup.isFormation || !formationGroup.FormationLevel) {
    notFound();
  }

  const formationLevel = formationGroup.FormationLevel;

  // Total enrolled count across all levels in the formation
  const totalEnrolledFormation = allLevelsInFormation.reduce((total, lvl) => {
    return total + lvl.Class.reduce((sum, c) => sum + (c._count?.enrollments || 0), 0);
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
        isCompleted: false,
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

  // Next Level for assisted promotion
  const nextLevel = await prisma.formationLevel.findFirst({
    where: {
      languageId: formationLevel.languageId,
      levelNumber: formationLevel.levelNumber + 1,
    },
  });

  let availableNextGroups: any[] = [];
  if (nextLevel) {
    availableNextGroups = await prisma.class.findMany({
      where: {
        isFormation: true,
        formationLevelId: nextLevel.id,
      },
      include: {
        branch: true,
        lessons: {
          include: { classroom: true, teacher: true },
          orderBy: { startsAt: "asc" },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  // Classrooms and teachers for scheduling lessons
  const classrooms = await prisma.classroom.findMany({
    where: { branchId: formationGroup.branchId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const allStudents = await prisma.student.findMany({
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });

  // Fetch grades and classes for rapid student registration to this formation group
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
            ? {}
            : { OR: [{ branchId: formationGroup.branchId }, { id: formationGroup.id }] },
          select: { id: true, name: true, levelId: true },
          orderBy: { name: "asc" },
        }),
      ]);

      studentRelatedData = {
        grades: levels.map((lvl) => ({ id: lvl.id, level: lvl.name, name: lvl.name })),
        classes: classes.map((c) => ({ id: c.id, name: c.name, levelId: c.levelId })),
      };
    } catch (e) {
      console.error("Error fetching student registration relatedData in formation details:", e);
    }
  }

  // Map vouchers and tests by student
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

  const enrolledStudentsData = formationGroup.enrollments.map((enr) => ({
    id: enr.id,
    enrolledAt: enr.enrolledAt,
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
  }));

  const enrolledStudentsList = formationGroup.enrollments.map((enr) => ({
    id: enr.student.id,
    name: enr.student.name,
    phone: enr.student.phone,
  }));

  const lumpPrice = Number(
    formationLevel.lumpSumPrice || formationGroup.pricePerCycle || 0
  );

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
              <span className="flex items-center gap-1 font-medium">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                {totalEnrolledFormation}{" "}
                {locale === "ar" ? "تلاميذ مسجلين إجمالاً" : "stagiaires au total"}
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
            <ExportButton
              type="class_attendance"
              options={{ classId: formationGroup.id }}
            />
          </div>
        </div>
      </div>

      {/* 2. FORMATION LEVELS CARD GRID (THE LEVELS CREATED IN THE FORMATION CREATION FORM) */}
      <div className="space-y-3 bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base md:text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>{t("formationLevels")}</span>
              <Badge variant="secondary" size="sm">
                {allLevelsInFormation.length} {locale === "ar" ? "مستويات" : "niveaux"}
              </Badge>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {language.name} • {t("formationLevelsSub")}
            </p>
          </div>
          <span className="text-xs text-gray-400">
            {locale === "ar"
              ? "اضغط على أي مستوى لعرض تلاميذه ومتابعته أدناه"
              : "Cliquez sur un niveau pour afficher ses stagiaires ci-dessous"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
          {allLevelsInFormation.map((lvl) => {
            const activeClass =
              lvl.Class.find((c) => !c.isCompleted) || lvl.Class[0];
            const isCurrent = lvl.id === formationLevel.id;
            const isCompleted = activeClass ? activeClass.isCompleted : false;
            const price = Number(
              lvl.lumpSumPrice || activeClass?.pricePerCycle || 0
            );
            const teacherName =
              activeClass?.teacher?.name || t("unspecified");
            const sessionsCount = Number(activeClass?._count?.lessons || 0);
            const participantsCount = Number(
              activeClass?._count?.enrollments || 0
            );
            const description = `${language.name} • ${lvl.name}`;
            const targetUrl = activeClass
              ? `/${locale}/list/formations/${language.id}?level=${activeClass.id}#level-details`
              : "#";

            return (
              <Card
                key={lvl.id}
                className={`flex flex-col transition-all overflow-hidden relative cursor-pointer ${
                  isCurrent
                    ? "ring-2 ring-primary border-primary shadow-md bg-primary/[0.02]"
                    : "hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                {isCurrent && (
                  <div className="bg-primary text-white text-[10px] font-bold px-3 py-0.5 text-center tracking-wider uppercase">
                    {locale === "ar" ? "المستوى المعروض حالياً" : t("activeLevelBadge")}
                  </div>
                )}
                <Link
                  href={targetUrl}
                  className="block p-4 flex-grow hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`p-2 rounded-full shrink-0 ${
                          isCurrent ? "bg-primary text-white" : "bg-primary/10"
                        }`}
                      >
                        <Image
                          src="/lesson.png"
                          alt={lvl.name}
                          width={20}
                          height={20}
                        />
                      </div>
                      <h3 className="text-sm font-bold text-gray-900 truncate">
                        {lvl.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {activeClass ? (
                        isCompleted ? (
                          <Badge variant="success" size="sm" withDot>
                            {t("levelCompletedBadge")}
                          </Badge>
                        ) : participantsCount > 0 ? (
                          <Badge variant="neutral" size="sm" withDot>
                            {t("levelActiveBadge")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" size="sm" withDot>
                            {t("levelOpenForEnrollmentBadge")}
                          </Badge>
                        )
                      ) : (
                        <Badge variant="secondary" size="sm">
                          {t("levelOpenForEnrollmentBadge")}
                        </Badge>
                      )}
                      <Badge variant="primary" size="sm" className="font-mono">
                        {price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mb-3 h-5 overflow-hidden line-clamp-1">
                    {description}
                  </p>

                  <div className="text-xs space-y-1.5 text-gray-600 border-t border-border pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("teacher")}:</span>
                      <span className="font-semibold text-gray-800 truncate max-w-[130px]">
                        {teacherName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("schedule")}</span>
                      <Badge variant="neutral" size="sm">
                        {t("sessionsCount", { count: sessionsCount })}
                      </Badge>
                    </div>
                    {role === "admin" && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("roster")}:</span>
                        <Badge variant="secondary" size="sm">
                          {t("participantsCount", { count: participantsCount })}
                        </Badge>
                      </div>
                    )}
                  </div>
                </Link>

                <div className="border-t border-border p-2 bg-surface-subtle flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {activeClass ? (
                      <Link
                        href={`/list/attendance/class/${activeClass.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title={locale === "ar" ? "الحضور" : "Présences"}
                      >
                        <Image src="/attendance.png" alt="" width={12} height={12} />
                        <span>{locale === "ar" ? "الحضور" : "Présences"}</span>
                      </Link>
                    ) : null}

                    {role === "admin" && (
                      <DeleteFormationLevelModal
                        levelId={lvl.id}
                        levelName={lvl.name}
                        enrolledCount={participantsCount}
                        isCurrentLevel={isCurrent}
                      />
                    )}
                  </div>

                  {activeClass && (
                    <Link
                      href={targetUrl}
                      className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                        isCurrent
                          ? "text-primary font-bold"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {isCurrent ? (
                        locale === "ar" ? (
                          "معروض أدناه ↓"
                        ) : (
                          "Affiché ci-dessous ↓"
                        )
                      ) : (
                        <span>
                          {locale === "ar" ? "عرض التلاميذ" : "Voir les stagiaires"}{" "}
                          →
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 3. LEVEL DETAILS SECTION (ROSTER, ENROLLED STUDENTS & SCHEDULE) */}
      <div id="level-details" className="space-y-4 pt-2">
        {/* Level Switcher & Header Bar */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                {locale === "ar" ? "المستوى الحالي" : "Niveau actif"}
              </span>
              <h2 className="text-lg md:text-xl font-bold text-gray-900">
                {formationLevel.name}
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {language.name} • {t("taughtBy")}{" "}
              <span className="font-semibold text-gray-800">
                {formationGroup.teacher?.name || t("unspecified")}
              </span>
            </p>
          </div>

          {/* Quick Level Switcher Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full md:max-w-[60%]">
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap shrink-0">
              {locale === "ar" ? "تبديل المستوى:" : "Changer :"}
            </span>
            {allLevelsInFormation.map((lvl) => {
              const cls =
                lvl.Class.find((c) => !c.isCompleted) || lvl.Class[0];
              const isLvlActive = lvl.id === formationLevel.id;
              const enrCount = cls?._count?.enrollments || 0;
              return (
                <Link
                  key={lvl.id}
                  href={`/${locale}/list/formations/${language.id}?level=${cls.id}#level-details`}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
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
        </div>

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
                <div className="pt-2 border-t border-border">
                  <p className="text-gray-500 mb-1 text-xs font-semibold">
                    {t("description")}:
                  </p>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {`${language.name} - ${formationLevel.name}`}
                  </p>
                </div>
              </div>
            </Card>

            <FormationSchedule
              formationClass={serializeForClient(formationGroup)}
              sessions={serializeForClient(
                resolveRecurringLessonsForWeek(
                  formationGroup.lessons,
                  getAlgiersWeekBounds(0)
                )
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
