import FormContainer from "@/components/FormContainer";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import ExamTimetable from "@/components/ExamTimetable";
import ExamSeasonToggle from "@/components/ExamSeasonToggle";
import Link from "next/link";
import Image from "next/image";
import BackButton from "@/components/BackButton";

const ExamListPage = async ({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) => {
  const { userId, sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const currentUserId = userId;

  const [examSeasonSetting, exams, relatedDataForForms] = await prisma.$transaction(async (tx) => {
    const setting = await tx.schoolSetting.findUnique({
      where: { key: "exam_season_active" },
    });

    const query: Prisma.ExamWhereInput = {};

    if (searchParams.search) {
      query.OR = [
        { title: { contains: searchParams.search, mode: "insensitive" } },
        { subject: { name: { contains: searchParams.search, mode: "insensitive" } } },
        { class: { name: { contains: searchParams.search, mode: "insensitive" } } },
      ];
    }

    if (role === "teacher") {
      query.teacherId = currentUserId!;
    } else if (role === "student") {
      query.class = { students: { some: { id: currentUserId! } } };
    } else if (role === "parent") {
      query.class = { students: { some: { parentId: currentUserId! } } };
    }

    const examData = await tx.exam.findMany({
      where: query,
      include: {
        subject: true,
        teacher: true,
        class: true,
        classroom: true,
      },
      orderBy: {
        startTime: "asc",
      },
    });

    const subjects = await tx.subject.findMany({
      include: { teachers: { select: { id: true } } },
    });
    const classes = await tx.class.findMany();
    const teachers = await tx.teacher.findMany({
      include: { subjects: { select: { id: true } } },
    });
    const classrooms = await tx.classroom.findMany();

    const relatedData = { subjects, classes, teachers, classrooms };

    return [setting, examData, relatedData];
  });

  const isExamSeasonActive = examSeasonSetting?.value === "true";

  const examActions = exams.reduce((acc, exam) => {
    const canPerformAction = role === "admin";

    acc[exam.id] = (
      <div className="flex justify-end items-center gap-3">
        {(role === "admin" || role === "teacher") && (
          <Link
            href={`/list/results/enter/${exam.id}`}
            className="flex items-center gap-2 bg-green-500 text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-green-600 transition-colors"
          >
            <Image src="/result.png" alt="إدخال النتائج" width={14} height={14} />
            إدخال النتائج
          </Link>
        )}

        {canPerformAction && (
          <>
            <FormContainer table="exam" type="update" data={exam} relatedData={relatedDataForForms} />
            <FormContainer table="exam" type="delete" id={exam.id} />
          </>
        )}
      </div>
    );
    return acc;
  }, {} as { [key: number]: JSX.Element });

  return (
    <div className="bg-white p-4 rounded-md flex-1 m-4 mt-0">
      <BackButton />
      <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">جدول الامتحانات</h1>
          <p className="text-sm text-gray-500">الجدول الرسمي للامتحانات القادمة.</p>
        </div>

        {role === "admin" && (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ExamSeasonToggle isActive={isExamSeasonActive} />
            <FormContainer table="exam" type="create" relatedData={relatedDataForForms} />
          </div>
        )}
      </div>

      <div className="mt-6">
        {isExamSeasonActive || role === "admin" ? (
          <ExamTimetable
            exams={exams}
            actions={examActions}
            relatedDataForForms={relatedDataForForms}
          />
        ) : (
          <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg">
            <h2 className="text-xl font-semibold text-gray-700">
              جدول الامتحانات غير مفعل حاليًا
            </h2>
            <p className="text-gray-500 mt-2">
              يرجى التحقق لاحقًا. سيتم عرض الجدول هنا بمجرد بدء فترة الامتحانات.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamListPage;
