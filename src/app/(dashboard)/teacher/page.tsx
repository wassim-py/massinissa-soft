import Announcements from "@/components/Announcements";
import MyClasses from "@/components/MyClasses";
import TodaysSchedule from "@/components/TodaysSchedule";
import UpcomingEvents from "@/components/UpcomingEvents"; // 1. Import the new component

const TeacherPage = () => {
  return (
    <div className="flex-1 p-4 flex gap-4 flex-col xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3">
        <TodaysSchedule />
      </div>
      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        {/* 2. Add the EventList component here */}
        <UpcomingEvents />
        <Announcements />
        <MyClasses />
      </div>
    </div>
  );
};

export default TeacherPage;
