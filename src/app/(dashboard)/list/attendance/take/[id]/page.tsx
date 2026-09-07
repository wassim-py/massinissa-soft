import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import AttendanceRoster from "@/components/forms/AttendanceRoster";
import TableSearch from "@/components/TableSearch";
import BackButton from "@/components/BackButton";



// This is the Server Component that fetches all the necessary data for taking attendance.
const TakeAttendancePage = async (
  props: { 
      params: Promise<{ id: string }>,
      searchParams: Promise<{ [key: string]: string | undefined }>
  }
) => {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  // Authorization check
  if (role !== 'admin' && role !== 'teacher') {
      return <div className="p-4">ليست لديك الصلاحية للوصول إلى هذه الصفحة.</div>;
  }

  const lessonId = parseInt(params.id);
  const searchQuery = searchParams.search;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      class: true,
      subject: true,
      teacher: true,
    },
  });

  if (!lesson) {
    notFound();
  }

  // UPDATED: The Prisma query now includes the 'refunds' for each payment
  const studentsWithHistory = await prisma.student.findMany({
    where: {
      classes: {
        some: { id: lesson.class.id }
      },
      ...(searchQuery && {
        OR: [
            { name: { contains: searchQuery, mode: 'insensitive' } },
            { surname: { contains: searchQuery, mode: 'insensitive' } },
        ]
      })
    },
    include: {
      payments: {
        where: { classId: lesson.class.id },
        orderBy: { date: 'desc' },
        // This nested include is the fix that resolves the TypeScript error
        include: {
            refunds: true
        }
      },
      attendances: {
        where: { lesson: { classId: lesson.class.id } },
      }
    },
    orderBy: { name: 'asc' }
  });

  // Fetch today's attendance records to pre-fill the form
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todaysAttendance = await prisma.attendance.findMany({
    where: {
      lessonId: lessonId,
      date: { gte: todayStart, lte: todayEnd }
    }
  });

  return (
    <div className="bg-white p-6 rounded-lg m-4 mt-0">
      <BackButton/>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b pb-4 mb-6 gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">ورقة حضور القسم اليومية</h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 mt-2">
                <span><strong>القسم:</strong> {lesson.class.name}</span>
                <span><strong>السعر:</strong> {lesson.class.price} DZD</span>
                <span><strong>المادة:</strong> {lesson.subject.name}</span>
                <span><strong>الأستاذ:</strong> {`${lesson.teacher.name} ${lesson.teacher.surname}`}</span>
                <span><strong>التاريخ:</strong> {new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
        </div>
        <div className="w-full md:w-auto">
            <TableSearch placeholder="ابحث عن تلميذ..." />
        </div>
      </div>

      <AttendanceRoster
        lesson={lesson}
        students={studentsWithHistory as any} // Cast as any to satisfy the complex nested type
        existingRecords={todaysAttendance}
      />
    </div>
  );
};

export default TakeAttendancePage;
