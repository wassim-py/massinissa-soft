import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole } from "@/lib/auth";
import BackButton from "@/components/BackButton";
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
import { serializeForClient } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";

export default async function FormationDetailsPage(props: {
  params: Promise<{ id: string; locale?: string }>;
}) {
  const params = await props.params;
  const role = await getAuthRole();
  const t = await getTranslations("formations");
  const locale = await getLocale();

  const classId = parseInt(params.id, 10);
  if (isNaN(classId)) {
    notFound();
  }

  // 1. Fetch Formation Group (Class) with full relations
  const formationGroup = await prisma.class.findUnique({
    where: { id: classId },
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
          student: true,
        },
        orderBy: { enrolledAt: "desc" },
      },
      vouchers: {
        where: { paymentType: { in: ["FORMATION", "BOOK"] } },
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
  const language = formationLevel.Language;

  // 1b. Fetch all levels of this formation to display them in card style
  const allLevelsInFormation = await prisma.formationLevel.findMany({
    where: { languageId: formationLevel.languageId },
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
  for (const lvl of allLevelsInFormation) {
    const hasBranchClass = lvl.Class.some(
      (c) => c.branchId === formationGroup.branchId && !c.isCompleted
    );
    if (!hasBranchClass && lvl.Class.length === 0) {
      const createdClass = await prisma.class.create({
        data: {
          name: `${language.name} - ${lvl.name}`,
          branchId: formationGroup.branchId,
          teacherId: formationGroup.teacherId || null,
          isFormation: true,
          formationLevelId: lvl.id,
          ageGroup: formationGroup.ageGroup || "Adultes",
          pricePerCycle: lvl.lumpSumPrice,
          inscriptionFee: formationGroup.inscriptionFee,
          hasBooks: formationGroup.hasBooks,
          bookFee: formationGroup.bookFee,
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

  // 2. Fetch Next Level for assisted level-up flow (§2.8)
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

  // 3. Classrooms in this branch (for scheduling lessons)
  const classrooms = await prisma.classroom.findMany({
    where: { branchId: formationGroup.branchId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // 4. Teachers for scheduling lessons
  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // 5. All students for registration modal
  const allStudents = await prisma.student.findMany({
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });

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
  for (const t of formationGroup.LevelTest) {
    const list = testsByStudent.get(t.studentId) || [];
    list.push({
      id: t.id,
      score: t.score ? Number(t.score) : null,
      passed: t.passed,
      testDate: t.testDate,
    });
    testsByStudent.set(t.studentId, list);
  }

  const enrolledStudentsData = formationGroup.enrollments.map((enr) => ({
    id: enr.id,
    enrolledAt: enr.enrolledAt,
    student: {
      id: enr.student.id,
      globalNumber: enr.student.globalNumber,
      name: enr.student.name,
      phone: enr.student.phone,
    },
    vouchers: vouchersByStudent.get(enr.student.id) || [],
    levelTests: testsByStudent.get(enr.student.id) || [],
  }));

  const enrolledStudentsList = formationGroup.enrollments.map((enr) => ({
    id: enr.student.id,
    name: enr.student.name,
    phone: enr.student.phone,
  }));

  const lumpPrice = Number(formationLevel.lumpSumPrice || formationGroup.pricePerCycle || 0);

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans">
      <BackButton />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">{formationGroup.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {t("taughtBy")}{" "}
            <span className="font-semibold text-gray-800">
              {formationGroup.teacher?.name || t("unspecified")}
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

      {/* 1. FORMATION LEVELS CARD GRID (SAME CARD STYLE AS FORMATIONS LIST) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>{t("formationLevels")}</span>
              <Badge variant="secondary" size="sm">
                {allLevelsInFormation.length} {locale === "ar" ? "مستويات" : "niveaux"}
              </Badge>
            </h2>
            <p className="text-xs text-gray-500">
              {language.name} • {t("formationLevelsSub")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-3">
          {allLevelsInFormation.map((lvl) => {
            const activeClass = lvl.Class.find((c) => !c.isCompleted) || lvl.Class[0];
            const isCurrent = lvl.id === formationLevel.id;
            const isCompleted = activeClass ? activeClass.isCompleted : false;
            const price = Number(lvl.lumpSumPrice || activeClass?.pricePerCycle || 0);
            const teacherName = activeClass?.teacher?.name || t("unspecified");
            const sessionsCount = Number(activeClass?._count?.lessons || 0);
            const participantsCount = Number(activeClass?._count?.enrollments || 0);
            const description = `${language.name} • ${lvl.name}`;
            const targetUrl = activeClass ? `/${locale}/list/formations/${activeClass.id}` : "#";

            return (
              <Card
                key={lvl.id}
                className={`flex flex-col transition-all overflow-hidden relative ${
                  isCurrent
                    ? "ring-2 ring-primary border-primary shadow-md bg-primary/[0.02]"
                    : "hover:border-primary/40 hover:shadow-sm"
                }`}
              >
                {isCurrent && (
                  <div className="bg-primary text-white text-[10px] font-bold px-3 py-0.5 text-center tracking-wider uppercase">
                    {t("activeLevelBadge")}
                  </div>
                )}
                <Link
                  href={targetUrl}
                  className="block p-5 flex-grow hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`p-2.5 rounded-full shrink-0 ${
                          isCurrent ? "bg-primary text-white" : "bg-primary/10"
                        }`}
                      >
                        <Image
                          src="/lesson.png"
                          alt={lvl.name}
                          width={22}
                          height={22}
                        />
                      </div>
                      <h2 className="text-sm font-bold text-gray-900 truncate">
                        {activeClass?.name || lvl.name}
                      </h2>
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

                  <p className="text-xs text-gray-600 mb-3 h-8 overflow-hidden line-clamp-2">
                    {description}
                  </p>

                  <div className="text-xs space-y-2 text-gray-600 border-t border-border pt-3">
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

                <div className="border-t border-border p-2.5 bg-surface-subtle flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {activeClass ? (
                      <Link
                        href={`/list/attendance/class/${activeClass.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Image src="/attendance.png" alt="" width={12} height={12} />
                        <span>{locale === "ar" ? "الحضور" : "Présences"}</span>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-gray-400 italic px-1">
                        {t("levelOpenForEnrollmentBadge")}
                      </span>
                    )}

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
                      href={`/${locale}/list/formations/${activeClass.id}`}
                      className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                        isCurrent
                          ? "text-primary font-bold"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {isCurrent
                        ? locale === "ar"
                          ? "معروض الآن"
                          : "Affiché"
                        : participantsCount === 0
                        ? `${t("enrollStudentsAction")} →`
                        : `${locale === "ar" ? "عرض التفاصيل" : "Voir détails"} →`}
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Final Level Closed Banner */}
      {isFinalLevel && formationGroup.isCompleted && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-emerald-900 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl shrink-0">
              🎓
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FormationRoster
            formationClass={serializeForClient(formationGroup)}
            formationLevel={serializeForClient(formationLevel)}
            nextLevel={nextLevel ? serializeForClient(nextLevel) : null}
            availableNextGroups={serializeForClient(availableNextGroups)}
            enrolledStudents={serializeForClient(enrolledStudentsData)}
            allStudents={serializeForClient(allStudents)}
            role={role}
          />
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="text-section-title font-bold text-gray-900">{t("details")}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{t("lumpSumPrice")}:</span>
                <Badge variant="primary" size="sm" className="font-mono font-bold">
                  {lumpPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">{t("language")} & {t("level")}:</span>
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
                    {Number(formationGroup.bookFee || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-border">
                <p className="text-gray-500 mb-1 text-xs font-semibold">{t("description")}:</p>
                <p className="text-gray-700 text-sm leading-relaxed">
                  {`${language.name} - ${formationLevel.name}`}
                </p>
              </div>
            </div>
          </Card>
          <FormationSchedule
            formationClass={serializeForClient(formationGroup)}
            sessions={serializeForClient(formationGroup.lessons)}
            enrolledStudents={serializeForClient(enrolledStudentsList)}
            classrooms={serializeForClient(classrooms)}
            teachers={serializeForClient(teachers)}
            role={role}
          />
        </div>
      </div>
    </div>
  );
}
