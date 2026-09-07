import FormContainer from "@/components/FormContainer";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { auth } from "@/lib/auth";
import { Course, Prisma, Student, Subject, Teacher } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";



// Define a more complete type for our course data
type CourseDetails = Course & {
  subject: Subject;
  teacher: Teacher;
  _count: {
    files: number;
  };
};

const CoursesPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  // --- Base Query Construction ---
  const query: Prisma.CourseWhereInput = {};

  // --- Search Logic ---
  if (search) {
    query.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { subject: { name: { contains: search, mode: "insensitive" } } },
      { teacher: { name: { contains: search, mode: "insensitive" } } },
      { teacher: { surname: { contains: search, mode: "insensitive" } } },
    ];
  }

  // --- Role-based Filtering Logic ---
  const teacherToChildrenMap = new Map<string, string[]>();

  if (role === "teacher") {
    query.teacherId = userId!;
  } else if (role === "student" || role === "parent") {
    let targetStudentIds: string[] = [];

    if (role === "student") {
      targetStudentIds = [userId!];
    } else {
      const children = await prisma.student.findMany({
        where: { parentId: userId! },
        select: { id: true },
      });
      targetStudentIds = children.map((c) => c.id);
    }

    if (targetStudentIds.length > 0) {
      const classesWithTeachers = await prisma.class.findMany({
        where: { students: { some: { id: { in: targetStudentIds } } } },
        include: { teachers: { select: { id: true } } },
      });

      const allTeacherIds = new Set<string>();
      classesWithTeachers.forEach((c) =>
        c.teachers.forEach((t) => allTeacherIds.add(t.id))
      );

      if (allTeacherIds.size > 0) {
        query.teacherId = { in: Array.from(allTeacherIds) };
      } else {
        query.id = -1; // No relevant teachers found
      }

      // For parents, build the map to show which child's course it is
      if (role === "parent") {
        const studentClasses = await prisma.class.findMany({
            where: { students: { some: { id: { in: targetStudentIds } } } },
            include: { students: { where: { id: { in: targetStudentIds } }, select: { id: true, name: true } }, teachers: { select: { id: true } } }
        });

        studentClasses.forEach(c => {
            c.teachers.forEach(teacher => {
                const currentChildren = teacherToChildrenMap.get(teacher.id) || [];
                const newChildren = c.students.map(s => s.name);
                teacherToChildrenMap.set(teacher.id, Array.from(new Set([...currentChildren, ...newChildren])));
            });
        });
      }

    } else {
      query.id = -1; // No relevant students found
    }
  }

  // --- Data Fetching with Pagination ---
  const [courses, count] = await prisma.$transaction([
    prisma.course.findMany({
      where: query,
      include: {
        subject: true,
        teacher: true,
        files: true,
        _count: {
          select: { files: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    }),
    prisma.course.count({ where: query }),
  ]);

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      {/* REPLACED: The old header is now the new, reusable PageHeader component */}
      <PageHeader
        title="جميع الدروس"
        searchPlaceholder="ابحث حسب العنوان أو الأستاذ..."
        createAction={
          role === "admin" || role === "teacher"
            ? { table: "course", type: "create" }
            : null
        }
      />

      {/* COURSE LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {courses.map((course: CourseDetails) => {
          const canManageCourse =
            role === "admin" || (role === "teacher" && course.teacherId === userId);
            const relevantChildren = teacherToChildrenMap.get(course.teacherId);

          return (
            <div
              key={course.id}
              className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col"
            >
              {/* CARD HEADER */}
              <div className="p-6 flex justify-between items-start gap-4">
                <div className="flex-1">
                  <Link href={`/list/courses/${course.id}`}>
                    <h2 className="text-lg font-bold text-gray-800 hover:text-blue-600 transition-colors">
                      {course.title}
                    </h2>
                  </Link>
                  <p className="text-sm text-gray-500 mt-1">
                    {course.subject.name}
                  </p>
                </div>
                {canManageCourse && (
                  <div className="flex gap-2 flex-shrink-0">
                    <FormContainer table="course" type="update" data={course} />
                    <FormContainer
                      table="course"
                      type="delete"
                      id={course.id}
                    />
                  </div>
                )}
              </div>

              {/* CARD BODY */}
              <Link
                href={`/list/courses/${course.id}`}
                className="px-6 pb-6 flex-grow"
              >
                <p className="text-sm text-gray-600 h-16 line-clamp-3">
                  {course.description || "لا يوجد وصف متاح."}
                </p>
              </Link>

              {/* CARD FOOTER */}
              <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
                <div className="flex flex-col">
                  <span>
                    من طرف: {course.teacher.name} {course.teacher.surname}
                  </span>
                  {role === 'parent' && relevantChildren && (
                    <span className="text-blue-600 font-semibold mt-1">خاص بـ: {relevantChildren.join(', ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Image src="/date.png" alt="date" width={12} height={12} />
                    {new Intl.DateTimeFormat("ar-DZ").format(course.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Image
                      src="/paperclip.png"
                      alt="files"
                      width={12}
                      height={12}
                    />
                    {course._count.files} ملفات
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
         {courses.length === 0 && (
          <p className="col-span-full text-center text-gray-500 py-8">
            {search ? `لم يتم العثور على دروس بعنوان "${search}".`: "لا توجد دروس مسجلة حالياً."}
          </p>
        )}
      {/* PAGINATION */}
      <Pagination count={count} />
    </div>
  );
};

export default CoursesPage;
