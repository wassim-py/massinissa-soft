import prisma from "@/lib/prisma";
import FormModal from "./FormModal";
import { auth } from "@clerk/nextjs/server";

// UPDATED: This type now includes "workshop"
export type FormContainerProps = {
  table:
    | "teacher"
    | "student"
    | "parent"
    | "subject"
    | "class"
    | "lesson"
    | "exam"
    | "result"
    | "attendance"
    | "event"
    | "announcement"
    | "course"
    | "payment"
    | "workshop"; // ADDED
  type: "create" | "update" | "delete";
  data?: any;
  id?: number | string;
  relatedData?: any;
};

const FormContainer = async ({
  table,
  type,
  data,
  id,
  relatedData,
}: FormContainerProps) => {
  let finalRelatedData = relatedData || {};

  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const currentUserId = userId;

  if (type !== "delete" && Object.keys(finalRelatedData).length === 0) {
    switch (table) {
      case "subject":
        const subjectTeachers = await prisma.teacher.findMany({
          select: { id: true, name: true, surname: true },
        });
        finalRelatedData = { teachers: subjectTeachers };
        break;
      case "class":
        const classGrades = await prisma.grade.findMany({
          select: { id: true, level: true },
        });
        const classTeachers = await prisma.teacher.findMany({
          select: { id: true, name: true, surname: true },
        });
        finalRelatedData = { teachers: classTeachers, grades: classGrades };
        break;
      case "teacher":
        const teacherSubjects = await prisma.subject.findMany({
          select: { id: true, name: true },
        });
        const teacherClasses = await prisma.class.findMany({
          select: { id: true, name: true },
        });
        finalRelatedData = {
          subjects: teacherSubjects,
          classes: teacherClasses,
        };
        break;
      case "student":
        const studentGrades = await prisma.grade.findMany({
          select: { id: true, level: true },
        });
        const studentClasses = await prisma.class.findMany({
          include: { _count: { select: { students: true } } },
        });
        finalRelatedData = {
          classes: studentClasses,
          grades: studentGrades,
        };
        break;
      case "parent":
        const students = await prisma.student.findMany({
          select: { id: true, name: true, surname: true },
        });
        finalRelatedData = { students: students };
        break;
      case "course":
        const allTeachersForCourse = await prisma.teacher.findMany({
          include: {
            subjects: {
              select: { id: true, name: true },
            },
          },
        });
        const allSubjects = await prisma.subject.findMany();
        finalRelatedData = { teachers: allTeachersForCourse, subjects: allSubjects };
        break;
      case "lesson":
        const lessonSubjects = await prisma.subject.findMany({
          select: { id: true, name: true },
        });
        const lessonClasses = await prisma.class.findMany({
          select: { id: true, name: true },
        });
        const lessonClassrooms = await prisma.classroom.findMany();
        const lessonTeachers = await prisma.teacher.findMany({
          include: {
            subjects: {
              select: { id: true },
            },
          },
        });
        finalRelatedData = {
          subjects: lessonSubjects,
          classes: lessonClasses,
          teachers: lessonTeachers,
          classrooms: lessonClassrooms,
        };
        break;
      case "exam":
        const examSubjects = await prisma.subject.findMany();
        const examClasses = await prisma.class.findMany();
        const examTeachers = await prisma.teacher.findMany();
        const examClassrooms = await prisma.classroom.findMany();
        finalRelatedData = { 
            subjects: examSubjects, 
            classes: examClasses, 
            teachers: examTeachers,
            classrooms: examClassrooms 
        };
        break;
      case "event":
        const eventClasses = await prisma.class.findMany({ select: { id: true, name: true } });
        finalRelatedData = { classes: eventClasses };
        break;
      case "announcement":
        const announcementClasses = await prisma.class.findMany({ select: { id: true, name: true } });
        finalRelatedData = { classes: announcementClasses };
        break;
      // ADDED: A case to fetch data for the workshop form
      case "workshop":
        const workshopTeachers = await prisma.teacher.findMany({ select: { id: true, name: true, surname: true } });
        const workshopStudents = await prisma.student.findMany({ select: { id: true, name: true, surname: true } });
        finalRelatedData = { teachers: workshopTeachers, students: workshopStudents };
        break;
    }
  }

  return (
    <div className="">
      <FormModal
        table={table}
        type={type}
        data={data}
        id={id}
        relatedData={finalRelatedData}
      />
    </div>
  );
};

export default FormContainer;
