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
import { SearchableGroupSelect } from "@/components/ui/SearchableGroupSelect";
import { Sparkles, User, CheckCircle2, Calendar, Users, Building, MapPin } from "lucide-react";

export type Day = "SATURDAY" | "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";

type FormState = {
  success: boolean;
  error: boolean;
  message: string;
};

type RelatedClass = Class & {
  teacherId?: string | null;
  branchId?: number;
  levelId?: number | null;
  formationLevelId?: number | null;
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
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Algiers",
    }).format(d);
  };

  const formatDate = (date: Date | string | undefined | null) => {
    if (!date) return "";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Africa/Algiers",
    }).format(d);
  };

  const isOwner = Boolean(relatedData?.isOwner);
  const userBranchId = relatedData?.userBranchId ?? 1;
  const classes = useMemo(() => relatedData?.classes || [], [relatedData?.classes]);
  const teachers = useMemo(() => relatedData?.teachers || [], [relatedData?.teachers]);
  const classrooms = useMemo(() => relatedData?.classrooms || [], [relatedData?.classrooms]);
  const branches = useMemo(() => relatedData?.branches || [], [relatedData?.branches]);

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
          date: (data.isExtra || data.isCatchUp || data.isFree) ? formatDate(data.startsAt) : undefined,
          startTime: formatTime(data.startTime),
          endTime: formatTime(data.endTime),
          branchId: data.branchId ?? (isOwner ? undefined : userBranchId),
          isExtra: Boolean(data.isExtra),
          extraFee: data.extraFee ? Number(data.extraFee) : undefined,
          isCatchUp: Boolean(data.isCatchUp),
          isFree: Boolean(data.isFree),
        }
      : {
          branchId: userBranchId || (branches[0]?.id ?? 1),
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

  // Find currently selected group and its assigned head teacher
  const selectedClass = useMemo(() => {
    if (!selectedClassId) return null;
    return classes.find((c) => c.id === Number(selectedClassId)) || null;
  }, [classes, selectedClassId]);

  // Classroom branch filter for special lessons: allow choosing any branch if own branch is out of classrooms
  const [classroomBranchFilter, setClassroomBranchFilter] = useState<number | "all">("all");

  // Sync classroomBranchFilter when selectedClass changes
  useEffect(() => {
    if (selectedClass?.branchId) {
      setClassroomBranchFilter(selectedClass.branchId);
    }
  }, [selectedClass?.branchId]);

  // Filter classrooms by branch
  // - For normal recurring lessons: strictly limited to the group's branch
  // - For special lessons (extra, catch-up, free): if out of classrooms in own branch, admin can pick from any other branch
  const availableClassrooms = useMemo(() => {
    const targetBranchId = selectedClass?.branchId || (activeBranchId ? Number(activeBranchId) : null);
    if (lessonType === "normal") {
      if (!targetBranchId) return classrooms;
      return classrooms.filter((cr) => !cr.branchId || cr.branchId === targetBranchId);
    }
    // Special lesson:
    if (classroomBranchFilter === "all") {
      return classrooms;
    }
    return classrooms.filter((cr) => cr.branchId === Number(classroomBranchFilter));
  }, [classrooms, activeBranchId, selectedClass, lessonType, classroomBranchFilter]);

  const watchedClassroomId = watch("classroomId");
  const chosenClassroom = useMemo(() => {
    if (!watchedClassroomId) return null;
    return classrooms.find((cr) => cr.id === Number(watchedClassroomId)) || null;
  }, [classrooms, watchedClassroomId]);

  const isCrossBranchRoom = useMemo(() => {
    if (!chosenClassroom || !chosenClassroom.branchId) return false;
    const groupBranch = selectedClass?.branchId || (activeBranchId ? Number(activeBranchId) : null);
    return Boolean(groupBranch && chosenClassroom.branchId !== groupBranch);
  }, [chosenClassroom, selectedClass, activeBranchId]);

  const hostingBranch = useMemo(() => {
    if (!chosenClassroom?.branchId) return null;
    return branches.find((b) => b.id === chosenClassroom.branchId) || null;
  }, [branches, chosenClassroom]);

  // Keep branchId field synced with chosen classroom branch for special lessons
  useEffect(() => {
    if (lessonType !== "normal" && chosenClassroom?.branchId) {
      setValue("branchId", chosenClassroom.branchId);
    } else if (lessonType === "normal") {
      setValue("branchId", selectedClass?.branchId || userBranchId);
    }
  }, [lessonType, chosenClassroom?.branchId, selectedClass?.branchId, userBranchId, setValue]);

  const assignedTeacher = useMemo(() => {
    if (!selectedClass || !selectedClass.teacherId) return null;
    return teachers.find((t) => t.id === selectedClass.teacherId) || null;
  }, [teachers, selectedClass]);

  const [additionalClassIds, setAdditionalClassIds] = useState<number[]>(
    Array.isArray(data?.additionalClassIds) ? data.additionalClassIds.map(Number) : []
  );

  // Filter sibling groups belonging to the same teacher in the same level
  const availableSiblingGroups = useMemo(() => {
    if (!selectedClass || !selectedClass.teacherId) return [];
    const targetBranchId = selectedClass.branchId || (activeBranchId ? Number(activeBranchId) : null);
    return classes.filter((c) => {
      if (c.id === selectedClass.id) return false;
      if (c.teacherId !== selectedClass.teacherId) return false;

      // Group matching: must share the same regular level or the same formation level
      const sameRegularLevel = Boolean(selectedClass.levelId && c.levelId === selectedClass.levelId);
      const sameFormationLevel = Boolean(
        selectedClass.formationLevelId && c.formationLevelId === selectedClass.formationLevelId
      );
      if (!sameRegularLevel && !sameFormationLevel) return false;

      // Sibling group must belong to the same branch as the primary group
      if (targetBranchId && c.branchId && c.branchId !== targetBranchId) return false;
      return true;
    });
  }, [classes, selectedClass, activeBranchId]);



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
    if (typeVal === "normal") {
      setAdditionalClassIds([]);
      setValue("additionalClassIds", []);
      // Reset classroom branch back to group's branch
      const homeBranch = selectedClass?.branchId || (activeBranchId ? Number(activeBranchId) : 1);
      setClassroomBranchFilter(homeBranch);
      const currentRoom = classrooms.find((cr) => cr.id === Number(watch("classroomId")));
      if (currentRoom?.branchId && currentRoom.branchId !== homeBranch) {
        setValue("classroomId", "" as any);
      }
    }
  };

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createLesson : updateLesson;
  const [state, formAction, isPending] = useActionState(actionToRun, initialState);

  const onSubmit = handleSubmit((formData) => {
    const additionalNames = classes
      .filter((c) => additionalClassIds.includes(c.id))
      .map((c) => c.name);
    const combinedName = selectedClass
      ? [selectedClass.name, ...additionalNames].join(" + ")
      : formData.name || "";

    const selectedRoom = classrooms.find((cr) => cr.id === Number(formData.classroomId));
    const effectiveBranchId =
      lessonType !== "normal" && selectedRoom?.branchId
        ? selectedRoom.branchId
        : (selectedClass?.branchId || formData.branchId);

    startTransition(() => {
      formAction({
        ...formData,
        name: combinedName,
        teacherId: selectedClass?.teacherId || formData.teacherId || "",
        branchId: effectiveBranchId,
        additionalClassIds: lessonType !== "normal" ? additionalClassIds : [],
      });
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
              <span className="font-bold text-gray-900">
                {[
                  selectedClass.name,
                  ...classes.filter((c) => additionalClassIds.includes(c.id)).map((c) => c.name),
                ].join(" + ")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {additionalClassIds.length > 0 && (
              <Badge variant="secondary" size="sm">
                {additionalClassIds.length + 1} {locale === "ar" ? "أفواج" : "Groupes"}
              </Badge>
            )}
            <Badge variant="primary" size="sm">
              {t("autoDerivedNameBadge")}
            </Badge>
          </div>
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
          <input type="hidden" {...register("classId")} />
          <SearchableGroupSelect
            options={classes.map((c) => ({
              id: c.id,
              name: c.name,
            }))}
            value={selectedClassId ? Number(selectedClassId) : ""}
            onChange={(val) => {
              const classIdNum = val ? Number(val) : ("" as any);
              setValue("classId", classIdNum, {
                shouldValidate: true,
                shouldDirty: true,
              });
              const pickedClass = classes.find((c) => c.id === Number(val));
              if (pickedClass) {
                if (pickedClass.teacherId) {
                  setValue("teacherId", pickedClass.teacherId, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }
                if (pickedClass.branchId) {
                  setValue("branchId", pickedClass.branchId, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }
              } else {
                setValue("teacherId", "");
              }
              setAdditionalClassIds([]);
            }}
            placeholder={t("selectClass")}
            searchPlaceholder={locale === "ar" ? "بحث عن فوج..." : "Rechercher un groupe..."}
            hasError={!!errors.classId}
            required
          />
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

        {/* Classroom Branch Selector (Visible for Special Lessons to book another branch's room) */}
        {lessonType !== "normal" && (
          <FormField
            label={locale === "ar" ? "فرع القاعة (في حال عدم توفر قاعة بفرعك)" : "Succursale de la salle (si indisponible dans votre siège)"}
          >
            <Select
              value={classroomBranchFilter}
              onChange={(e) => {
                const val = e.target.value === "all" ? "all" : Number(e.target.value);
                setClassroomBranchFilter(val);
                if (val !== "all") {
                  const currentRoom = classrooms.find((c) => c.id === Number(watch("classroomId")));
                  if (currentRoom && currentRoom.branchId && currentRoom.branchId !== val) {
                    setValue("classroomId", "" as any);
                  }
                }
              }}
            >
              <option value="all">
                {locale === "ar" ? "جميع الفروع (عرض كل القاعات)" : "Toutes les succursales (Toutes les salles)"}
              </option>
              {branches.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.name} {selectedClass?.branchId === b.id ? (locale === "ar" ? "(فرع الفوج)" : "(Siège du groupe)") : ""}
                </option>
              ))}
            </Select>
          </FormField>
        )}

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
            {availableClassrooms.map((room) => {
              const roomBranch = branches.find((b) => b.id === room.branchId);
              const branchSuffix = roomBranch && (classroomBranchFilter === "all" || room.branchId !== selectedClass?.branchId)
                ? ` — [${roomBranch.name}]`
                : "";
              return (
                <option value={room.id} key={room.id}>
                  {room.name}{branchSuffix}
                </option>
              );
            })}
          </Select>
        </FormField>

        {/* Notice when special lesson is hosted in another branch */}
        {lessonType !== "normal" && isCrossBranchRoom && hostingBranch && (
          <div className="md:col-span-2 p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5 shadow-2xs">
            <Building className="w-4 h-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">
                {locale === "ar"
                  ? `الحصة مستضافة في فرع: ${hostingBranch.name}`
                  : `Séance spéciale hébergée au siège : ${hostingBranch.name}`}
              </p>
              <p className="text-amber-800/80 mt-0.5">
                {locale === "ar"
                  ? `بما أن القاعة تابعة لـ "${hostingBranch.name}"، سيتمكن مدير ذلك الفرع من تسجيل حضور الفوج عند حلول موعد الحصة.`
                  : `La salle appartenant à "${hostingBranch.name}", l'administrateur de ce siège pourra enregistrer les présences de ce groupe.`}
              </p>
            </div>
          </div>
        )}

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

        {/* Multi-Group Selection for Special Lessons (Extra, Catch-up, Free) */}
        {lessonType !== "normal" && selectedClass && (
          <div className="mt-2 flex flex-col gap-2.5 p-3.5 rounded-xl border border-secondary/30 bg-secondary-light/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-secondary shrink-0" />
                <span className="text-sm font-semibold text-gray-900">
                  {locale === "ar"
                    ? "أفواج إضافية لنفس الأستاذ في نفس المستوى (دمج الحصة)"
                    : "Groupes supplémentaires pour cet enseignant dans ce niveau (fusion de séance)"}
                </span>
              </div>
              {additionalClassIds.length > 0 && (
                <Badge variant="secondary" size="sm">
                  {additionalClassIds.length + 1} {locale === "ar" ? "أفواج محددة" : "groupes sélectionnés"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {locale === "ar"
                ? "يمكنك اختيار أفواج إضافية لنفس الأستاذ ونفس المستوى لبرمجة الحصة معاً. سيظهر جميع التلاميذ في صفحة تسجيل الحضور، بينما يظهر سجل الحضور منفصلاً لكل فوج."
                : "Vous pouvez sélectionner d'autres groupes du même enseignant et niveau pour cette séance. Tous les élèves apparaîtront lors de la prise de présence, et le registre restera distinct par groupe."}
            </p>

            {availableSiblingGroups.length === 0 ? (
              <div className="text-xs text-muted italic bg-surface/70 p-2.5 rounded-lg border border-border">
                {locale === "ar"
                  ? "لا توجد أفواج أخرى مسندة لهذا الأستاذ في نفس المستوى."
                  : "Aucun autre groupe n'est assigné à cet enseignant dans ce niveau."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {availableSiblingGroups.map((grp) => {
                  const isChecked = additionalClassIds.includes(grp.id);
                  return (
                    <label
                      key={grp.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        isChecked
                          ? "bg-secondary-light/70 border-secondary text-secondary-hover font-semibold shadow-2xs"
                          : "bg-surface border-border text-gray-700 hover:bg-surface-subtle"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAdditionalClassIds((prev) => [...prev, grp.id]);
                          } else {
                            setAdditionalClassIds((prev) => prev.filter((id) => id !== grp.id));
                          }
                        }}
                        className="w-4 h-4 rounded text-secondary focus:ring-secondary accent-secondary cursor-pointer"
                      />
                      <span className="text-xs">{grp.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
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