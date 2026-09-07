import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { Prisma, Student } from "@prisma/client";
import ChildSwitcher from "@/components/ChildSwitcher";
import PageHeader from "@/components/PageHeader";



const AttendanceStatCard = ({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border flex items-start gap-4">
    <div className={`p-3 rounded-lg ${color}`}>
      <Image src={icon} alt={label} width={24} height={24} />
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  </div>
);

const RecentAbsences = ({ absences }: { absences: any[] }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border">
    <h2 className="text-xl font-bold text-gray-800 mb-4">آخر الغيابات</h2>
    <div className="space-y-3">
      {absences.length > 0 ? (
        absences.map((absence) => (
          <div
            key={absence.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
          >
            <div>
              <p className="font-semibold text-gray-700">
                {absence.lesson.subject.name}
              </p>
              <p className="text-xs text-gray-500">
                القسم: {absence.lesson.class.name}
              </p>
            </div>
            <p className="text-sm text-gray-600">
              {new Date(absence.date).toLocaleDateString("en-GB")}
            </p>
          </div>
        ))
      ) : (
        <p className="text-center text-gray-500 py-4">
          لا توجد غيابات مسجلة.
        </p>
      )}
    </div>
  </div>
);

const AttendanceListPage = async (
  props: {
    searchParams: Promise<{ studentId?: string; search?: string }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const currentUserId = userId;

  if (role === "student" || role === "parent") {
    let activeStudentId: string | undefined = undefined;
    let children: Student[] = [];

    if (role === "student") {
      activeStudentId = currentUserId!;
    } else {
      children = await prisma.student.findMany({
        where: { parentId: currentUserId! },
        orderBy: { name: "asc" },
      });

      activeStudentId = searchParams.studentId;
      if (!activeStudentId) {
        activeStudentId = children[0]?.id;
      }
    }

    const attendanceRecords = activeStudentId
      ? await prisma.attendance.findMany({
          where: { studentId: activeStudentId },
          include: {
            lesson: {
              include: {
                subject: true,
                class: true,
              },
            },
          },
          orderBy: { date: "desc" },
        })
      : [];

    const totalRecords = attendanceRecords.length;
    const totalAbsences = attendanceRecords.filter((r) => !r.present).length;
    const attendanceRate =
      totalRecords > 0
        ? Math.round(((totalRecords - totalAbsences) / totalRecords) * 100)
        : 100;
    const recentAbsences = attendanceRecords
      .filter((r) => !r.present)
      .slice(0, 5);

    return (
      <div className="p-4 md:p-6">
        {role === "parent" && (
          <div className="mb-6">
            <ChildSwitcher
              students={children}
              activeStudentId={activeStudentId}
            />
          </div>
        )}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">تقرير الحضور</h1>
          <p className="text-gray-500 mt-1">
            نظرة عامة على سجلات الحضور والغياب.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <AttendanceStatCard
            label="نسبة الحضور"
            value={`${attendanceRate}%`}
            icon="/attendance.png"
            color="bg-green-100"
          />
          <AttendanceStatCard
            label="إجمالي الغيابات"
            value={String(totalAbsences)}
            icon="/close.png"
            color="bg-red-100"
          />
        </div>

        <RecentAbsences absences={recentAbsences} />
      </div>
    );
  }

  const { search } = searchParams;
  const whereClause: Prisma.ClassWhereInput = {};

  if (role === "teacher") {
    whereClause.teachers = {
      some: {
        id: userId!,
      },
    };
  }

  if (search) {
    whereClause.name = {
      contains: search,
      mode: "insensitive",
    };
  }

  const classes = await prisma.class.findMany({
    where: whereClause,
    include: {
      _count: {
        select: { students: true },
      },
      supervisor: {
        select: {
          name: true,
          surname: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="اختر قسماً"
        searchPlaceholder="ابحث عن قسم..."
        createAction={null}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
        {classes.map((classItem) => (
          <Link
            href={`/list/attendance/class/${classItem.id}`}
            key={classItem.id}
            className="block bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-400 transition-all duration-200"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <Image
                  src="/class.png"
                  alt="رمز القسم"
                  width={24}
                  height={24}
                />
              </div>
              <h2 className="text-xl font-bold text-gray-800">
                {classItem.name}
              </h2>
            </div>
            <div className="text-sm space-y-2 text-gray-600">
              <p>
                <strong>المشرف:</strong>{" "}
                {classItem.supervisor
                  ? `${classItem.supervisor.name} ${classItem.supervisor.surname}`
                  : "غير متوفر"}
              </p>
              <p>
                <strong>عدد التلاميذ:</strong> {classItem._count.students}
              </p>
            </div>
          </Link>
        ))}
        {classes.length === 0 && (
          <p className="col-span-full text-center text-gray-500 py-8">
            {search
              ? `لم يتم العثور على أقسام تحتوي "${search}".`
              : role === "teacher"
              ? "لم يتم تعيينك لأي قسم بعد."
              : "لا توجد أقسام متاحة حالياً."}
          </p>
        )}
      </div>
    </div>
  );
};

export default AttendanceListPage;
