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

const AdminPage = async () => {
  const session = await getAuthSession();
  const activeBranchId = await getActiveBranchId();

  // Active branch details
  const branch = await prisma.branch.findUnique({
    where: { id: activeBranchId },
    select: { id: true, name: true },
  });
  const branchName = branch?.name || `Siège #${activeBranchId}`;

  // Time boundary for today
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

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
          class: {
            isFormation: false,
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
          vouchers: true,
          lessons: {
            select: {
              id: true,
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

  // Helper to extract date and weekday information in Africa/Algiers timezone
  const getAlgiersDateInfo = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "long",
    }).formatToParts(date);
    const m: Record<string, string> = {};
    parts.forEach((p) => {
      m[p.type] = p.value;
    });
    return {
      year: parseInt(m.year, 10),
      month: parseInt(m.month, 10),
      day: parseInt(m.day, 10),
      hour: parseInt(m.hour, 10),
      minute: parseInt(m.minute, 10),
      weekday: (m.weekday || "").toUpperCase(),
      dateStr: `${m.year}-${m.month}-${m.day}`,
    };
  };

  const todayInfo = getAlgiersDateInfo(now);

  const allTodaysLessons = candidateLessons
    .filter((l) => {
      const isOneOff = Boolean(
        l.isExtra || l.isCatchUp || l.class.isFormation
      );
      const lInfo = getAlgiersDateInfo(new Date(l.startsAt));
      if (isOneOff) {
        return lInfo.dateStr === todayInfo.dateStr;
      }
      return lInfo.weekday === todayInfo.weekday;
    })
    .map((l) => {
      const isOneOff = Boolean(
        l.isExtra || l.isCatchUp || l.class.isFormation
      );
      if (!isOneOff) {
        const lInfo = getAlgiersDateInfo(new Date(l.startsAt));
        const durationMs =
          new Date(l.endsAt).getTime() - new Date(l.startsAt).getTime();
        // Project to today in Africa/Algiers (UTC hour = Algiers hour - 1)
        const projectedStartsAt = new Date(
          Date.UTC(todayInfo.year, todayInfo.month - 1, todayInfo.day, lInfo.hour - 1, lInfo.minute, 0, 0)
        );
        const projectedEndsAt = new Date(
          projectedStartsAt.getTime() + durationMs
        );
        return {
          ...l,
          startsAt: projectedStartsAt,
          endsAt: projectedEndsAt,
        };
      }
      return l;
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );

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
      const key = `${enr.studentId}-${cls.id}`;
      if (studentsToWatchMap.has(key)) continue;

      const student = enr.student;
      const studentVouchers = cls.vouchers.filter(
        (v) => v.studentId === student.id && !v.isVoided
      );
      const tuitionVouchers = studentVouchers.filter(
        (v) => v.paymentType === "TUITION_4SESSION"
      );

      const isWaivedSibling = Boolean(
        student.family &&
          student.family.payerStudentId &&
          student.family.payerStudentId !== student.id
      );

      const cyclePrice = Number(cls.pricePerCycle || 0);
      const lessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
      let purchasedSessions = 0;
      if (isWaivedSibling) {
        purchasedSessions = 16;
      } else if (lessonPrice > 0) {
        const totalPaidTuition = tuitionVouchers.reduce(
          (sum, v) => sum + Math.max(0, Number(v.amount || 0)),
          0
        );
        purchasedSessions = Math.floor(totalPaidTuition / lessonPrice);
      } else {
        purchasedSessions = tuitionVouchers.length * 4;
      }
      const transferredOut = enr.transfersFrom.reduce(
        (sum, t) => sum + t.transferredSessions,
        0
      );
      const transferredIn = enr.transfersTo.reduce(
        (sum, t) => sum + t.transferredSessions,
        0
      );

      let attendedSessions = 0;
      cls.lessons.forEach((l) => {
        if (!l.isFree) {
          const att = l.attendances.find((a) => a.studentId === student.id);
          if (att && att.status === "PRESENT") {
            attendedSessions++;
          }
        }
      });

      const remainingSessions =
        purchasedSessions + transferredIn - transferredOut - attendedSessions;

      let status: "PAID" | "EXPIRING" | "UNPAID" = "PAID";
      if (remainingSessions <= 0) {
        status = "UNPAID";
      } else if (remainingSessions === 1) {
        status = "EXPIRING";
      }

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
            ? { payerStudentId: student.family.payerStudentId }
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
      const absent = l.attendances.filter((a) => a.status === "ABSENT").length;
      const totalRecorded = present + absent;
      const rate = totalRecorded > 0 ? (present / totalRecorded) * 100 : 0;

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
        total: totalRecorded,
        rate,
      };
    });

  const totalPresent = lessonsAttendanceData.reduce((sum, item) => sum + item.present, 0);
  const totalAbsent = lessonsAttendanceData.reduce((sum, item) => sum + item.absent, 0);
  const totalExpected = thisBranchTodaysLessons.reduce((sum, l) => sum + l.class.enrollments.length, 0);

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
        <StudentsToWatch students={studentsToWatchList} />

        {/* TODAY'S ATTENDANCE CHART */}
        <TodayAttendanceChart
          totalPresent={totalPresent}
          totalAbsent={totalAbsent}
          totalExpected={totalExpected}
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
