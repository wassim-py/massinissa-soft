import Announcements from "@/components/Announcements";
import TodaysSchedule from "@/components/TodaysSchedule";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { getTranslations } from "next-intl/server";

const StudentPage = async () => {
  const tStudents = await getTranslations("students");
  const { userId } = await auth();

  // The page will only render if a student is logged in.
  if (!userId) {
    return (
      <div className="p-4 md:p-6">
        <Card className="p-6 text-center text-gray-500 font-medium">{tStudents("cannotIdentifyStudent")}</Card>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 flex gap-6 flex-col xl:flex-row">
      {/* LEFT COLUMN: Main schedule */}
      <div className="w-full xl:w-2/3">
        {/* We can reuse the TodaysSchedule component. Since we are not passing a 
            studentId prop, it will automatically fetch the schedule for the 
            logged-in user, who in this case is the student.
        */}
        <TodaysSchedule studentId={userId}/>
      </div>

      {/* RIGHT COLUMN: Supporting information */}
      <div className="w-full xl:w-1/3 flex flex-col gap-6">
        {/* The Announcements component is already role-aware and will show relevant announcements */}
        <Announcements />
      </div>
    </div>
  );
};

export default StudentPage;
