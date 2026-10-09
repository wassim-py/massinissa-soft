"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useTranslations, useLocale } from "next-intl";
import { FilterTabs } from "@/components/ui/FilterTabs";
import EnrollExistingStudentTab from "@/components/forms/EnrollExistingStudentTab";

const StudentForm = dynamic(() => import("@/components/forms/StudentForm"), { ssr: false });

export interface EnrollStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  formationClass: {
    id: number;
    name: string;
    branchId?: number | null;
    branch?: { name?: string };
    FormationLevel?: { id?: number; name?: string };
    levelId?: number | null;
  };
  studentRelatedData?: {
    grades?: Array<{ id: number; level?: string; name?: string }>;
    classes?: Array<{ id: number; name: string; levelId?: number | null }>;
  };
  students?: Array<{ id: string; name: string; phone?: string | null }>;
  onSuccess?: (student?: any) => void;
  onEnrollAndPay?: (student: any) => void;
}

export default function EnrollStudentModal({
  isOpen,
  onClose,
  formationClass,
  studentRelatedData = { grades: [], classes: [] },
  onSuccess,
  onEnrollAndPay,
}: EnrollStudentModalProps) {
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [activeRegisterTab, setActiveRegisterTab] = useState<"create" | "enroll_existing">("create");
  const [preselectedStudentForEnroll, setPreselectedStudentForEnroll] = useState<any>(null);

  const resolvedStudentRelatedData = useMemo(() => {
    const grades = studentRelatedData?.grades || [];
    let classesList = studentRelatedData?.classes ? [...studentRelatedData.classes] : [];
    if (!classesList.some((c) => c.id === formationClass.id)) {
      classesList.push({
        id: formationClass.id,
        name: formationClass.name,
        levelId: formationClass.levelId,
      });
    }
    return { grades, classes: classesList };
  }, [studentRelatedData, formationClass.id, formationClass.name, formationClass.levelId]);

  if (!isOpen) return null;

  const setOpenProxy: React.Dispatch<React.SetStateAction<boolean>> = (value) => {
    const shouldOpen = typeof value === "function" ? value(isOpen) : value;
    if (!shouldOpen) {
      onClose();
      setPreselectedStudentForEnroll(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface p-6 rounded-xl border border-border shadow-xl relative w-[90%] md:w-[70%] lg:w-[60%] xl:w-[50%] 2xl:w-[40%] max-h-[90vh] overflow-y-auto space-y-4">
        <button
          type="button"
          className="absolute top-4 end-4 cursor-pointer p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors z-10"
          onClick={() => {
            onClose();
            setPreselectedStudentForEnroll(null);
          }}
        >
          <Image src="/close.png" alt={tCommon("cancel")} width={14} height={14} />
        </button>

        {/* Two Tabs: Create New vs Enroll Existing */}
        <div className="pt-1">
          <FilterTabs
            tabs={[
              {
                id: "create",
                label: locale === "ar" ? "إنشاء تلميذ جديد" : "Créer un nouvel élève",
              },
              {
                id: "enroll_existing",
                label: locale === "ar" ? "تسجيل تلميذ مسجل مسبقاً" : "Inscrire un élève existant",
              },
            ]}
            activeTab={activeRegisterTab}
            onTabChange={(tabId) => setActiveRegisterTab(tabId as any)}
            size="md"
          />
        </div>

        <div className="p-1">
          {activeRegisterTab === "create" ? (
            <StudentForm
              type="create"
              setOpen={setOpenProxy}
              data={{
                classes: [formationClass.id],
                gradeId: formationClass.levelId || undefined,
                registeredBranchId: formationClass.branchId || undefined,
                targetClassName: formationClass.name,
              }}
              relatedData={resolvedStudentRelatedData}
              onSwitchToExisting={(existingStudent) => {
                setPreselectedStudentForEnroll(existingStudent);
                setActiveRegisterTab("enroll_existing");
              }}
              onSuccess={(result) => {
                onClose();
                setPreselectedStudentForEnroll(null);
                if (result?.andPay && result?.student) {
                  if (onEnrollAndPay) {
                    onEnrollAndPay(result.student);
                  }
                } else {
                  if (onSuccess) {
                    onSuccess(result?.student);
                  }
                }
              }}
            />
          ) : (
            <EnrollExistingStudentTab
              classId={formationClass.id}
              className={formationClass.name}
              initialSelectedStudent={preselectedStudentForEnroll}
              onClose={() => {
                onClose();
                setPreselectedStudentForEnroll(null);
              }}
              onSuccess={(student) => {
                onClose();
                setPreselectedStudentForEnroll(null);
                if (onSuccess) {
                  onSuccess(student);
                }
              }}
              onEnrollAndPay={(student) => {
                onClose();
                setPreselectedStudentForEnroll(null);
                if (onEnrollAndPay) {
                  onEnrollAndPay(student);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
