"use client";

import { Class, Lesson, Subject, Teacher, Classroom } from "@prisma/client";
import Image from "next/image";
import FormContainer from "./FormContainer";

type TimetableLesson = Lesson & {
  subject: Subject;
  class: Class;
  teacher: Teacher;
  classroom: Classroom | null;
};

// FIX: Component now accepts the `relatedData` prop to pass to its FormContainer
const LessonDetailModal = ({
  lesson,
  onClose,
  actions,
  relatedData,
}: {
  lesson: TimetableLesson;
  onClose: () => void;
  actions: React.ReactNode;
  relatedData: any; 
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-xl relative w-full max-w-lg mx-4">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <Image src="/close.png" alt="close" width={16} height={16} />
        </button>

        <div className="border-b pb-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            {lesson.subject.name}
          </h2>
          <p className="text-md text-gray-500">{lesson.class.name}</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">الأستاذ:</span>
            <span className="text-gray-800">
              {lesson.teacher.name} {lesson.teacher.surname}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">اليوم:</span>
            <span className="text-gray-800 capitalize">
              {{
                saturday: "السبت",
                sunday: "الأحد",
                monday: "الإثنين",
                tuesday: "الثلاثاء",
                wednesday: "الأربعاء",
                thursday: "الخميس",
                friday: "الجمعة"
              }[lesson.day.toLowerCase()] || lesson.day}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">الوقت:</span>
            <span className="text-gray-800">
              {new Date(lesson.startTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              -{" "}
              {new Date(lesson.endTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">المكان:</span>
            <span className="text-gray-800">{lesson.classroom?.name || "غير محدد"}</span>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
            {/* The pre-built actions are now rendered here */}
            {actions}
        </div>
      </div>
    </div>
  );
};

export default LessonDetailModal;
