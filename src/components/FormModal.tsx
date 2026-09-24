"use client";

import {
  deleteClass,
  deleteLesson,
  deleteParent,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  deleteAnnouncement,
  deleteWorkshop,
} from "@/lib/actions";
import { deleteFormationAction } from "@/lib/formationActions";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  useActionState,
  ComponentType,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
  startTransition,
} from "react";
import { toast } from "react-toastify";
import { FormContainerProps } from "./FormContainer";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { usePermission } from "@/hooks/usePermission";
import { useRouter } from "@/i18n/navigation";

// --- TYPE DEFINITIONS ---
type FormComponentProps = {
  setOpen: Dispatch<SetStateAction<boolean>>;
  type: "create" | "update";
  data?: any;
  relatedData?: any;
};

type TableName = FormContainerProps["table"];

// --- LAZY-LOADED FORMS ---
const TeacherForm = dynamic(() => import("./forms/TeacherForm"));
const StudentForm = dynamic(() => import("./forms/StudentForm"));
const SubjectForm = dynamic(() => import("./forms/SubjectForm"));
const ClassForm = dynamic(() => import("./forms/ClassForm"));
const ParentForm = dynamic(() => import("./forms/ParentForm"));
const LessonForm = dynamic(() => import("./forms/LessonForm"));
const AnnouncementForm = dynamic(() => import("./forms/AnnouncementForm"));
const WorkshopForm = dynamic(() => import("./forms/WorkshopForm"));
const FormationForm = dynamic(() => import("./forms/FormationForm"));

// --- FORM MAP ---
const forms: Partial<Record<TableName, ComponentType<FormComponentProps>>> = {
  subject: SubjectForm,
  class: ClassForm,
  teacher: TeacherForm,
  student: StudentForm,
  parent: ParentForm,
  lesson: LessonForm,
  announcement: AnnouncementForm,
  workshop: WorkshopForm,
  formation: FormationForm,
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
  const tModals = useTranslations("modals");
  const tTables = useTranslations("tables");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const deleteActionMap: Partial<
    Record<TableName, (currentState: any, data: FormData) => Promise<any>>
  > = {
    subject: deleteSubject,
    class: deleteClass,
    teacher: deleteTeacher,
    student: deleteStudent,
    parent: deleteParent,
    lesson: deleteLesson,
    announcement: deleteAnnouncement,
    workshop: deleteWorkshop,
    formation: deleteFormationAction,
  };

  const deleteAction = deleteActionMap[table] || deleteSubject;

  const [state, formAction] = useActionState(deleteAction, {
    success: false,
    error: false,
    message: "",
  });

  const tableName = tTables(table);

  useEffect(() => {
    if (state.success) {
      toast.success(
        tModals("deleteSuccess", { name: tableName })
      );
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
      if (table === "announcement" || table === "lesson") {
        try {
          const bc = new BroadcastChannel("massinissa_announcements_channel");
          bc.postMessage({ type: "ANNOUNCEMENT_CHANGED" });
          bc.close();
        } catch {
          // Ignore
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("massinissa:announcements_updated"));
        }
      }
    }
    if (state.error && state.message) {
      toast.error(state.message || tModals("deleteError", { name: tableName }));
    }
  }, [state, tableName, setOpen, tModals, router, table]);

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
      <h2 className="text-section-title font-bold text-gray-900">
        {tModals("deleteConfirmTitle")}
      </h2>
      <p className="text-table-body text-muted">
        {tModals("deleteConfirmMessage", { name: tableName })}
      </p>
      <div className="flex items-center gap-3 mt-4 w-full">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(false)}
          className="flex-1"
        >
          {tCommon("cancel")}
        </Button>
        <Button
          type="submit"
          variant="danger"
          className="flex-1"
        >
          {tCommon("delete")}
        </Button>
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
  const { can, isLoaded } = usePermission();
  const [open, setOpen] = useState(false);
  const tModals = useTranslations("modals");

  if (isLoaded && !can(type, table)) {
    return null;
  }

  const FormComponent = forms[table];

  const modalContentClasses =
    type === "delete"
      ? "bg-surface rounded-xl border border-border shadow-xl relative w-full max-w-md mx-4"
      : "bg-surface p-6 rounded-xl border border-border shadow-xl relative w-[90%] md:w-[70%] lg:w-[60%] xl:w-[50%] 2xl:w-[40%] max-h-[90vh] overflow-y-auto";

  return (
    <>
      {type === "create" ? (
        <Button
          variant="primary"
          size="icon"
          title={tModals("create")}
          onClick={() => setOpen(true)}
        >
          <Image src="/create.png" alt="" width={14} height={14} className="brightness-0 invert" />
        </Button>
      ) : type === "update" ? (
        <Button
          variant="soft"
          size="icon-sm"
          title={tModals("update")}
          onClick={() => setOpen(true)}
        >
          <Image src="/update.png" alt="" width={14} height={14} />
        </Button>
      ) : (
        <Button
          variant="soft-danger"
          size="icon-sm"
          title={tModals("delete")}
          onClick={() => setOpen(true)}
        >
          <Image src="/delete.png" alt="" width={14} height={14} />
        </Button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={modalContentClasses}>
            <button
              className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors"
              onClick={() => setOpen(false)}
            >
              <Image src="/close.png" alt={tModals("close")} width={14} height={14} />
            </button>

            {type === "delete" && id ? (
              <DeleteConfirmation
                table={table}
                id={id}
                data={data}
                setOpen={setOpen}
              />
            ) : (type === "create" || type === "update") && FormComponent ? (
              <div className="p-2">
                <FormComponent
                  setOpen={setOpen}
                  type={type}
                  data={data}
                  relatedData={relatedData}
                />
              </div>
            ) : (
              <div className="text-center p-8 text-muted">
                {tModals("notFound")}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FormModal;
