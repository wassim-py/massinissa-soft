import BackButton from "@/components/BackButton";
import FormContainer from "@/components/FormContainer";
import Timetable from "@/components/Timetable";
import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { Class, Subject, Teacher } from "@prisma/client";
import Image from "next/image";
import { notFound } from "next/navigation";

const SingleTeacherPage = async ({
  params: { id },
}: {
  params: { id: string };
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  // 1. Fetch the primary data for the teacher
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    include: {
      subjects: { orderBy: { name: 'asc' } },
      classes: { orderBy: { name: 'asc' } },
      lessons: {
          include: {
              subject: true,
              class: true,
              teacher: true,
              classroom: true,
          },
          orderBy: { startTime: 'asc' }
      }
    },
  });

  if (!teacher) {
    return notFound();
  }

  // 2. Fetch the general data needed for form dropdowns
  const relatedDataForForms = await prisma.$queryRaw<any>`
      SELECT
          (SELECT json_agg(t) FROM "Teacher" t) as teachers,
          (SELECT json_agg(c) FROM "Class" c) as classes,
          (SELECT json_agg(s) FROM "Subject" s) as subjects,
          (SELECT json_agg(cr) FROM "Classroom" cr) as classrooms
  `.then(res => res[0]);
  
  // Create the actions (edit/delete buttons) for each lesson
  const lessonActions = teacher.lessons.reduce((acc, lesson) => {
    acc[lesson.id] = (
      <div className="flex justify-end gap-3">
        <FormContainer table="lesson" type="delete" id={lesson.id} />
        <FormContainer
          table="lesson"
          type="update"
          data={lesson}
          relatedData={relatedDataForForms}
        />
      </div>
    );
    return acc;
  }, {} as { [key: number]: JSX.Element });

  // --- UI IMPROVEMENT: Color palettes for bubbles ---
  const subjectColors = ["bg-blue-100 text-blue-800", "bg-green-100 text-green-800", "bg-yellow-100 text-yellow-800"];
  const classColors = ["bg-purple-100 text-purple-800", "bg-red-100 text-red-800", "bg-indigo-100 text-indigo-800"];

  return (
    <div className="flex-1 p-4 flex flex-col gap-4">
        <BackButton/>
        {/* TOP: Profile and Info */}
        <div className="flex flex-col lg:flex-row gap-4">
           
            {/* --- UI IMPROVEMENT: Upgraded Profile Card --- */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-lg shadow-sm border flex-1 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                    <Image
                    src={teacher.img || "/noAvatar.png"}
                    alt={`${teacher.name} ${teacher.surname}`}
                    width={128}
                    height={128}
                    className="rounded-full object-cover border-4 border-white shadow-md"
                    />
                </div>
                <div className="flex-grow text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
                        <h1 className="text-2xl font-bold text-gray-800">
                            {teacher.name} {teacher.surname}
                        </h1>
                        {role === "admin" && (
                            <FormContainer table="teacher" type="update" data={teacher} />
                        )}
                    </div>
                    <p className="text-sm text-gray-500 font-medium mb-4 text-right">{teacher.username}@</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/mail.png" alt="Email" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{teacher.email || "غير متوفر"}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/phone.png" alt="Phone" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{teacher.phone || "غير متوفر"}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/date.png" alt="Birthday" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{new Intl.DateTimeFormat("en-GB").format(teacher.birthday)}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* --- UI IMPROVEMENT: Upgraded Assigned Subjects and Classes Bubbles --- */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border flex-1">
                    <h2 className="text-lg font-semibold mb-3 text-gray-700">المواد المكلّف بها</h2>
                    <div className="flex flex-wrap gap-2">
                        {teacher.subjects.map((subject, index) => (
                            <span key={subject.id} className={`font-semibold px-3 py-1 rounded-full text-sm ${subjectColors[index % subjectColors.length]}`}>
                                {subject.name}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border flex-1">
                    <h2 className="text-lg font-semibold mb-3 text-gray-700">الأقسام المكلّف بها</h2>
                    <div className="flex flex-wrap gap-2">
                        {teacher.classes.map((classItem, index) => (
                            <span key={classItem.id} className={`font-semibold px-3 py-1 rounded-full text-sm ${classColors[index % classColors.length]}`}>
                                {classItem.name}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* BOTTOM: Timetable */}
        <div className="mt-4 bg-white rounded-md p-4 shadow-sm border">
            <h1 className="text-xl font-semibold mb-4">التوقيت الاسبوعي للاستاذ</h1>
            <Timetable 
                lessons={teacher.lessons}
                actions={lessonActions}
                relatedDataForForms={relatedDataForForms}
                userRole={role!}
            />
        </div>
    </div>
  );
};

export default SingleTeacherPage;
