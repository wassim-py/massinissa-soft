import Announcements from "@/components/Announcements";
import MyClasses from "@/components/MyClasses";
import TodaysSchedule from "@/components/TodaysSchedule";

const TeacherPage = () => {
  return (
    <div className="flex-1 p-4 md:p-6 flex gap-6 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3">
        <TodaysSchedule />
      </div>
      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-6">
        <Announcements />
        <MyClasses />
      </div>
    </div>
  );
};

export default TeacherPage;
