"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import FormationGroupModal from "./FormationGroupModal";
import DeleteFormationGroupModal from "./DeleteFormationGroupModal";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface BaseProps {
  languageId: number;
  languageName: string;
  formationLevel: {
    id: number;
    name: string;
    levelNumber?: number;
    lumpSumPrice?: number | any;
  };
  branches: Array<{ id: number; name: string }>;
  teachers: Array<{ id: string; name: string }>;
  defaultBranchId?: number;
  defaultAgeGroup?: string | null;
}

type AddLevelGroupProps = BaseProps & {
  variant: "add-level-group";
  existingGroupsCount: number;
  compact?: boolean;
};

type ManageActiveGroupProps = BaseProps & {
  variant: "manage-active-group";
  activeGroup: {
    id: number;
    name: string;
    branchId: number;
    teacherId?: string | null;
    ageGroup?: string | null;
    enrolledCount: number;
    activeVouchersCount?: number;
  };
  totalGroupsInLevel: number;
  fallbackGroupId?: number | null;
};

export type FormationGroupActionsBarProps =
  | AddLevelGroupProps
  | ManageActiveGroupProps;

export default function FormationGroupActionsBar(
  props: FormationGroupActionsBarProps
) {
  const t = useTranslations("formations");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  if (props.variant === "add-level-group") {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsGroupModalOpen(true);
          }}
          title={t("addGroupToLevel")}
          className={
            props.compact
              ? "inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
              : "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary-hover shadow-2xs transition-colors cursor-pointer"
          }
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{props.compact ? (locale === "ar" ? "فوج" : "Groupe") : t("addGroupToLevel")}</span>
        </button>

        <FormationGroupModal
          isOpen={isGroupModalOpen}
          onClose={() => setIsGroupModalOpen(false)}
          mode="create"
          languageName={props.languageName}
          formationLevel={props.formationLevel}
          existingGroupsCount={props.existingGroupsCount}
          defaultBranchId={props.defaultBranchId}
          defaultAgeGroup={props.defaultAgeGroup}
          branches={props.branches}
          teachers={props.teachers}
          onSuccess={(savedGroup) => {
            if (savedGroup?.id) {
              router.push(
                `/${locale}/list/formations/${props.languageId}?lang=1&group=${savedGroup.id}#level-details`
              );
            } else {
              router.refresh();
            }
          }}
        />
      </>
    );
  }

  const fallbackUrl = props.fallbackGroupId
    ? `/${locale}/list/formations/${props.languageId}?lang=1&group=${props.fallbackGroupId}#level-details`
    : `/${locale}/list/formations/${props.languageId}?lang=1`;

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsGroupModalOpen(true)}
          title={t("editGroupTitle")}
          className="h-8 px-2.5 text-xs"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline ms-1">{tCommon("edit")}</span>
        </Button>

        <Button
          type="button"
          variant="soft-danger"
          size="sm"
          onClick={() => setIsDeleteModalOpen(true)}
          title={t("deleteGroupTitle")}
          className="h-8 px-2 text-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <FormationGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        mode="edit"
        languageName={props.languageName}
        formationLevel={props.formationLevel}
        groupData={props.activeGroup}
        defaultBranchId={props.defaultBranchId}
        defaultAgeGroup={props.defaultAgeGroup}
        branches={props.branches}
        teachers={props.teachers}
        onSuccess={() => router.refresh()}
      />

      <DeleteFormationGroupModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        group={props.activeGroup}
        levelName={props.formationLevel.name}
        totalGroupsInLevel={props.totalGroupsInLevel}
        fallbackGroupUrl={fallbackUrl}
      />
    </>
  );
}
