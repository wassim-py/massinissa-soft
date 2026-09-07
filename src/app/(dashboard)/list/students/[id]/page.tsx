import FormContainer from "@/components/FormContainer";
import Timetable from "@/components/Timetable";
import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { Class, Grade, Student, Parent } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import StudentAttendanceCard from "@/components/StudentAttendanceCard";
import BackButton from "@/components/BackButton";

const SingleStudentPage = async ({
  params: { id },
}: {
  params: { id: string };
}) => {
  const { sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;

  // --- FIX: Corrected the data fetching logic ---
  // 1. Fetch the student's primary details and their class enrollments.
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      classes: { orderBy: { name: 'asc' } },
      grade: true,
      parent: { select: { name: true, surname: true } },
    },
  });

  if (!student) {
    return notFound();
  }

  // 2. Use the student's class IDs to fetch their lessons in a separate query.
  const studentClassIds = student.classes.map(c => c.id);
  const lessons = await prisma.lesson.findMany({
    where: {
        classId: {
            in: studentClassIds
        }
    },
    include: {
        subject: true,
        class: true,
        teacher: true,
        classroom: true,
    },
    orderBy: { startTime: 'asc' }
  });


  // The 'actions' for the student timetable are empty as students can't edit lessons.
  const lessonActions = {}; 
  const relatedDataForForms = {}; // Not needed for student view

  return (
    <div className="flex-1 p-4 flex flex-col gap-4">
        <BackButton/>
        {/* TOP: Profile and Info */}
        <div className="flex flex-col lg:flex-row gap-4">
            {/* --- UI IMPROVEMENT: Upgraded Profile Card --- */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-lg shadow-sm border flex-1 flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                    <Image
                    src={student.img || "/noAvatar.png"}
                    alt={`${student.name} ${student.surname}`}
                    width={128}
                    height={128}
                    className="rounded-full object-cover border-4 border-white shadow-md"
                    />
                </div>
                <div className="flex-grow text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
                        <h1 className="text-2xl font-bold text-gray-800">
                            {student.name} {student.surname}
                        </h1>
                        {role === "admin" && (
                            <FormContainer table="student" type="update" data={student} />
                        )}
                    </div>
                    <p className="text-sm text-gray-500 font-medium mb-4 text-right">{student.username}@</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/mail.png" alt="Email" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{student.email || "غير متوفر"}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/phone.png" alt="Phone" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{student.phone || "غير متوفر"}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/date.png" alt="Birthday" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{new Intl.DateTimeFormat("en-GB").format(student.birthday)}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/60 p-2 rounded-md">
                            <Image src="/parent.png" alt="Parent" width={16} height={16} className="opacity-70"/>
                            <span className="text-gray-700">{student.parent ? `${student.parent.name} ${student.parent.surname}` : "غير معين"}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* --- UI IMPROVEMENT: Replaced small cards with more informative sections --- */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border flex-1">
                    <h2 className="text-lg font-semibold mb-3 text-gray-700">الأقسام المسجّل فيها</h2>
                    <div className="flex flex-wrap gap-2">
                        {student.classes.map((classItem, index) => (
                            <span key={classItem.id} className={`font-semibold px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800`}>
                                {classItem.name}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border flex-1 flex items-center gap-4">
                    <Image src="/singleAttendance.png" alt="Attendance" width={32} height={32} />
                    <Suspense fallback={<p>تحميل الحضور...</p>}>
                        <StudentAttendanceCard id={student.id} />
                    </Suspense>
                </div>
            </div>
        </div>

        {/* BOTTOM: Timetable */}
        <div className="mt-4 bg-white rounded-md p-4 shadow-sm border">
            <h1 className="text-xl font-semibold mb-4">التوقيت الاسبوعي للتلميذ</h1>
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

export default SingleStudentPage;
