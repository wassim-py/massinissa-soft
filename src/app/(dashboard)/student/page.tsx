import Announcements from "@/components/Announcements";
import TodaysSchedule from "@/components/TodaysSchedule";
import UpcomingDeadlines from "@/components/UpcomingDeadlines";
import { auth } from "@clerk/nextjs/server";

const StudentPage = async () => {
  const { userId } = auth();

  // The page will only render if a student is logged in.
  if (!userId) {
    return <p className="p-4">تعذر تحديد الطالب.</p>;
  }

  return (
    <div className="flex-1 p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT COLUMN: Main schedule */}
      <div className="w-full xl:w-2/3">
        {/* We can reuse the TodaysSchedule component. Since we are not passing a 
            studentId prop, it will automatically fetch the schedule for the 
            logged-in user, who in this case is the student.
        */}
        <TodaysSchedule studentId={userId}/>
      </div>

      {/* RIGHT COLUMN: Supporting information */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        {/* The UpcomingDeadlines component shows exams for the logged-in student */}
        <UpcomingDeadlines studentId={userId} />

        {/* The Announcements component is already role-aware and will show relevant announcements */}
        <Announcements />
      </div>
    </div>
  );
};

export default StudentPage;
