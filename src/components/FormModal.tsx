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
import { getFormRelatedDataAction } from "@/lib/formRelatedDataAction";
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

// Short-lived client cache for table-wide create dropdowns (avoids refetching on repeated modal opens)
const formRelatedDataCache = new Map<string, { relatedData: any; expiresAt: number }>();
const FORM_RELATED_CACHE_TTL_MS = 30_000;

function invalidateFormRelatedDataCache() {
  formRelatedDataCache.clear();
}
import { toast } from "react-toastify";
import { FormContainerProps } from "./FormContainer";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import { usePermission } from "@/hooks/usePermission";
import { useRouter } from "@/i18n/navigation";

// --- TYPE DEFINITIONS ---
type FormComponentProps = {
  setOpen: Dispatch<SetStateAction<boolean>>;
  type: "create" | "update";
  data?: any;
  relatedData?: any;
  onSuccess?: (result?: any) => void;
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
const PaymentForm = dynamic(() => import("./forms/PaymentForm"));

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
  const locale = useLocale();
  const router = useRouter();
  const isNormalRecurringLessonDelete =
    table === "lesson" &&
    (!data ||
      (!data.isExtra &&
        !data.isCatchUp &&
        !data.isFree &&
        !data.isSingleOccurrence));

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
      invalidateFormRelatedDataCache();
      toast.success(
        state.message || tModals("deleteSuccess", { name: tableName })
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
        {isNormalRecurringLessonDelete
          ? locale === "ar"
            ? "سيتم حذف الحصص القادمة فقط لهذا الموعد. ستبقى جميع الحصص السابقة وتواريخها وسجلات حضورها محفوظة كما هي."
            : "Seules les séances futures de ce créneau seront supprimées. Toutes les anciennes séances, dates et présences enregistrées seront conservées."
          : tModals("deleteConfirmMessage", { name: tableName })}
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
  const router = useRouter();
  const tModals = useTranslations("modals");
  const tCommon = useTranslations("common");

  const [paymentHandover, setPaymentHandover] = useState<{
    isOpen: boolean;
    student: any;
    classData: any;
  }>({
    isOpen: false,
    student: null,
    classData: null,
  });

  const hasPreSuppliedRelated =
    Boolean(relatedData && typeof relatedData === "object" && Object.keys(relatedData).length > 0);
  const needsLazyLoad = type !== "delete" && !hasPreSuppliedRelated;

  const [lazyLoading, setLazyLoading] = useState(false);
  const [resolvedRelatedData, setResolvedRelatedData] = useState<any>(
    hasPreSuppliedRelated ? relatedData : undefined
  );
  const [resolvedData, setResolvedData] = useState<any>(data);

  useEffect(() => {
    if (hasPreSuppliedRelated) {
      setResolvedRelatedData(relatedData);
    }
  }, [hasPreSuppliedRelated, relatedData]);

  useEffect(() => {
    setResolvedData(data);
  }, [data]);

  useEffect(() => {
    if (!open || !needsLazyLoad) return;

    const isCacheableTableWide =
      type === "create" || table === "subject" || table === "parent" || table === "announcement";
    const cacheKey = `${table}:${type}`;
    if (isCacheableTableWide) {
      const cached = formRelatedDataCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        setResolvedRelatedData(cached.relatedData);
        setLazyLoading(false);
        return;
      }
    }

    let cancelled = false;
    setLazyLoading(true);
    getFormRelatedDataAction({
      table,
      type: type as "create" | "update",
      id,
      data,
    })
      .then((res) => {
        if (cancelled) return;
        setResolvedRelatedData(res.relatedData || {});
        if (res.data !== undefined) {
          setResolvedData(res.data);
        }
        if (isCacheableTableWide) {
          formRelatedDataCache.set(cacheKey, {
            relatedData: res.relatedData || {},
            expiresAt: Date.now() + FORM_RELATED_CACHE_TTL_MS,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedRelatedData({});
        }
      })
      .finally(() => {
        if (!cancelled) setLazyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, needsLazyLoad, table, type, id, data]);

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
              lazyLoading && !resolvedRelatedData ? (
                <div className="p-8 flex flex-col items-center justify-center gap-3 text-sm text-muted">
                  <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <span>{tCommon("loading")}</span>
                </div>
              ) : (
                <div className="p-2">
                  <FormComponent
                    setOpen={setOpen}
                    type={type}
                    data={resolvedData}
                    relatedData={resolvedRelatedData || {}}
                    onSuccess={(result: any) => {
                      invalidateFormRelatedDataCache();
                      if (table === "student" && result?.andPay && result?.student && result?.classData) {
                        setOpen(false);
                        setPaymentHandover({
                          isOpen: true,
                          student: result.student,
                          classData: result.classData,
                        });
                      } else {
                        setOpen(false);
                        startTransition(() => {
                          router.refresh();
                        });
                      }
                    }}
                  />
                </div>
              )
            ) : (
              <div className="text-center p-8 text-muted">
                {tModals("notFound")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Immediate Payment Handover Modal (e.g. from Student Creation) */}
      {paymentHandover.isOpen && paymentHandover.student && paymentHandover.classData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-2xl relative w-full max-w-md max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setPaymentHandover({ isOpen: false, student: null, classData: null });
                startTransition(() => {
                  router.refresh();
                });
              }}
              className="absolute top-4 end-4 text-muted hover:text-gray-900 z-10 p-1.5 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <Image src="/close.png" alt={tCommon("cancel")} width={14} height={14} />
            </button>
            <PaymentForm
              student={paymentHandover.student}
              classData={paymentHandover.classData}
              setOpen={(isOpen) => {
                setPaymentHandover((prev) => ({ ...prev, isOpen }));
                if (!isOpen) {
                  startTransition(() => {
                    router.refresh();
                  });
                }
              }}
              type="create"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default FormModal;
