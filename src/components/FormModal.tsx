"use client";

import {
  deleteClass,
  deleteCourse,
  deleteEvent,
  deleteExam,
  deleteLesson,
  deleteParent,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  deleteAnnouncement,
  deleteWorkshop,
} from "@/lib/actions";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ComponentType,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import { useFormState } from "react-dom";
import { toast } from "react-toastify";
import { FormContainerProps } from "./FormContainer";

// --- TYPE DEFINITIONS ---
type FormComponentProps = {
  setOpen: Dispatch<SetStateAction<boolean>>;
  type: "create" | "update";
  data?: any;
  relatedData?: any;
};

type TableName = FormContainerProps["table"];

// --- ARABIC NAME MAPPING ---
const tableNamesAr: Record<string, string> = {
  teacher: "الأستاذ",
  student: "التلميذ",
  parent: "ولي الأمر",
  subject: "المادة",
  class: "القسم",
  lesson: "الحصة",
  exam: "الامتحان",
  result: "النتيجة",
  attendance: "الحضور",
  event: "الحدث",
  announcement: "الإعلان",
  course: "الدرس",
  payment: "الدفع",
  workshop: "الدورة",
};

// --- LAZY-LOADED FORMS ---
const TeacherForm = dynamic(() => import("./forms/TeacherForm"));
const StudentForm = dynamic(() => import("./forms/StudentForm"));
const SubjectForm = dynamic(() => import("./forms/SubjectForm"));
const ClassForm = dynamic(() => import("./forms/ClassForm"));
const ExamForm = dynamic(() => import("./forms/ExamForm"));
const ParentForm = dynamic(() => import("./forms/ParentForm"));
const LessonForm = dynamic(() => import("./forms/LessonForm"));
const CourseForm = dynamic(() => import("./forms/CourseForm"));
const EventForm = dynamic(() => import("./forms/EventForm"));
const AnnouncementForm = dynamic(() => import("./forms/AnnouncementForm"));
const WorkshopForm = dynamic(() => import("./forms/WorkshopForm"));

// --- FORM MAP ---
const forms: Partial<Record<TableName, ComponentType<FormComponentProps>>> = {
  subject: SubjectForm,
  class: ClassForm,
  teacher: TeacherForm,
  student: StudentForm,
  exam: ExamForm,
  parent: ParentForm,
  lesson: LessonForm,
  course: CourseForm,
  event: EventForm,
  announcement: AnnouncementForm,
  workshop: WorkshopForm,
};

// --- DELETE CONFIRMATION COMPONENT ---
const DeleteConfirmation = ({
  table,
  id,
  data,
  setOpen,
}: {
  table: TableName;
  id: string | number;
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  // This map only includes delete actions that exist in your actions.ts file.
  const deleteActionMap: Partial<Record<TableName, (currentState: any, data: FormData) => Promise<any>>> = {
    subject: deleteSubject,
    class: deleteClass,
    teacher: deleteTeacher,
    student: deleteStudent,
    exam: deleteExam,
    parent: deleteParent,
    lesson: deleteLesson,
    course: deleteCourse,
    event: deleteEvent,
    announcement: deleteAnnouncement,
    workshop: deleteWorkshop,
  };

  const deleteAction = deleteActionMap[table] || deleteSubject;

  const [state, formAction] = useFormState(deleteAction, {
    success: false,
    error: false,
    message: "",
  });

  const tableNameInArabic = tableNamesAr[table] || "العنصر";

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || `تم حذف ${tableNameInArabic} بنجاح!`);
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, tableNameInArabic, setOpen]);

  return (
    <form
      action={formAction}
      className="p-6 flex flex-col items-center gap-4 text-center"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-12 w-12 text-red-500 opacity-80 mb-2"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
      <h2 className="text-xl font-bold text-gray-800">هل أنت متأكد؟</h2>
      <p className="text-gray-600">
        لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع البيانات المتعلقة بهذا (
        {tableNameInArabic}) بشكل دائم.
      </p>
      <div className="flex items-center gap-4 mt-4 w-full">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300"
        >
          إلغاء
        </button>
        <button
          type="submit"
          className="flex-1 bg-red-600 text-white px-6 py-2 font-semibold rounded-md hover:bg-red-700"
        >
          حذف
        </button>
      </div>
      <input type="hidden" name="id" value={id} />
      {table === "payment" && data?.classId && (
        <input type="hidden" name="classId" value={data.classId} />
      )}
    </form>
  );
};

// --- MAIN REFACTORED FORM MODAL ---
const FormModal = ({
  table,
  type,
  data,
  id,
  relatedData,
}: FormContainerProps) => {
  const [open, setOpen] = useState(false);

  const FormComponent = forms[table];

  const buttonSize = type === "create" ? "w-8 h-8" : "w-7 h-7";
  const buttonBgColor =
    type === "create"
      ? "bg-wsmYellow"
      : type === "update"
      ? "bg-wsmSky"
      : "bg-wsmPurple";

  const modalContentClasses =
    type === "delete"
      ? "bg-white rounded-lg shadow-xl relative w-full max-w-md mx-4"
      : "bg-white p-4 rounded-md relative w-[90%] md:w-[70%] lg:w-[60%] xl:w-[50%] 2xl:w-[40%] max-h-[90vh] overflow-y-auto";

  return (
    <>
      <button
        className={`${buttonSize} flex items-center justify-center rounded-full ${buttonBgColor}`}
        onClick={() => setOpen(true)}
      >
        <Image src={`/${type}.png`} alt="" width={16} height={16} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className={modalContentClasses}>
            <button
              className="absolute top-4 left-4 cursor-pointer"
              onClick={() => setOpen(false)}
            >
              <Image src="/close.png" alt="إغلاق" width={14} height={14} />
            </button>

            {type === "delete" && id ? (
              <DeleteConfirmation
                table={table}
                id={id}
                data={data}
                setOpen={setOpen}
              />
            ) : (type === "create" || type === "update") && FormComponent ? (
              <div className="p-4">
                <FormComponent
                  setOpen={setOpen}
                  type={type}
                  data={data}
                  relatedData={relatedData}
                />
              </div>
            ) : (
              <div className="text-center p-8">لم يتم العثور على النموذج!</div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FormModal;
