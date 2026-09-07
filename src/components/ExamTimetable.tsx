"use client";

import { Day, Subject, Class, Teacher, Classroom, Exam } from "@prisma/client";
import React, { useState, useEffect } from "react";
import ExamDetailModal from "./ExamDetailModal";

// Define the type for the exam data
type TimetableExam = Exam & {
  subject: Subject;
  class: Class;
  teacher: Teacher;
  classroom: Classroom | null;
};

// This order must match the order in your timetable grid display.
const daysOfWeek: Day[] = [
  "SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY",
];

const dayNamesArabic: Record<Day, string> = {
  SATURDAY: "السبت",
  SUNDAY: "الأحد",
  MONDAY: "الإثنين",
  TUESDAY: "الثلاثاء",
  WEDNESDAY: "الأربعاء",
  THURSDAY: "الخميس",
  FRIDAY: "الجمعة",
};

const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "12:00", 
  "13:00", "14:00", "15:00", "16:00", "17:00"
];

// This mapping helps reliably get the day string from a Date object's getDay() method (where Sunday is 0).
const dayMap: Day[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];


const ExamTimetable = ({ exams, actions, relatedDataForForms }: { exams: TimetableExam[], actions: { [key: number]: React.JSX.Element }, relatedDataForForms: any }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<TimetableExam | null>(null);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedExam(null);
  };

  const handleExamClick = (exam: TimetableExam) => {
    setSelectedExam(exam);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (selectedExam && !exams.find(e => e.id === selectedExam.id)) {
      handleCloseModal();
    }
  }, [exams, selectedExam]);

  // This function finds exams for a given day and time slot.
  const findExamsForSlot = (day: Day, time: string): TimetableExam[] => {
    return exams.filter((exam) => {
      const examDate = new Date(exam.startTime); 
      const examDay = dayMap[examDate.getDay()];
      const examHour = examDate.getHours().toString().padStart(2, '0');
      const examTime = `${examHour}:00`;
      
      return examDay === day && examTime === time;
    });
  };

  return (
    <>
      <div className="w-full overflow-x-auto">
        <div className="grid grid-cols-8 min-w-[1200px]">
          <div className="font-bold text-center p-2 border-b-2 border-gray-300 sticky top-0 bg-white z-10">الوقت</div>
          {daysOfWeek.map((day) => (
            <div key={day} className="font-bold text-center p-2 border-b-2 border-gray-300 sticky top-0 bg-white z-10 capitalize">
              {dayNamesArabic[day]}
            </div>
          ))}

          {timeSlots.map((time, index) => {
            const rowBgClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            return (
              <div key={time} className="grid grid-cols-8 col-span-8 contents">
                <div className={`font-semibold text-center p-2 border-r-2 border-b border-gray-200 ${rowBgClass}`}>
                  {time}
                </div>
                {daysOfWeek.map((day) => {
                  const examsInSlot = findExamsForSlot(day, time);
                  return (
                    <div key={`${day}-${time}`} className={`p-1 border-b border-r border-gray-200 min-h-[120px] flex flex-col gap-1 ${rowBgClass}`}>
                      {examsInSlot.map((exam) => {
                        // ADDED: Format the start time for display.
                        const formattedStartTime = new Date(exam.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        const formattedEndTime = new Date(exam.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        const formattedDate = new Date(exam.startTime).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' });
                        return (
                          <button
                            key={exam.id}
                            onClick={() => handleExamClick(exam)}
                            className="bg-red-100 hover:bg-red-200 transition-colors p-2 rounded-md text-xs flex flex-col justify-between flex-grow text-right"
                          >
                            <div>
                              <h4 className="font-bold">{exam.title}</h4>
                              <p className="text-gray-600">{exam.class.name}</p>
                              <p className="text-gray-500 italic">
                                {exam.teacher.name} {exam.teacher.surname}
                              </p>
                               <p className="font-semibold mt-1">{formattedDate}</p>
                            </div>
                            <div className="flex justify-between items-end mt-1">
                              <span className="font-semibold">{exam.classroom?.name || "غير محدد"}</span>
                              {/* CHANGED: Display both start and end times */}
                              <span className="font-semibold text-gray-500 text-[10px] tracking-tighter">
                                {formattedStartTime} - {formattedEndTime}
                              </span>
                            </div>
                          </button>
                        )})}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      
      {isModalOpen && selectedExam && (
        <ExamDetailModal 
            exam={selectedExam} 
            onClose={handleCloseModal} 
            actions={actions[selectedExam.id]} 
        />
      )}
    </>
  );
};

export default ExamTimetable;
