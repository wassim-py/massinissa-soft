"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { announcementSchema, AnnouncementSchema } from "@/lib/formValidationSchemas";
import { createAnnouncement, updateAnnouncement } from "@/lib/actions";
import { useActionState, Dispatch, SetStateAction, useEffect, useState, startTransition } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

// Helper to format a date for a datetime-local input
const formatDateTimeLocal = (date?: Date | string): string => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const timezoneOffset = d.getTimezoneOffset() * 60000;
  const localDate = new Date(d.getTime() - timezoneOffset);
  return localDate.toISOString().slice(0, 16);
};

const AnnouncementForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: {
    branches?: Array<{ id: number; name: string }>;
    isOwner?: boolean;
    userBranchIds?: number[];
  };
}) => {
  const tAnnouncements = useTranslations("announcements");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AnnouncementSchema>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      ...data,
      isPinned: data?.isPinned || false,
      branchId: data?.branchId !== undefined && data?.branchId !== null ? data.branchId : undefined,
      isTemporary: Boolean(data?.expiresAt),
      expiresAt: data?.expiresAt ? formatDateTimeLocal(data.expiresAt) : "",
    },
  });

  const isTemporary = watch("isTemporary");

  const [state, formAction, isPending] = useActionState(
    type === "create" ? createAnnouncement : updateAnnouncement,
    { success: false, error: false, message: "" }
  );

  const onSubmit = handleSubmit((formData) => {
    startTransition(() => {
      formAction(formData);
    });
  });

  useEffect(() => {
    if (state?.success) {
      toast.success(
        state.message || (type === "create" ? tAnnouncements("createdSuccessfully") : tAnnouncements("updatedSuccessfully"))
      );
      setOpen(false);
      startTransition(() => {
        router.refresh();
      });
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
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state, setOpen, type, tAnnouncements, router]);

  const { branches } = relatedData || {};

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? tAnnouncements("createTitle") : tAnnouncements("updateTitle")}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        {type === "update" && <input type="hidden" {...register("id")} />}

        {/* TITLE */}
        <div className="w-full md:w-[48%] flex flex-col gap-2">
          <label className="text-xs text-gray-500 font-medium">{tAnnouncements("announcementTitle")}</label>
          <input
            type="text"
            {...register("title")}
            placeholder={tAnnouncements("titlePlaceholder")}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors?.title && (
            <p className="text-xs text-red-500">{errors.title.message?.toString()}</p>
          )}
        </div>

        {/* TARGET BRANCH SELECTOR (§1.7: supports targeting specific branch or whole school) */}
        <div className="w-full md:w-[48%] flex flex-col gap-2">
          <label className="text-xs text-gray-500 font-medium">{tAnnouncements("targetBranch")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...register("branchId")}
          >
            <option value="">{tAnnouncements("allBranches")}</option>
            {branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {errors.branchId && (
            <p className="text-xs text-red-400">{errors.branchId.message?.toString()}</p>
          )}
        </div>

        {/* DESCRIPTION */}
        <div className="w-full flex flex-col gap-2">
          <label className="text-xs text-gray-500 font-medium">{tAnnouncements("description")}</label>
          <textarea
            rows={5}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...register("description")}
            placeholder={tAnnouncements("descriptionPlaceholder")}
          />
          {errors.description && (
            <p className="text-xs text-red-400">{errors.description.message?.toString()}</p>
          )}
        </div>

        {/* PINNED ANNOUNCEMENT */}
        <div className="w-full flex items-center gap-2">
            <input
                type="checkbox"
                id="isPinned"
                {...register("isPinned")}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="isPinned" className="text-sm font-medium text-gray-700 cursor-pointer">{tAnnouncements("isPinned")}</label>
        </div>

        {/* TEMPORARY ANNOUNCEMENT TOGGLE */}
        <div className="w-full p-3 rounded-lg border border-amber-200 bg-amber-50/60 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isTemporary"
                    {...register("isTemporary")}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="isTemporary" className="text-sm font-medium text-amber-900 cursor-pointer">
                    {tAnnouncements("isTemporary")}
                </label>
            </div>

            {isTemporary && (
                <div className="flex flex-col gap-1.5 pt-1">
                    <label className="text-xs font-medium text-amber-900">
                        {tAnnouncements("expiresAt")} <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="datetime-local"
                        {...register("expiresAt")}
                        className="ring-[1.5px] ring-amber-300 p-2 rounded-md text-sm w-full sm:w-72 bg-white h-[40px]"
                    />
                    <p className="text-xs text-amber-700">
                        {tAnnouncements("expiresAtHelp")}
                    </p>
                    {errors.expiresAt && (
                        <p className="text-xs text-red-500 font-medium">{errors.expiresAt.message?.toString()}</p>
                    )}
                </div>
            )}
        </div>
      </div>

      {state?.error && !state.message && <span className="text-red-500">{tErrors("general")}</span>}
      <Button 
        type="submit" 
        variant="primary"
        size="lg"
        disabled={isPending}
        className="w-full"
      >
        {isPending
          ? type === 'create'
            ? tAnnouncements("submittingCreate")
            : tAnnouncements("submittingUpdate")
          : type === 'create'
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default AnnouncementForm;
