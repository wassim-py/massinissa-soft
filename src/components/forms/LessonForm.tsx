"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { LessonSchema, lessonSchema } from "@/lib/formValidationSchemas";
import { createLesson, updateLesson } from "@/lib/actions";

import { useActionState, Dispatch, SetStateAction, useEffect, useState, useMemo, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "react-toastify";
import { Class, Teacher, Classroom } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { Sparkles, User, CheckCircle2, Calendar } from "lucide-react";

export type Day = "SATURDAY" | "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";

type FormState = {
  success: boolean;
  error: boolean;
  message: string;
};

type RelatedClass = Class & {
  teacherId?: string | null;
  branchId?: number;
};

type RelatedClassroom = Classroom & {
  branchId?: number;
};

type BranchItem = {
  id: number;
  name: string;
};

type LessonType = "normal" | "extra" | "catchUp" | "free";

const LessonForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: {
    classes?: RelatedClass[];
    teachers?: Teacher[];
    classrooms?: RelatedClassroom[];
    branches?: BranchItem[];
    isOwner?: boolean;
    userBranchId?: number;
    subjects?: any[];
  };
}) => {
  const router = useRouter();
  const t = useTranslations("lessons");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const getDayTranslation = (day: Day) => {
    const keyMap: Record<Day, string> = {
      SATURDAY: "days.saturday",
      SUNDAY: "days.sunday",
      MONDAY: "days.monday",
      TUESDAY: "days.tuesday",
      WEDNESDAY: "days.wednesday",
      THURSDAY: "days.thursday",
      FRIDAY: "days.friday",
    };
    return t(keyMap[day] as any);
  };
  const formatTime = (date: Date | string | undefined) => {
    if (!date) return "";
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const formatDate = (date: Date | string | undefined | null) => {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const isOwner = Boolean(relatedData?.isOwner);
  const userBranchId = relatedData?.userBranchId ?? 1;
  const classes = relatedData?.classes || [];
  const teachers = relatedData?.teachers || [];
  const classrooms = relatedData?.classrooms || [];
  const branches = relatedData?.branches || [];

  // Determine initial single lesson type
  const initialLessonType: LessonType = data?.isFree
    ? "free"
    : data?.isExtra
    ? "extra"
    : data?.isCatchUp
    ? "catchUp"
    : "normal";

  const [lessonType, setLessonType] = useState<LessonType>(initialLessonType);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<LessonSchema>({
    resolver: zodResolver(lessonSchema),
    defaultValues: data
      ? {
          ...data,
          date: formatDate(data.startsAt),
          startTime: formatTime(data.startTime),
          endTime: formatTime(data.endTime),
          branchId: data.branchId ?? (isOwner ? undefined : userBranchId),
          isExtra: Boolean(data.isExtra),
          extraFee: data.extraFee ? Number(data.extraFee) : undefined,
          isCatchUp: Boolean(data.isCatchUp),
          isFree: Boolean(data.isFree),
        }
      : {
          branchId: isOwner ? undefined : userBranchId,
          isExtra: false,
          isCatchUp: false,
          isFree: false,
        },
  });

  const daysOfWeek: Day[] = [
    "SATURDAY",
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
  ];

  const selectedClassId = watch("classId");
  const selectedBranchId = watch("branchId");

  // Determine active branch for classroom filtering
  const activeBranchId = isOwner
    ? selectedBranchId
      ? Number(selectedBranchId)
      : null
    : userBranchId;

  // Filter classrooms by branch
  const availableClassrooms = useMemo(() => {
    if (!activeBranchId) return classrooms;
    return classrooms.filter((cr) => !cr.branchId || cr.branchId === activeBranchId);
  }, [classrooms, activeBranchId]);

  // Find currently selected group and its assigned head teacher
  const selectedClass = useMemo(() => {
    if (!selectedClassId) return null;
    return classes.find((c) => c.id === Number(selectedClassId)) || null;
  }, [classes, selectedClassId]);

  const assignedTeacher = useMemo(() => {
    if (!selectedClass || !selectedClass.teacherId) return null;
    return teachers.find((t) => t.id === selectedClass.teacherId) || null;
  }, [teachers, selectedClass]);

  // EFFECT: Auto-derive lesson name and auto-fetch head teacher when group changes
  useEffect(() => {
    if (selectedClass) {
      // 1. Auto-derive name from selected group
      setValue("name", selectedClass.name);
      // 2. Auto-fetch teacher from group's head teacher
      if (selectedClass.teacherId) {
        setValue("teacherId", selectedClass.teacherId);
      } else {
        setValue("teacherId", "");
      }
      // If owner has not chosen branch yet, default to group's branch
      if (isOwner && !selectedBranchId && selectedClass.branchId) {
        setValue("branchId", selectedClass.branchId);
      }
    } else {
      setValue("name", "");
      setValue("teacherId", "");
    }
  }, [selectedClass, setValue, isOwner, selectedBranchId]);

  const watchedDate = watch("date");
  const selectedDay = watch("day");

  // EFFECT: Automatically derive day of the week when date is selected for special lessons
  useEffect(() => {
    if (lessonType !== "normal" && watchedDate) {
      const d = new Date(watchedDate + "T12:00:00Z");
      if (!isNaN(d.getTime())) {
        const dayMap: Day[] = [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ];
        const derivedDay = dayMap[d.getUTCDay()];
        setValue("day", derivedDay, { shouldValidate: true });
      }
    }
  }, [lessonType, watchedDate, setValue]);

  // Single lesson type change handler
  const handleTypeSelect = (typeVal: LessonType) => {
    setLessonType(typeVal);
    setValue("isExtra", typeVal === "extra");
    setValue("isCatchUp", typeVal === "catchUp");
    setValue("isFree", typeVal === "free");
    setValue("extraFee", undefined);
  };

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createLesson : updateLesson;
  const [state, formAction, isPending] = useActionState(actionToRun, initialState);

  const onSubmit = handleSubmit((formData) => {
    startTransition(() => {
      formAction(formData);
    });
  });

  useEffect(() => {
    if (state.success) {
      toast.success(
        state.message ||
          (type === "create" ? t("createdSuccessfully") : t("updatedSuccessfully"))
      );
      setOpen(false);

      // Instantly notify AnnouncementNotificationProvider across all open tabs
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

      startTransition(() => {
        router.refresh();
      });
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen, t, router]);

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      {/* Hidden field for auto-derived name */}
      <input type="hidden" {...register("name")} />
      {/* Hidden field for auto-fetched teacher */}
      <input type="hidden" {...register("teacherId")} />
      {/* Hidden fields for single lesson type flags */}
      <input type="hidden" {...register("isExtra")} />
      <input type="hidden" {...register("isCatchUp")} />
      <input type="hidden" {...register("isFree")} />

      {/* If branch admin, branchId is locked and hidden */}
      {!isOwner && (
        <input type="hidden" {...register("branchId")} value={userBranchId} />
      )}

      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? t("createTitle") : t("updateTitle")}
      </h1>

      {/* Auto-derived Lesson Name banner when class is selected */}
      {selectedClass && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-primary/20 bg-primary-light/60 text-sm transition-all">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-soft/70 flex items-center justify-center text-primary-hover shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted font-medium">{t("group")}</span>
              <span className="font-bold text-gray-900">{selectedClass.name}</span>
            </div>
          </div>
          <Badge variant="primary" size="sm">
            {t("autoDerivedNameBadge")}
          </Badge>
        </div>
      )}

      {/* Responsive Form Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Branch Selector (Visible ONLY to Owner) */}
        {isOwner && (
          <FormField
            label={t("selectBranch")}
            required
            error={errors.branchId?.message?.toString()}
          >
            <Select
              hasError={!!errors.branchId}
              {...register("branchId")}
            >
              <option value="">{t("selectBranch")}</option>
              {branches.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {/* Group (Class) Selector */}
        <FormField
          label={t("group")}
          required
          error={errors.classId?.message?.toString()}
        >
          <Select
            hasError={!!errors.classId}
            {...register("classId")}
          >
            <option value="">{t("selectClass")}</option>
            {classes.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Auto-fetched Head Teacher Display (Read-Only) */}
        <FormField
          label={t("teacher")}
          error={errors.teacherId?.message?.toString()}
        >
          <div className="w-full px-3 py-2 text-table-body rounded-lg border border-border bg-surface-subtle text-gray-800 shadow-xs flex items-center justify-between min-h-[42px]">
            {assignedTeacher ? (
              <div className="flex items-center gap-2 font-medium text-gray-900">
                <User className="w-4 h-4 text-primary shrink-0" />
                <span>
                  {assignedTeacher.name}
                </span>
              </div>
            ) : selectedClass ? (
              <Badge variant="warning" size="sm">
                {t("noTeacherAssigned")}
              </Badge>
            ) : (
              <span className="text-xs text-muted italic">
                {t("autoFetchedFromGroup")}
              </span>
            )}
          </div>
        </FormField>

        {/* Room / Classroom Selector */}
        <FormField
          label={t("room")}
          required
          error={errors.classroomId?.message?.toString()}
        >
          <Select
            hasError={!!errors.classroomId}
            {...register("classroomId")}
          >
            <option value="">{t("selectRoom")}</option>
            {availableClassrooms.map((room) => (
              <option value={room.id} key={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Date for Special Lessons */}
        {lessonType !== "normal" && (
          <FormField
            label={t("lessonDate")}
            required
            error={errors.date?.message?.toString()}
          >
            <Input
              type="date"
              hasError={!!errors.date}
              {...register("date")}
            />
          </FormField>
        )}

        {/* Day of Week: Auto-derived for Special Lessons (Read-Only), Manual Dropdown for Normal Lessons */}
        {lessonType !== "normal" ? (
          <FormField
            label={t("dayLabel")}
            error={errors.day?.message?.toString()}
          >
            <input type="hidden" {...register("day")} />
            <div className="w-full px-3 py-2 text-table-body rounded-lg border border-border bg-surface-subtle text-gray-800 shadow-xs flex items-center justify-between min-h-[42px]">
              {selectedDay ? (
                <div className="flex items-center gap-2 font-medium text-gray-900">
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <span>{getDayTranslation(selectedDay)}</span>
                </div>
              ) : (
                <span className="text-xs text-muted italic">
                  {t("autoFetchedFromDate")}
                </span>
              )}
              {selectedDay && (
                <Badge variant="primary" size="sm">
                  {t("autoDerivedBadge")}
                </Badge>
              )}
            </div>
          </FormField>
        ) : (
          <FormField
            label={t("dayLabel")}
            required
            error={errors.day?.message?.toString()}
          >
            <Select
              hasError={!!errors.day}
              {...register("day")}
            >
              <option value="">{t("selectDay")}</option>
              {daysOfWeek.map((day) => (
                <option value={day} key={day}>
                  {getDayTranslation(day)}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {/* Start Time */}
        <FormField
          label={t("startTime")}
          required
          error={errors.startTime?.message?.toString()}
        >
          <Input
            type="time"
            hasError={!!errors.startTime}
            {...register("startTime")}
          />
        </FormField>

        {/* End Time */}
        <FormField
          label={t("endTime")}
          required
          error={errors.endTime?.message?.toString()}
        >
          <Input
            type="time"
            hasError={!!errors.endTime}
            {...register("endTime")}
          />
        </FormField>
      </div>

      {/* SINGLE LESSON TYPE SELECTOR (Normal, Extra, CatchUp, Free) */}
      <div className="flex flex-col gap-2.5">
        <label className="text-form-label text-gray-700 select-none font-medium">
          {t("sessionTypeTitle")}
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Normal Option */}
          <div
            onClick={() => handleTypeSelect("normal")}
            className={`cursor-pointer p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 select-none ${
              lessonType === "normal"
                ? "bg-primary-light/70 border-primary ring-1 ring-primary/30 shadow-xs"
                : "bg-surface border-border hover:border-gray-300 hover:bg-surface-subtle/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  lessonType === "normal" ? "text-primary-hover" : "text-gray-800"
                }`}
              >
                {t("isNormalLabel")}
              </span>
              <input
                type="radio"
                name="lessonTypeRadio"
                checked={lessonType === "normal"}
                onChange={() => handleTypeSelect("normal")}
                className="w-4 h-4 text-primary focus:ring-primary cursor-pointer accent-primary"
              />
            </div>
            <p
              className={`text-xs ${
                lessonType === "normal" ? "text-primary-hover/80" : "text-muted"
              }`}
            >
              {t("isNormalDesc")}
            </p>
          </div>

          {/* Extra Option */}
          <div
            onClick={() => handleTypeSelect("extra")}
            className={`cursor-pointer p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 select-none ${
              lessonType === "extra"
                ? "bg-secondary-light/70 border-secondary ring-1 ring-secondary/30 shadow-xs"
                : "bg-surface border-border hover:border-gray-300 hover:bg-surface-subtle/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  lessonType === "extra" ? "text-secondary-hover" : "text-gray-800"
                }`}
              >
                {t("isExtraLabel")}
              </span>
              <input
                type="radio"
                name="lessonTypeRadio"
                checked={lessonType === "extra"}
                onChange={() => handleTypeSelect("extra")}
                className="w-4 h-4 text-secondary focus:ring-secondary cursor-pointer accent-secondary"
              />
            </div>
            <p
              className={`text-xs ${
                lessonType === "extra" ? "text-secondary-hover/80" : "text-muted"
              }`}
            >
              {t("isExtraDesc")}
            </p>
          </div>

          {/* Catch-up Option */}
          <div
            onClick={() => handleTypeSelect("catchUp")}
            className={`cursor-pointer p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 select-none ${
              lessonType === "catchUp"
                ? "bg-accent-light/70 border-accent ring-1 ring-accent/30 shadow-xs"
                : "bg-surface border-border hover:border-gray-300 hover:bg-surface-subtle/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  lessonType === "catchUp" ? "text-accent-hover" : "text-gray-800"
                }`}
              >
                {t("isCatchUpLabel")}
              </span>
              <input
                type="radio"
                name="lessonTypeRadio"
                checked={lessonType === "catchUp"}
                onChange={() => handleTypeSelect("catchUp")}
                className="w-4 h-4 text-accent focus:ring-accent cursor-pointer accent-accent"
              />
            </div>
            <p
              className={`text-xs ${
                lessonType === "catchUp" ? "text-accent-hover/80" : "text-muted"
              }`}
            >
              {t("isCatchUpDesc")}
            </p>
          </div>

          {/* Free Option */}
          <div
            onClick={() => handleTypeSelect("free")}
            className={`cursor-pointer p-3.5 rounded-xl border transition-all flex flex-col gap-1.5 select-none ${
              lessonType === "free"
                ? "bg-success-light/70 border-success ring-1 ring-success/30 shadow-xs"
                : "bg-surface border-border hover:border-gray-300 hover:bg-surface-subtle/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  lessonType === "free" ? "text-success-text" : "text-gray-800"
                }`}
              >
                {t("isFreeLabel")}
              </span>
              <input
                type="radio"
                name="lessonTypeRadio"
                checked={lessonType === "free"}
                onChange={() => handleTypeSelect("free")}
                className="w-4 h-4 text-success focus:ring-success cursor-pointer accent-success"
              />
            </div>
            <p
              className={`text-xs ${
                lessonType === "free" ? "text-success-text/80" : "text-muted"
              }`}
            >
              {t("isFreeDesc")}
            </p>
          </div>
        </div>

        {/* Informative note when "free" is active */}
        {lessonType === "free" && (
          <div className="mt-1 p-3 rounded-xl bg-success-light text-success-text text-xs border border-success-soft flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
            <span>{t("freeNote")}</span>
          </div>
        )}

        {/* Informative note when a special lesson is active */}
        {lessonType !== "normal" && (
          <div className="mt-1 p-3 rounded-xl bg-secondary-light/60 text-secondary-hover text-xs border border-secondary/30 flex items-center gap-2">
            <Calendar className="w-4 h-4 shrink-0 text-secondary" />
            <span>{t("specialDateNote")}</span>
          </div>
        )}

        {errors.isExtra?.message && (
          <p className="text-form-helper text-danger font-medium">
            {errors.isExtra.message.toString()}
          </p>
        )}
      </div>

      {state?.error && !state.message && (
        <span className="text-sm text-danger font-medium text-center">{t("errorOccurred")}</span>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isPending}
        disabled={isPending}
        className="w-full mt-2"
      >
        {isPending
          ? type === "create"
            ? t("submittingCreate")
            : t("submittingUpdate")
          : type === "create"
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default LessonForm;