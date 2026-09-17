import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ChildSwitcher from "@/components/ChildSwitcher";
import Announcements from "@/components/Announcements";
import TodaysSchedule from "@/components/TodaysSchedule";
import { Card } from "@/components/ui/Card";
import { getTranslations } from "next-intl/server";

const ParentPage = async (
  props: {
    searchParams: Promise<{ studentId?: string }>;
  }
) => {
  const tParents = await getTranslations("parents");
  const searchParams = await props.searchParams;
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="p-4 md:p-6">
        <Card className="p-6 text-center text-gray-500 font-medium">{tParents("notLoggedIn")}</Card>
      </div>
    );
  }

  // --- FIX: Fetch the parent's children on the server ---
  const familyNum = parseInt(userId, 10);
  const children = !isNaN(familyNum)
    ? await prisma.student.findMany({
        where: { familyId: familyNum },
        orderBy: { name: "asc" },
      })
    : await prisma.student.findMany({
        where: { id: userId },
        orderBy: { name: "asc" },
      });

  // Determine which child is being viewed from the URL query.
  let activeStudentId = searchParams.studentId;

  // If no child is selected in the URL, default to the first child
  if (!activeStudentId) {
    activeStudentId = children[0]?.id;
  }

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6">
      {/* Pass the fetched children data to the switcher */}
      <ChildSwitcher students={children} activeStudentId={activeStudentId} />

      {/* The rest of the dashboard only renders if a child is selected/found */}
      {activeStudentId ? (
        <div className="flex gap-6 flex-col xl:flex-row">
          {/* LEFT */}
          <div className="w-full xl:w-2/3">
            <TodaysSchedule studentId={activeStudentId} />
          </div>
          {/* RIGHT */}
          <div className="w-full xl:w-1/3 flex flex-col gap-6">
            <Announcements />
          </div>
        </div>
      ) : (
        <Card className="text-center py-10">
          <p className="text-gray-500 text-sm">
            {tParents("pleaseAddChild")}
          </p>
        </Card>
      )}
    </div>
  );
};

export default ParentPage;
