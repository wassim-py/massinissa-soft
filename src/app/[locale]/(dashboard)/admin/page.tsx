import prisma from "@/lib/prisma";
import Announcements from "@/components/Announcements";
import UserCard from "@/components/UserCard";
import UpcomingLessons, {
  DashboardLessonItem,
} from "@/components/dashboard/UpcomingLessons";
import StudentsToWatch, {
  StudentToWatchItem,
} from "@/components/dashboard/StudentsToWatch";
import TodayAttendanceChart, {
  TodayLessonAttendanceData,
} from "@/components/dashboard/TodayAttendanceChart";
import { getActiveBranchId, getAuthSession } from "@/lib/auth";
import { computeStudentCreditAndSessions } from "@/lib/studentBilling";
import {
  serializeForClient,
  getAlgiersDateInfo,
  resolveRecurringLessonsForDate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const AdminPage = async () => {
  const session = await getAuthSession();
  const activeBranchId = await getActiveBranchId();

  // Active branch details
  const branch = await prisma.branch.findUnique({
    where: { id: activeBranchId },
    select: { id: true, name: true },
  });
  const branchName = branch?.name || `Siège #${activeBranchId}`;

  const now = new Date();
  const todayInfo = getAlgiersDateInfo(now);

  // Time boundary for today in Africa/Algiers (00:00:00 to 23:59:59.999 Algiers = UTC-1h)
  const startOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, -1, 0, 0, 0)
  );
  const endOfToday = new Date(
    Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, 22, 59, 59, 999)
  );

  // Fetch today's lessons: dated one-offs occurring today + recurring normal lessons across all branches
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
          class: {
            isCompleted: false,
          },
        },
      ],
    },
    include: {
      branch: {
        select: { id: true, name: true },
      },
      class: {
        include: {
          enrollments: {
            include: {
              student: {
                include: {
                  family: true,
                },
              },
              transfersFrom: true,
              transfersTo: true,
            },
          },
          vouchers: {
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
                },
              },
            },
          },
        },
      },
      classroom: true,
      teacher: {
        include: {
          TeacherBranch: {
            include: { Branch: true },
          },
          lessons: {
            select: {
              branchId: true,
              branch: { select: { name: true } },
            },
          },
        },
      },
      attendances: true,
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  const allTodaysLessons = resolveRecurringLessonsForDate(candidateLessons, now);

  // Today's lessons strictly for THIS branch
  const thisBranchTodaysLessons = allTodaysLessons.filter(
    (l) => l.branchId === activeBranchId
  );

  // 1. Process Upcoming Lessons data (strictly today's lessons across branches)
  const upcomingLessonsData: DashboardLessonItem[] = allTodaysLessons.map(
    (l) => {
      const otherBranchesSet = new Set<string>();
      l.teacher.TeacherBranch.forEach((tb) => {
        if (tb.branchId !== l.branchId && tb.Branch?.name) {
          otherBranchesSet.add(tb.Branch.name);
        }
      });
      l.teacher.lessons.forEach((ol) => {
        if (ol.branchId !== l.branchId && ol.branch?.name) {
          otherBranchesSet.add(ol.branch.name);
        }
      });

      const canTakeAttendance =
        session.isOwner || l.branchId === activeBranchId;

      return {
        id: l.id,
        branchId: l.branchId,
        branchName: l.branch?.name || `Siège #${l.branchId}`,
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
      };
    }
  );

  // 2. Process Students to Watch data (payment-reminder nudge for students having a lesson today at THIS branch)
  const studentsToWatchMap = new Map<string, StudentToWatchItem>();

  for (const lesson of thisBranchTodaysLessons) {
    const cls = lesson.class;
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
      if ((enr as any).status === "SUSPENDED" || (enr as any).status === "UNENROLLED" || (enr as any).status === "TRANSFERRED") {
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

      const isSiblingDiscount = Boolean(
        student.family &&
          student.family.payerStudentId &&
          student.family.payerStudentId !== student.id
      );
      const siblingDiscountPct = isSiblingDiscount
        ? Number((student.family as any)?.discountPercentage ?? 50)
        : 0;
      const isSiblingWaived100 = siblingDiscountPct >= 100;

      const studentAtts: Array<{ lessonId: number; status: string }> = [];
      cls.lessons.forEach((l) => {
        const att = l.attendances.find((a) => a.studentId === student.id);
        if (att) {
          studentAtts.push({ lessonId: l.id, status: att.status });
        }
      });

      const enrPayerStatus = (enr as any).payerStatus || (student as any).payerStatus || "NORMAL";
      const isFormation = Boolean((cls as any).isFormation || (cls as any).FormationLevel || (cls as any).formationLevelId);

      const creditMetrics = computeStudentCreditAndSessions({
        pricePerCycle: Number(cls.pricePerCycle || 0),
        isFormation,
        payerStatus: enrPayerStatus,
        siblingDiscountPercentage: siblingDiscountPct,
        isSiblingWaived: isSiblingWaived100,
        tuitionVouchers,
        transfersIn: enr.transfersTo,
        transfersOut: enr.transfersFrom,
        creditResetOffset: (enr as any).creditResetOffset,
        attendances: studentAtts,
        lessons: cls.lessons as any,
      });

      if (creditMetrics.isNonPayer || creditMetrics.status === "SIBLING_WAIVED") {
        continue;
      }

      const remainingSessions = creditMetrics.netSessions;
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
        studentData: {
          id: student.id,
          name: student.name,
          phone: student.phone,
          registeredBranchId: student.registeredBranchId,
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
  const lessonsAttendanceData: TodayLessonAttendanceData[] =
    thisBranchTodaysLessons.map((l) => {
      const present = l.attendances.filter((a) => a.status === "PRESENT").length;
      const unexcused = l.attendances.filter((a) => a.status === "ABSENT").length;
      const excused = l.attendances.filter((a) => a.status === "NOT_DEFINED").length;
      const absent = unexcused + excused;
      const totalRecorded = present + absent;
      const rate = totalRecorded > 0 ? (present / totalRecorded) * 100 : 0;
      const enrolled = l.class.enrollments.filter(
        (e: any) => e.status === "ACTIVE" || !e.status
      ).length;

      const timeSlot = `${new Date(l.startsAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Africa/Algiers",
      })}`;

      return {
        lessonId: l.id,
        className: l.class.name,
        timeSlot,
        present,
        absent,
        excused,
        enrolled,
        total: totalRecorded,
        rate,
        isTeacherAbsent: Boolean(l.isTeacherAbsent),
      };
    });

  const recordedLessons = lessonsAttendanceData.filter((item) => item.total > 0);
  const totalPresent = lessonsAttendanceData.reduce((sum, item) => sum + item.present, 0);
  const totalAbsent = lessonsAttendanceData.reduce((sum, item) => sum + item.absent, 0);
  const totalExcused = lessonsAttendanceData.reduce((sum, item) => sum + (item.excused || 0), 0);
  const totalExpectedRecorded = recordedLessons.reduce((sum, item) => sum + (item.enrolled || item.total), 0);
  const totalExpected = thisBranchTodaysLessons.reduce(
    (sum, l) => sum + l.class.enrollments.filter((e: any) => e.status === "ACTIVE" || !e.status).length,
    0
  );

  const recordedTotal = totalPresent + totalAbsent;
  const overallRate =
    recordedTotal > 0 ? (totalPresent / recordedTotal) * 100 : 0;

  return (
    <div className="p-4 md:p-6 flex gap-6 flex-col lg:flex-row">
      {/* LEFT (2/3) */}
      <div className="w-full lg:w-2/3 flex flex-col gap-6">
        {/* SUMMARY CARDS */}
        <div className="flex gap-4 justify-between flex-wrap">
          <UserCard type="student" branchId={activeBranchId} />
          <UserCard type="teacher" branchId={activeBranchId} />
          <UserCard type="parent" branchId={activeBranchId} />
          <UserCard type="admin" branchId={activeBranchId} />
        </div>

        {/* STUDENTS TO WATCH (PAYMENT REMINDER NUDGE) */}
        <StudentsToWatch students={serializeForClient(studentsToWatchList)} />

        {/* TODAY'S ATTENDANCE CHART */}
        <TodayAttendanceChart
          totalPresent={totalPresent}
          totalAbsent={totalAbsent}
          totalExcused={totalExcused}
          totalExpected={totalExpected}
          totalExpectedRecorded={totalExpectedRecorded}
          overallRate={overallRate}
          lessonsData={lessonsAttendanceData}
          branchName={branchName}
        />
      </div>

      {/* RIGHT (1/3) */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        {/* ANNOUNCEMENTS PANEL (EXACT POSITION AS TODAY) */}
        <Announcements branchId={activeBranchId} />

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
