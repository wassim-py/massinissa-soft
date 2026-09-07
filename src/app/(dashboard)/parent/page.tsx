import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import ChildSwitcher from "@/components/ChildSwitcher";
import UpcomingDeadlines from "@/components/UpcomingDeadlines";
import TodaysSchedule from "@/components/TodaysSchedule";



const ParentPage = async (
  props: {
    searchParams: Promise<{ studentId?: string }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { userId } = await auth();
  if (!userId) return <p>لم يتم تسجيل الدخول.</p>;

  // --- FIX: Fetch the parent's children on the server ---
  const children = await prisma.student.findMany({
    where: { parentId: userId },
    orderBy: { name: "asc" },
  });

  // Determine which child is being viewed from the URL query.
  let activeStudentId = searchParams.studentId;

  // If no child is selected in the URL, default to the first child
  if (!activeStudentId) {
    activeStudentId = children[0]?.id;
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      {/* --- FIX: Pass the fetched children data to the switcher --- */}
      <ChildSwitcher students={children} activeStudentId={activeStudentId} />

      {/* The rest of the dashboard only renders if a child is selected/found */}
      {activeStudentId ? (
        <div className="flex gap-4 flex-col xl:flex-row">
          {/* LEFT */}
          <div className="w-full xl:w-2/3">
            <TodaysSchedule studentId={activeStudentId} />
          </div>
          {/* RIGHT */}
          <div className="w-full xl:w-1/3 flex flex-col gap-4">
            <UpcomingDeadlines studentId={activeStudentId} />
          </div>
        </div>
      ) : (
        // This message shows if the parent has no children linked to their account.
        <div className="text-center py-10">
          <p className="text-gray-600">
            يرجى إضافة طفل إلى حسابك لرؤية تفاصيله.
          </p>
        </div>
      )}
    </div>
  );
};

export default ParentPage;
