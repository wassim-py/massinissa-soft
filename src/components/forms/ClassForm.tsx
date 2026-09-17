"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField";
import { classSchema, ClassSchema } from "@/lib/formValidationSchemas";
import { createClass, updateClass } from "@/lib/actions";
import { useActionState, Dispatch, SetStateAction, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";

const ClassForm = ({
  type,
  data,
  setOpen,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  setOpen: Dispatch<SetStateAction<boolean>>;
  relatedData?: any;
}) => {

  const tClasses = useTranslations("classes");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClassSchema>({
    resolver: zodResolver(classSchema),
    defaultValues: data
      ? { ...data, supervisorId: data.teacherId || data.supervisorId || "" }
      : { price: 0 },
  });

  const initialState = {
    success: false,
    error: false,
    message: "",
  };

  const [state, formAction] = useActionState(
    type === "create" ? createClass : updateClass,
    initialState
  );

  const onSubmit = handleSubmit((formData) => {
    setIsSubmitting(true);
    formAction(formData);
  });

  useEffect(() => {
    // When the action is complete (success or error), set pending back to false
    if (state.success || state.error) {
        setIsSubmitting(false);
    }
    if (state.success) {
      toast.success(
        state.message || (type === "create" ? tClasses("createdSuccessfully") : tClasses("updatedSuccessfully"))
      );
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen, tClasses]);

  const { teachers, grades } = relatedData;

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? tClasses("createTitle") : tClasses("updateTitle")}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label={tClasses("name")}
          name="name"
          register={register}
          error={errors?.name}
        />
        
        <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500">{tClasses("price")}</label>
            <input
                type="number"
                // CHANGED: Set step to "any" to allow for any decimal or large integer value without browser validation issues.
                step="any"
                {...register("price")}
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
                defaultValue={data?.price || 0}
            />
            {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
        </div>

        {type === "update" && (
          <input type="hidden" {...register("id")} defaultValue={data?.id} />
        )}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tClasses("teacherName")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            {...register("supervisorId")}
          >
            <option value="">{tClasses("none")}</option>
            {teachers.map(
              (teacher: { id: string; name: string; surname: string }) => (
                <option value={teacher.id} key={teacher.id}>
                  {teacher.name + " " + teacher.surname}
                </option>
              )
            )}
          </select>
          {errors.supervisorId?.message && (
            <p className="text-xs text-red-400">
              {errors.supervisorId.message.toString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">{tClasses("grade")}</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            {...register("gradeId")}
          >
            <option value="">{tClasses("selectGrade")}</option>
            {grades.map((grade: { id: number; level: number }) => (
              <option value={grade.id} key={grade.id}>
                {grade.level}
              </option>
            ))}
          </select>
          {errors.gradeId?.message && (
            <p className="text-xs text-red-400">
              {errors.gradeId.message.toString()}
            </p>
          )}
        </div>
      </div>
      {state.error && !state.message && (
        <span className="text-red-500">{tErrors("general")}</span>
      )}
      <Button 
        type="submit" 
        variant="primary"
        size="lg"
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting
          ? type === "create"
            ? tClasses("submittingCreate")
            : tClasses("submittingUpdate")
          : type === "create"
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default ClassForm;
