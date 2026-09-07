"use client";

import { Class, Exam, Subject, Teacher, Classroom } from "@prisma/client";
import Image from "next/image";

// Define the type for the exam data this modal expects
type TimetableExam = Exam & {
  subject: Subject;
  class: Class;
  teacher: Teacher;
  classroom: Classroom | null;
};

const ExamDetailModal = ({
  exam,
  onClose,
  actions,
}: {
  exam: TimetableExam;
  onClose: () => void;
  actions: React.ReactNode;
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-xl relative w-full max-w-lg mx-4 text-right rtl">
        <button
          onClick={onClose}
          className="absolute top-3 left-3 text-gray-400 hover:text-gray-600"
        >
          <Image src="/close.png" alt="إغلاق" width={16} height={16} />
        </button>

        <div className="border-b pb-3 mb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            {exam.title}
          </h2>
          <p className="text-md text-gray-500">{exam.class.name}</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">المادة:</span>
            <span className="text-gray-800">{exam.subject.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">المراقب:</span>
            <span className="text-gray-800">
              {exam.teacher.name} {exam.teacher.surname}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">التاريخ:</span>
            <span className="text-gray-800 capitalize">
              {new Date(exam.startTime).toLocaleDateString("ar-DZ", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">الوقت:</span>
            <span className="text-gray-800">
              {new Date(exam.startTime).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              -{" "}
              {new Date(exam.endTime).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-600">القسم:</span>
            <span className="text-gray-800">{exam.classroom?.name || "غير محدد"}</span>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
          {actions}
        </div>
      </div>
    </div>
  );
};

export default ExamDetailModal;
