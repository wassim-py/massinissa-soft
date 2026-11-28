import { Suspense } from "react";
import prisma from "@/lib/prisma";
import Announcements from "@/components/Announcements";
import UserCard from "@/components/UserCard";
import UpcomingLessons, {
  DashboardLessonItem,
} from "@/components/dashboard/UpcomingLessons";
import StudentsToWatch, {
  StudentToWatchItem,
} from "@/components/dashboard/StudentsToWatch";
import TodayAttendanceChart from "@/components/dashboard/TodayAttendanceChart";
import {
  buildTodayAttendanceSummary,
  tagLessonSourceDates,
} from "@/lib/dashboardAttendance";
import { getActiveBranchId, getAuthSession } from "@/lib/auth";
import { getCachedBranches } from "@/lib/cachedReferenceData";
import { canUserAccessBranch } from "@/lib/settings";
import { computeStudentCreditAndSessions, formatDiscountBadgeLabel, resolvePayerCredit } from "@/lib/studentBilling";
import {
  serializeForClient,
  getAlgiersDateInfo,
  resolveRecurringLessonsForDate,
} from "@/lib/utils";
import { ACTIVE_CLASS_WHERE, isLessonVisibleForClassStatus } from "@/lib/classStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UserCardSkeleton() {
  return (
    <div className="p-4 sm:p-5 flex-1 min-w-[140px] rounded-xl border border-border/80 bg-surface animate-pulse h-[116px]">
      <div className="h-4 w-20 bg-gray-200 rounded mb-4" />
      <div className="h-7 w-14 bg-gray-200 rounded mb-3" />
      <div className="h-3.5 w-24 bg-gray-100 rounded" />
    </div>
  );
}

function AnnouncementsSkeleton() {
  return (
    <div className="rounded-xl border border-border/80 bg-surface p-4 space-y-3 animate-pulse">
      <div className="h-5 w-36 bg-gray-200 rounded" />
      <div className="h-16 bg-gray-100 rounded-lg" />
      <div className="h-16 bg-gray-100 rounded-lg" />
    </div>
  );
}

const AdminPage = async () => {
  const [session, activeBranchId, allBranches] = await Promise.all([
    getAuthSession(),
    getActiveBranchId(),
    getCachedBranches(),
  ]);

  const branchNameById = new Map(allBranches.map((b) => [b.id, b.name]));
  const branchName = branchNameById.get(activeBranchId) || `Siège #${activeBranchId}`;

  const now = new Date();
  const todayInfo = getAlgiersDateInfo(now);

  // Time boundary for today in Africa/Algiers (00:00:00 to 23:59:59.999 Algiers = UTC-1h)
  const startOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, -1, 0, 0, 0)
  );
  const endOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, 22, 59, 59, 999)
  );

  // Stage 1: Lightweight metadata query for candidate lessons (no 7-level enrollment/voucher/attendance tree!)
  const candidateLessons = await prisma.lesson.findMany({
    where: {
      OR: [
        {
          startsAt: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
        {
          isExtra: false,
          isCatchUp: false,
          isFree: false,
          isSingleOccurrence: false,
          class: ACTIVE_CLASS_WHERE,
        },
        {
          isSingleOccurrence: true,
          overridesDate: todayInfo.dateStr,
        },
      ],
    },
    select: {
      id: true,
      branchId: true,
      classId: true,
      teacherId: true,
      startsAt: true,
      endsAt: true,
      isExtra: true,
      isCatchUp: true,
      isFree: true,
      isTeacherAbsent: true,
      recurrenceStartAt: true,
      recurrenceEndAt: true,
      isSingleOccurrence: true,
      overridesDate: true,
      overridesSlotKey: true,
      classroom: {
        select: { id: true, name: true, branchId: true },
      },
      class: {
        select: {
          id: true,
          name: true,
          branchId: true,
          isCompleted: true,
          completedAt: true,
          isPaused: true,
          pausedAt: true,
        },
      },
      teacher: {
        select: {
          id: true,
          name: true,
          TeacherBranch: {
            select: { branchId: true },
          },
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  const taggedCandidateLessons = tagLessonSourceDates(candidateLessons);
  const allTodaysLessons = resolveRecurringLessonsForDate(taggedCandidateLessons, now).filter((l) =>
    isLessonVisibleForClassStatus(l.endsAt, l.class)
  );

  // Today's lessons strictly for THIS branch (hosted in this branch or classroom in this branch)
  const thisBranchTodaysLessons = allTodaysLessons.filter(
    (l) => l.branchId === activeBranchId || (l.classroom as any)?.branchId === activeBranchId
  );

  // Stage 2: Fetch heavy billing/attendance data ONLY for today's resolved branch classes & teachers
  const todayTeacherIds = Array.from(new Set(allTodaysLessons.map((l) => l.teacherId).filter(Boolean)));
  const thisBranchTodayClassIds = Array.from(
    new Set(thisBranchTodaysLessons.map((l) => l.classId).filter((id): id is number => id != null))
  );
  const realTodayBranchLessonIds = Array.from(
    new Set(
      thisBranchTodaysLessons
        .filter((l) => getAlgiersDateInfo(l._dbStartsAt ?? l.startsAt).dateStr === todayInfo.dateStr)
        .map((l) => l.id)
    )
  );

  const [teacherLessonBranchPairs, hydratedBranchClasses, todayLessonAttendances, todayLessonCatchUps] =
    await Promise.all([
      todayTeacherIds.length > 0
        ? prisma.lesson.groupBy({
            by: ["teacherId", "branchId"],
            where: { teacherId: { in: todayTeacherIds } },
          })
        : Promise.resolve([]),
      thisBranchTodayClassIds.length > 0
        ? prisma.class.findMany({
            where: { id: { in: thisBranchTodayClassIds } },
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
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
                                  payerHistory: { orderBy: { effectiveFrom: "asc" } },
                                },
                              },
                              vouchers: {
                                where: { isVoided: false, isRefund: false },
                                include: { refunds: true },
                              },
                              attendances: {
                                where: { lesson: { isFree: false } },
                                include: {
                                  lesson: {
                                    select: {
                                      id: true,
                                      startsAt: true,
                                      isFree: true,
                                      classId: true,
                                      lessonGroups: { select: { classId: true } },
                                    },
                                  },
                                },
                              },
                              catchUpAttendances: {
                                include: {
                                  missedLesson: {
                                    select: {
                                      id: true,
                                      startsAt: true,
                                      isFree: true,
                                      isTeacherAbsent: true,
                                      classId: true,
                                      lessonGroups: { select: { classId: true } },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                      catchUpAttendances: {
                        select: { missedLessonId: true },
                      },
                    },
                  },
                  transfersFrom: true,
                  transfersTo: true,
                  payerHistory: { orderBy: { effectiveFrom: "asc" } },
                },
              },
              vouchers: {
                where: { isVoided: false },
                include: {
                  refunds: true,
                },
              },
              lessons: {
                select: {
                  id: true,
                  startsAt: true,
                  isFree: true,
                  attendances: {
                    select: {
                      studentId: true,
                      status: true,
                      isRevisionVisitor: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      realTodayBranchLessonIds.length > 0
        ? prisma.attendance.findMany({
            where: { lessonId: { in: realTodayBranchLessonIds } },
            select: { lessonId: true, studentId: true, status: true },
          })
        : Promise.resolve([]),
      realTodayBranchLessonIds.length > 0
        ? prisma.catchUpAttendance.findMany({
            where: { catchUpLessonId: { in: realTodayBranchLessonIds } },
            select: { catchUpLessonId: true, studentId: true },
          })
        : Promise.resolve([]),
    ]);

  const teacherBranchesMap = new Map<string, Set<number>>();
  for (const pair of teacherLessonBranchPairs) {
    if (!pair.teacherId) continue;
    let set = teacherBranchesMap.get(pair.teacherId);
    if (!set) {
      set = new Set<number>();
      teacherBranchesMap.set(pair.teacherId, set);
    }
    set.add(pair.branchId);
  }

  const hydratedClassMap = new Map(hydratedBranchClasses.map((c) => [c.id, c]));

  const todayAttByLesson = new Map<number, Array<{ studentId: string; status: string }>>();
  for (const att of todayLessonAttendances) {
    const arr = todayAttByLesson.get(att.lessonId);
    if (arr) arr.push({ studentId: att.studentId, status: att.status });
    else todayAttByLesson.set(att.lessonId, [{ studentId: att.studentId, status: att.status }]);
  }

  const todayCatchUpByLesson = new Map<number, Array<{ studentId: string }>>();
  for (const cu of todayLessonCatchUps) {
    const arr = todayCatchUpByLesson.get(cu.catchUpLessonId);
    if (arr) arr.push({ studentId: cu.studentId });
    else todayCatchUpByLesson.set(cu.catchUpLessonId, [{ studentId: cu.studentId }]);
  }

  // 1. Process Upcoming Lessons data (strictly today's lessons across branches)
  const upcomingLessonsData: DashboardLessonItem[] = allTodaysLessons.map(
    (l) => {
      const otherBranchesSet = new Set<string>();
      l.teacher.TeacherBranch.forEach((tb) => {
        if (tb.branchId !== l.branchId) {
          const bName = branchNameById.get(tb.branchId);
          if (bName) otherBranchesSet.add(bName);
        }
      });
      const lessonBranches = teacherBranchesMap.get(l.teacher.id);
      if (lessonBranches) {
        lessonBranches.forEach((bId) => {
          if (bId !== l.branchId) {
            const bName = branchNameById.get(bId);
            if (bName) otherBranchesSet.add(bName);
          }
        });
      }

      const lessonHostBranchId = l.branchId || (l.classroom as any)?.branchId;
      const canTakeAttendance =
        session.isOwner ||
        canUserAccessBranch(session.rawRole, session.branchIds, lessonHostBranchId);

      const isVisitingGroup = Boolean(
        l.class.branchId &&
        (l.branchId === activeBranchId || (l.classroom as any)?.branchId === activeBranchId) &&
        l.class.branchId !== activeBranchId
      );
      const isHostedOut = Boolean(
        l.class.branchId &&
        l.class.branchId === activeBranchId &&
        l.branchId !== activeBranchId
      );

      return {
        id: l.id,
        branchId: l.branchId,
        branchName: branchNameById.get(l.branchId) || `Siège #${l.branchId}`,
        homeBranchName: l.class.branchId ? branchNameById.get(l.class.branchId) : undefined,
        startsAt: new Date(l.startsAt).toISOString(),
        endsAt: new Date(l.endsAt).toISOString(),
        dateStr: l.instanceDate || todayInfo.dateStr,
        className: l.class.name,
        teacherName: l.teacher.name,
        classroomName: l.classroom?.name || "",
        isExtra: Boolean(l.isExtra),
        isCatchUp: Boolean(l.isCatchUp),
        isFree: Boolean(l.isFree),
        otherBranches: Array.from(otherBranchesSet),
        canTakeAttendance,
        isVisitingGroup,
        isHostedOut,
      };
    }
  );

  // 2. Process Students to Watch data (payment-reminder nudge for students having a lesson today at THIS branch)
  const studentsToWatchMap = new Map<string, StudentToWatchItem>();

  for (const lesson of thisBranchTodaysLessons) {
    const cls = hydratedClassMap.get(lesson.classId);
    if (!cls) continue;
    const timeSlot = `${new Date(lesson.startsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    })} - ${new Date(lesson.endsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    })}`;

    for (const enr of cls.enrollments) {
      if ((enr as any).status && (enr as any).status !== "ACTIVE") {
        continue;
      }
      const key = `${enr.studentId}-${cls.id}`;
      if (studentsToWatchMap.has(key)) continue;

      const student = enr.student;
      const studentVouchers = cls.vouchers.filter(
        (v) => v.studentId === student.id
      );
      const tuitionVouchers = studentVouchers.filter(
        (v) => v.paymentType === "TUITION_4SESSION"
      );

      const payerId = student.family?.payerStudentId;
      const hasPayerSibling = Boolean(
        payerId &&
        payerId !== student.id
      );

      // Sibling discount applies ONLY if designated payer sibling is actively enrolled in THIS class
      const isPayerInThisClass = Boolean(
        hasPayerSibling &&
        (student.family as any)?.payerStudent?.enrollments?.some(
          (pe: any) => (pe.classId === cls.id || pe.class?.id === cls.id) && (pe.status === "ACTIVE" || !pe.status)
        )
      );

      const studentAtts: Array<{ lessonId: number; status: string }> = [];
      cls.lessons.forEach((l) => {
        const att = l.attendances.find(
          (a) => a.studentId === student.id && !(a as any).isRevisionVisitor
        );
        if (att) {
          studentAtts.push({ lessonId: l.id, status: att.status });
        }
      });

      const enrPayerStatus = (enr as any).payerStatus || (student as any).payerStatus || "NORMAL";
      const isFormation = Boolean((cls as any).isFormation || (cls as any).FormationLevel || (cls as any).formationLevelId);

      const classCatchUps = ((student as any).catchUpAttendances || []).filter(
        (cu: any) => cls.lessons.some((l) => l.id === cu.missedLessonId)
      );

      const payerCredit = isPayerInThisClass && (student.family as any)?.payerStudent
        ? resolvePayerCredit({
            payerStudent: (student.family as any).payerStudent,
            classId: cls.id,
            classPricePerCycle: Number(cls.pricePerCycle || 0),
            isFormation,
          })
        : null;

      const siblingDiscountPct = isPayerInThisClass
        ? Number((student.family as any)?.discountPercentage ?? 50)
        : 0;
      const isSiblingWaived100 = isPayerInThisClass && siblingDiscountPct >= 100;
      const isSiblingDiscount = Boolean(
        isPayerInThisClass && (!isSiblingWaived100 || payerCredit?.isPayerActiveAndPaid)
      );

      const enrDiscountType = (enr as any).discountType || null;
      const enrDiscountValue = (enr as any).discountValue != null ? Number((enr as any).discountValue) : null;

      const creditMetrics = computeStudentCreditAndSessions({
        pricePerCycle: Number(cls.pricePerCycle || 0),
        isFormation,
        payerStatus: enrPayerStatus,
        discountType: enrDiscountType,
        discountValue: enrDiscountValue,
        payerHistory: (enr as any).payerHistory || [],
        siblingDiscountPercentage: siblingDiscountPct,
        isSiblingWaived: isSiblingWaived100,
        isPayerActiveAndPaid: Boolean(payerCredit?.isPayerActiveAndPaid),
        payerRemainingCredit: isSiblingWaived100 ? payerCredit?.netSessions : undefined,
        tuitionVouchers,
        transfersIn: enr.transfersTo,
        transfersOut: enr.transfersFrom,
        creditResetOffset: (enr as any).creditResetOffset,
        attendances: studentAtts,
        catchUps: classCatchUps,
        lessons: cls.lessons as any,
        enrolledAt: enr.enrolledAt,
        enrollmentStatus: enr.status,
      });

      if (
        creditMetrics.isNonPayer ||
        (creditMetrics.isDiscounted && creditMetrics.effectiveCycleFee === 0) ||
        (creditMetrics.status as string) === "SIBLING_WAIVED"
      ) {
        continue;
      }

      const remainingSessions =
        !creditMetrics.isDiscounted && creditMetrics.isSiblingWaived && payerCredit
          ? payerCredit.netSessions
          : creditMetrics.netSessions;
      const status: "PAID" | "EXPIRING" | "UNPAID" =
        creditMetrics.status === "UNPAID"
          ? "UNPAID"
          : creditMetrics.status === "EXPIRING"
          ? "EXPIRING"
          : "PAID";

      studentsToWatchMap.set(key, {
        studentId: student.id,
        studentName: student.name,
        phone: student.phone,
        classId: cls.id,
        className: cls.name,
        teacherName: lesson.teacher.name,
        lessonTime: timeSlot,
        remainingSessions,
        status,
        isSchoolFeesOnly: creditMetrics.isSchoolFeesOnly,
        isDiscounted: creditMetrics.isDiscounted,
        discountLabel: creditMetrics.isDiscounted
          ? formatDiscountBadgeLabel(enrDiscountType, enrDiscountValue, "fr")
          : null,
        payerStatus: enrPayerStatus,
        studentData: {
          id: student.id,
          name: student.name,
          phone: student.phone,
          registeredBranchId: student.registeredBranchId,
          enrollments: [
            {
              id: enr.id,
              classId: cls.id,
              payerStatus: enrPayerStatus,
              discountType: enrDiscountType,
              discountValue: enrDiscountValue,
              discountReason: (enr as any).discountReason || null,
            },
          ],
          family: student.family
            ? {
                payerStudentId: student.family.payerStudentId,
                discountPercentage: (student.family as any).discountPercentage
                  ? Number((student.family as any).discountPercentage)
                  : 50,
              }
            : null,
        },
        classData: {
          id: cls.id,
          name: cls.name,
          pricePerCycle: cls.pricePerCycle ? Number(cls.pricePerCycle) : null,
          inscriptionFee: Number(cls.inscriptionFee),
          bookFee: cls.bookFee ? Number(cls.bookFee) : null,
          branchId: cls.branchId,
          hasBooks: cls.hasBooks,
          isFormation: cls.isFormation,
        },
      });
    }
  }

  const studentsToWatchList = Array.from(studentsToWatchMap.values()).sort(
    (a, b) => a.remainingSessions - b.remainingSessions
  );

  // 3. Process Today's Attendance Chart data (scoped strictly to THIS branch)
  const todayAttendanceSummary = buildTodayAttendanceSummary({
    lessons: thisBranchTodaysLessons.map((l) => {
      const cls = hydratedClassMap.get(l.classId);
      return {
        id: l.id,
        startsAt: l.startsAt,
        _dbStartsAt: l._dbStartsAt,
        isTeacherAbsent: l.isTeacherAbsent,
        class: {
          name: l.class.name,
          enrollments: cls?.enrollments.map((e) => ({ status: e.status })) ?? [],
        },
        attendances: todayAttByLesson.get(l.id) ?? [],
        catchUpVisitsHosted: todayCatchUpByLesson.get(l.id) ?? [],
      };
    }),
    branchId: activeBranchId,
    now,
  });

  return (
    <div className="p-4 md:p-6 flex gap-6 flex-col lg:flex-row">
      {/* LEFT (2/3) */}
      <div className="w-full lg:w-2/3 flex flex-col gap-6">
        {/* SUMMARY CARDS (streamed independently via Suspense) */}
        <div className="flex gap-4 justify-between flex-wrap">
          <Suspense fallback={<UserCardSkeleton />}>
            <UserCard type="student" branchId={activeBranchId} />
          </Suspense>
          <Suspense fallback={<UserCardSkeleton />}>
            <UserCard type="teacher" branchId={activeBranchId} />
          </Suspense>
          <Suspense fallback={<UserCardSkeleton />}>
            <UserCard type="parent" branchId={activeBranchId} />
          </Suspense>
          <Suspense fallback={<UserCardSkeleton />}>
            <UserCard type="admin" branchId={activeBranchId} />
          </Suspense>
        </div>

        {/* STUDENTS TO WATCH (PAYMENT REMINDER NUDGE) */}
        <StudentsToWatch students={serializeForClient(studentsToWatchList)} />

        {/* TODAY'S ATTENDANCE CHART */}
        <TodayAttendanceChart
          initialSummary={todayAttendanceSummary}
          branchName={branchName}
        />
      </div>

      {/* RIGHT (1/3) */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        {/* ANNOUNCEMENTS PANEL (streamed independently via Suspense) */}
        <Suspense fallback={<AnnouncementsSkeleton />}>
          <Announcements branchId={activeBranchId} />
        </Suspense>

        {/* UPCOMING LESSONS (REAL-TIME FOLLOWS DAY) */}
        <UpcomingLessons
          initialLessons={upcomingLessonsData}
          activeBranchId={activeBranchId}
          activeBranchName={branchName}
        />
      </div>
    </div>
  );
};

export default AdminPage;
