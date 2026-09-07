import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Day, Prisma } from "@prisma/client";
import Image from "next/image";

// The component now accepts an optional studentId prop to make it reusable.
const TodaysSchedule = async ({ studentId }: { studentId?: string }) => {
  const { userId } = await auth();

  // If we are in a parent/student context, the ID to use is the studentId prop.
  // If we are in a teacher context, the ID is the logged-in user's ID.
  const targetUserId = studentId || userId;

  if (!targetUserId) {
    return <div className="p-4">تعذر تحديد المستخدم أو الطالب.</div>;
  }

  // Get today's day of the week in the format that matches our Prisma Enum (e.g., "MONDAY")
  const today = new Date()
    .toLocaleString("en-GB", { weekday: "long" })
    .toUpperCase() as Day;

  // Build the query dynamically based on whether it's for a student or a teacher
  const whereClause: Prisma.LessonWhereInput = {
    day: today,
  };

  if (studentId) {
    // If a studentId is provided, find lessons for the classes they are in
    whereClause.class = {
      students: {
        some: {
          id: studentId,
        },
      },
    };
  } else {
    // --- FIX ---
    // Otherwise, find lessons for the logged-in teacher.
    // Use targetUserId which is guaranteed to be a string here.
    whereClause.teacherId = targetUserId;
  }

  const todaysLessons = await prisma.lesson.findMany({
    where: whereClause,
    include: {
      subject: true,
      class: true,
      classroom: true,
      teacher: true, // Also include the teacher's name for the student/parent view
    },
    orderBy: {
      startTime: "asc", // Order the lessons by their start time
    },
  });

  return (
    <div className="bg-white p-4 rounded-md h-full">
      <h1 className="text-xl font-semibold mb-4">
        جدول اليوم (
        {new Date().toLocaleDateString("ar-DZ", { weekday: "long" })})
      </h1>
      <div className="space-y-3">
        {todaysLessons.length > 0 ? (
          todaysLessons.map((lesson) => {
            const startTime = new Date(lesson.startTime).toLocaleTimeString(
              "en-GB",
              { hour: "2-digit", minute: "2-digit", hour12: false }
            );
            const endTime = new Date(lesson.endTime).toLocaleTimeString(
              "en-GB",
              { hour: "2-digit", minute: "2-digit", hour12: false }
            );

            return (
              <div
                key={lesson.id}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border"
              >
                <div className="w-20 text-center">
                  <p className="font-bold text-gray-800">{startTime}</p>
                  <p className="text-xs text-gray-500">إلى {endTime}</p>
                </div>
                <div className="w-px bg-gray-200 self-stretch"></div>
                <div className="flex-grow">
                  <p className="font-bold">{lesson.subject.name}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                    <span>
                      <strong className="text-gray-500">القسم:</strong>{" "}
                      {lesson.class.name}
                    </span>
                    <span>|</span>
                    <span>
                      <strong className="text-gray-500">القاعة:</strong>{" "}
                      {lesson.classroom?.name || "N/A"}
                    </span>
                    {/* Show teacher name in student/parent view */}
                    {studentId && (
                      <>
                        <span>|</span>
                        <span>
                          <strong className="text-gray-500">الأستاذ:</strong>{" "}
                          {`${lesson.teacher.name} ${lesson.teacher.surname}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-10">
            <p className="text-gray-500">لا توجد حصص مجدولة لهذا اليوم.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodaysSchedule;
