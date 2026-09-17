"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import Image from "next/image";
import { useActionState, Dispatch,
  SetStateAction,
  useEffect,
  useState,
  useRef, } from "react";
import { parentSchema, ParentSchema } from "@/lib/formValidationSchemas";

import { createParent, updateParent } from "@/lib/actions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";

type FormState = {
  success: boolean;
  error: boolean;
  message?: string;
};

const ParentForm = ({
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
  const tParents = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<ParentSchema>({
    resolver: zodResolver(parentSchema),
    defaultValues: data
      ? {
          id: data.id ? String(data.id) : undefined,
          name: data.name ?? "",
          surname: data.surname ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          students: data.students?.map((s: any) => s.id) || [],
        }
      : {
          name: "",
          surname: "",
          phone: "",
          address: "",
          students: [],
        },
  });

  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const studentsDropdownRef = useRef<HTMLDivElement>(null);
  
  // ADDED: State for the search term
  const [searchTerm, setSearchTerm] = useState("");

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createParent : updateParent;
  const [state, formAction] = useActionState(actionToRun, initialState);

  const onSubmit = (formData: ParentSchema) => {
    setIsSubmitting(true);
    formAction(formData as any);
  };

  useEffect(() => {
    // When the action is complete (success or error), set pending back to false
    if (state.success || state.error) {
        setIsSubmitting(false);
    }
    if (state.success) {
      toast.success(
        state.message || (type === "create" ? tParents("createdSuccessfully") : tParents("updatedSuccessfully"))
      );
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen, tParents]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        studentsDropdownRef.current &&
        !studentsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStudentsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
    document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { students } = relatedData;

  // ADDED: Filter students based on the search term
  const filteredStudents = students.filter(
    (student: { name: string; surname: string }) =>
      `${student.name} ${student.surname}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h1 className="text-section-title font-bold text-gray-900">
        {type === "create" ? tParents("createTitle") : tParents("updateTitle")}
      </h1>

      <span className="text-xs text-gray-400 font-medium">
        {tParents("personalInfo")}
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label={tParents("name")}
          name="name"
          register={register}
          error={errors.name}
        />
        <InputField
          label={tParents("surname")}
          name="surname"
          register={register}
          error={errors.surname}
        />
        <InputField
          label={tParents("phone")}
          name="phone"
          register={register}
          error={errors.phone}
        />
        <InputField
          label={tParents("address")}
          name="address"
          register={register}
          error={errors.address}
        />
        {/* Custom multi-select dropdown for students */}
        <div
          className="flex flex-col gap-2 w-full md:w-1/4 relative"
          ref={studentsDropdownRef}
        >
          <label className="text-xs text-gray-500">{tParents("students")}</label>
          <Controller
            name="students"
            control={control}
            render={({ field }) => {
              const safeFieldValue = Array.isArray(field.value)
                ? field.value
                : [];
              const selectedStudentObjects = students.filter((student: any) =>
                safeFieldValue.includes(student.id)
              );
              const getDisplayText = () => {
                if (selectedStudentObjects.length === 0)
                  return tParents("selectStudents");
                if (selectedStudentObjects.length <= 2)
                  return selectedStudentObjects
                    .map((s: any) => `${s.name} ${s.surname}`)
                    .join(", ");
                const firstTwoNames = selectedStudentObjects
                  .slice(0, 2)
                  .map((s: any) => `${s.name} ${s.surname}`)
                  .join(", ");
                return `${firstTwoNames}, ${tParents("andXMore", { count: selectedStudentObjects.length - 2 })}`;
              };
              return (
                <>
                  <button
                    type="button"
                    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px] text-left flex items-center justify-between truncate"
                    onClick={() => setIsStudentsOpen((prev) => !prev)}
                  >
                    <span
                      className={
                        safeFieldValue.length > 0
                          ? "text-black"
                          : "text-gray-400"
                      }
                    >
                      {getDisplayText()}
                    </span>
                    <Image
                      src="/sort.png"
                      alt="dropdown icon"
                      width={12}
                      height={12}
                      className="flex-shrink-0"
                    />
                  </button>
                  {isStudentsOpen && (
                    <div className="absolute top-full mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-60 flex flex-col">
                      <div className="p-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder={tParents("searchStudentPlaceholder")}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="overflow-y-auto">
                        {filteredStudents.length > 0 ? (
                          filteredStudents.map(
                            (student: {
                              id: string;
                              name: string;
                              surname: string;
                            }) => (
                              <label
                                key={student.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  checked={safeFieldValue.includes(student.id)}
                                  onChange={(e) => {
                                    const selectedId = student.id;
                                    if (e.target.checked)
                                      field.onChange([
                                        ...safeFieldValue,
                                        selectedId,
                                      ]);
                                    else
                                      field.onChange(
                                        safeFieldValue.filter(
                                          (id) => id !== selectedId
                                        )
                                      );
                                  }}
                                />
                                <span className="text-sm">
                                  {student.name} {student.surname}
                                </span>
                              </label>
                            )
                          )
                        ) : (
                          <p className="p-2 text-sm text-gray-500">{tParents("noStudentsFound")}</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            }}
          />
          {errors.students?.message && (
            <p className="text-xs text-red-400">
              {errors.students.message.toString()}
            </p>
          )}
        </div>


      </div>
      {state?.error && !state.message && <span className="text-red-500">{tErrors("general")}</span>}
      <Button 
        type="submit" 
        variant="primary"
        size="lg"
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting
          ? type === 'create'
            ? tParents("submittingCreate")
            : tParents("submittingUpdate")
          : type === 'create'
          ? tCommon("create")
          : tCommon("edit")}
      </Button>
    </form>
  );
};

export default ParentForm;
