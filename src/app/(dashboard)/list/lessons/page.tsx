import FormContainer from "@/components/FormContainer";
import TableSearch from "@/components/TableSearch";
import Timetable from "@/components/Timetable";
import TimetableFilters from "@/components/TimetableFilters";
import prisma from "@/lib/prisma";
import { Prisma, Lesson, Subject, Class, Teacher, Classroom } from "@prisma/client";
import { auth } from "@/lib/auth";
import BackButton from "@/components/BackButton";



// --- FIX: Define the expected shape of a lesson object for the Timetable ---
type TimetableLesson = Lesson & {
  subject: Subject;
  class: Class;
  teacher: Teacher;
  classroom: Classroom | null;
  forChildren?: string[];
};

const LessonListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  const { search, teacherId, classId } = searchParams;

  const query: Prisma.LessonWhereInput = {};
  // --- FIX: Explicitly type the 'lessons' array ---
  let lessons: TimetableLesson[] = [];

  if (role === 'parent') {
    const children = await prisma.student.findMany({
        where: { parentId: userId! },
        select: { id: true, name: true }
    });
    const childrenIds = children.map(c => c.id);

    if (childrenIds.length > 0) {
        const parentQuery: Prisma.LessonWhereInput = {
            class: { students: { some: { id: { in: childrenIds } } } }
        };
        const allLessons = await prisma.lesson.findMany({
            where: parentQuery,
            include: { subject: true, class: { include: { students: { where: { id: { in: childrenIds } }, select: { name: true } } } }, teacher: true, classroom: true }
        });
        lessons = allLessons.map(lesson => ({
            ...lesson,
            forChildren: lesson.class.students.map(s => s.name)
        }));
    }
  } else {
    if (role === 'teacher') {
        query.teacherId = userId!;
    } else if (role === 'student') {
        query.class = { students: { some: { id: userId! } } };
    } else if (teacherId && teacherId !== "all") {
        query.teacherId = teacherId;
    }

    if (classId && classId !== "all") {
        query.classId = parseInt(classId);
    }

    if (search) {
        query.OR = [
        { subject: { name: { contains: search, mode: "insensitive" } } },
        { teacher: { name: { contains: search, mode: "insensitive" } } },
        { class: { name: { contains: search, mode: "insensitive" } } },
        { classroom: { name: { contains: search, mode: "insensitive" } } },
        ];
    }
    lessons = await prisma.lesson.findMany({
        where: query,
        include: { subject: true, class: true, teacher: true, classroom: true },
        orderBy: { startTime: "asc" },
    });
  }

  const [teachers, classes, subjects, classrooms] =
    await prisma.$transaction([
      prisma.teacher.findMany({ include: { subjects: { select: { id: true } } } }),
      prisma.class.findMany({ select: { id: true, name: true } }),
      prisma.subject.findMany({ include: { teachers: { select: { id: true } } } }),
      prisma.classroom.findMany(),
    ]);

  const relatedDataForForms = { teachers, classes, subjects, classrooms };

  const lessonActions = lessons.reduce((acc, lesson) => {
    const canPerformAction = role === 'admin' || (role === 'teacher' && lesson.teacherId === userId);
    if (canPerformAction) {
        acc[lesson.id] = (
          <div className="flex justify-end gap-3">
            <FormContainer table="lesson" type="delete" id={lesson.id} />
            <FormContainer table="lesson" type="update" data={lesson} relatedData={relatedDataForForms}/>
          </div>
        );
    }
    return acc;
  }, {} as { [key: number]: React.JSX.Element });

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <BackButton/>
      {/* TOP */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h1 className="text-2xl font-semibold">الجدول الأسبوعي</h1>
        <div className="flex flex-wrap items-center gap-4">
          <TableSearch placeholder="ابحث في الجدول..." />
          {role === "admin" && (
            <>
                <TimetableFilters teachers={teachers} classes={classes} />
                <FormContainer table="lesson" type="create" relatedData={relatedDataForForms}/>
            </>
          )}
        </div>
      </div>

      {/* RENDER THE TIMETABLE */}
      <div className="mt-6">
        <Timetable
          lessons={lessons}
          actions={lessonActions}
          relatedDataForForms={relatedDataForForms}
          userRole={role!}
        />
      </div>
    </div>
  );
};

export default LessonListPage;
