import prisma from "@/lib/prisma";

const UpcomingDeadlines = async ({ studentId }: { studentId: string }) => {
  if (!studentId) return null;

  const upcomingExams = await prisma.exam.findMany({
    where: {
      startTime: {
        gte: new Date(),
      },
      class: {
        students: {
          some: {
            id: studentId,
          },
        },
      },
    },
    include: {
      subject: true,
    },
    orderBy: {
      startTime: "asc",
    },
    take: 4,
  });

  return (
    <div className="bg-white p-4 rounded-md">
      <h1 className="text-xl font-semibold mb-4">الامتحانات القادمة</h1>
      <div className="space-y-4">
        {upcomingExams.length > 0 ? (
          upcomingExams.map((exam) => (
            <div key={exam.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center justify-center bg-yellow-100 text-yellow-800 font-bold p-2 rounded-lg w-16">
                <span className="text-sm">
                  {new Date(exam.startTime).toLocaleString("en-GB", {
                    month: "short",
                  })}
                </span>
                <span className="text-xl">
                  {new Date(exam.startTime).getDate()}
                </span>
              </div>
              <div>
                <p className="font-bold text-gray-800">
                  امتحان {exam.subject.name}
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(exam.startTime).toLocaleDateString("en-GB")} على
                  الساعة{" "}
                  {new Date(exam.startTime).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            لا توجد امتحانات قادمة.
          </p>
        )}
      </div>
    </div>
  );
};

export default UpcomingDeadlines;
