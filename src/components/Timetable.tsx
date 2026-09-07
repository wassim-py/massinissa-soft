"use client";

import { Day, Lesson, Subject, Class, Teacher, Classroom } from "@prisma/client";
import React, { useState, useEffect } from "react";
import LessonDetailModal from "./LessonDetailModal";
import Image from "next/image";
import Link from "next/link";

// --- UPDATED: The type now includes an optional array for parent view ---
type TimetableLesson = Lesson & {
  subject: Subject;
  class: Class;
  teacher: Teacher;
  classroom: Classroom | null;
  forChildren?: string[]; // For parent view, lists which children are in the lesson
};

// Define the days of the week in the desired order
const daysOfWeek: Day[] = [
  "SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY",
];

// Define the time slots for the schedule
const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00"
];

// Get today's day as an uppercase string (e.g., "MONDAY") to match the Day enum
const today = new Date().toLocaleString('en-GB', { weekday: 'long' }).toUpperCase() as Day;

const Timetable = ({ lessons, actions, relatedDataForForms, userRole }: { lessons: TimetableLesson[], actions: { [key: number]: React.JSX.Element }, relatedDataForForms: any, userRole: string }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<TimetableLesson | null>(null);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLesson(null);
  };

  const handleLessonClick = (lesson: TimetableLesson) => {
    setSelectedLesson(lesson);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (selectedLesson && !lessons.find(l => l.id === selectedLesson.id)) {
      handleCloseModal();
    }
  }, [lessons, selectedLesson]);

  const findLessonsForSlot = (day: Day, time: string): TimetableLesson[] => {
    return lessons.filter((lesson) => {
      const lessonHour = new Date(lesson.startTime).getHours().toString().padStart(2, '0');
      const lessonTime = `${lessonHour}:00`;
      return lesson.day === day && lessonTime === time;
    });
  };

  return (
    <>
      <div className="w-full overflow-auto relative" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="grid grid-cols-8 min-w-[1200px]">
          <div className="font-bold text-center p-2 border-b-2 border-gray-300 sticky top-0 left-0 bg-white z-20">الوقت</div>
          {daysOfWeek.map((day) => (
            <div key={day} className="font-bold text-center p-2 border-b-2 border-gray-300 sticky top-0 bg-white z-10 capitalize">
                {{
                  SATURDAY: "السبت",
                  SUNDAY: "الأحد",
                  MONDAY: "الإثنين",
                  TUESDAY: "الثلاثاء",
                  WEDNESDAY: "الأربعاء",
                  THURSDAY: "الخميس",
                  FRIDAY: "الجمعة"
                }[day]}
            </div>
          ))}
          {timeSlots.map((time, index) => {
            const rowBgClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            return (
              <div key={time} className="grid grid-cols-8 col-span-8 contents">
                <div className={`font-semibold text-center p-2 border-r-2 border-b border-gray-200 sticky left-0 z-10 ${rowBgClass}`}>
                  {time}
                </div>
                {daysOfWeek.map((day) => {
                  const lessonsInSlot = findLessonsForSlot(day, time);
                  return (
                    <div key={`${day}-${time}`} className={`p-1 border-b border-r border-gray-200 min-h-[100px] flex flex-col gap-1 relative ${rowBgClass}`}>
                      {lessonsInSlot.map((lesson) => {
                        const formattedEndTime = new Date(lesson.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        const formattedStartTime = new Date(lesson.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        
                        const showAttendanceButton = lesson.day === today && userRole === 'admin';
                        const isClickable = userRole === 'admin';
                        const clickHandler = isClickable ? () => handleLessonClick(lesson) : undefined;
                        const cardClassName = `bg-blue-100 p-2 rounded-md text-xs flex flex-col justify-between w-[95%] ${isClickable ? 'hover:bg-blue-200 transition-colors cursor-pointer' : 'cursor-default'}`;

                        let lessonStyle: React.CSSProperties = { position: 'relative', zIndex: 1 };
                        // --- UPDATED: Apply dynamic height for teachers AND students ---
                        if (userRole === 'teacher' || userRole === 'student') {
                            const start = new Date(lesson.startTime);
                            const end = new Date(lesson.endTime);
                            const durationInMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
                            const heightPerMinute = 100 / 60;
                            lessonStyle.height = `${durationInMinutes * heightPerMinute}px`;
                            lessonStyle.position = 'absolute';
                        }
                        
                        return (
                         <div 
                            key={lesson.id} 
                            onClick={clickHandler}
                            style={lessonStyle}
                            className={cardClassName}
                          >
                            <div>
                                <h4 className="font-bold">{lesson.subject.name}</h4>
                                <p className="text-gray-600">{lesson.class.name}</p>
                                {/* Show teacher name for admin, student, and parent views */}
                                {(userRole === 'admin' || userRole === 'student' || userRole === 'parent') && (
                                    <p className="text-gray-500 italic">
                                        {lesson.teacher.name} {lesson.teacher.surname}
                                    </p>
                                )}
                                <div className="flex flex-col mt-2">
                                    <span className="font-semibold">{lesson.classroom?.name || "لا يوجد"}</span>
                                    <span className="text-xs text-gray-500 pt-1">يبدآ {formattedStartTime} ينتهي: {formattedEndTime}</span>
                                </div>
                            </div>
                            {/* --- NEW: Label for parent view --- */}
                            {userRole === 'parent' && lesson.forChildren && (
                                <div className="mt-auto pt-1">
                                    <p className="text-center text-xs font-semibold bg-green-200 text-green-800 rounded-full px-2 py-1">
                                        خاص بـ: {lesson.forChildren.join(', ')}
                                    </p>
                                </div>
                            )}
                            {showAttendanceButton && (
                                <div className="border-t border-blue-200 mt-auto pt-1">
                                    <Link 
                                        href={`/list/attendance/take/${lesson.id}`} 
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center justify-center gap-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-md hover:bg-green-600 transition-colors w-full"
                                    >
                                        <Image src="/attendance.png" alt="Take Attendance" width={14} height={14} />
                                        تسجيل الحضور
                                    </Link>
                                </div>
                            )}
                          </div>
                        )})}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      
      {isModalOpen && selectedLesson && (
        <LessonDetailModal lesson={selectedLesson} onClose={handleCloseModal} actions={actions[selectedLesson.id]} relatedData={relatedDataForForms} />
      )}
    </>
  );
};

export default Timetable;
