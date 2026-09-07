"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField";
import { CourseSchema, courseSchema } from "@/lib/formValidationSchemas";
import { createCourse, updateCourse } from "@/lib/actions";
import { useFormState } from "react-dom";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { Subject } from "@prisma/client";
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

type FormState = {
  success: boolean;
  error: boolean;
  message: string;
  courseId?: number;
};

type FirebaseFile = {
    name: string;
    url: string;
    storagePath: string;
};

const CourseForm = ({
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useUser();
  const role = user?.publicMetadata?.role as string;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CourseSchema>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      ...data,
      teacherId: role === "teacher" ? user?.id : data?.teacherId || "",
      subjectId: data?.subjectId || undefined,
    },
  });

  const { teachers, subjects: allSubjects } = relatedData;
  const selectedTeacherId = watch("teacherId");

  const [files, setFiles] = useState<FirebaseFile[]>(data?.files || []);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // ADDED: Ref to track if the form submission was successful
  const submissionSuccessRef = useRef(false);

  const selectedTeacher = teachers.find(
    (t: any) => t.id === selectedTeacherId
  );
  const teacherSubjectIds =
    selectedTeacher?.subjects?.map((s: any) => s.id) || [];
  const availableSubjects = allSubjects.filter((s: Subject) =>
    teacherSubjectIds.includes(s.id)
  );

  const initialState: FormState = { success: false, error: false, message: "" };
  const actionToRun = type === "create" ? createCourse : updateCourse;
  const [state, formAction] = useFormState(actionToRun, initialState);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;

    for (const file of Array.from(selectedFiles)) {
        const uniqueFileName = `${uuidv4()}-${file.name}`;
        const storagePath = `courses/materials/${uniqueFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({ ...prev, [uniqueFileName]: progress }));
            },
            (error) => {
                console.error("Upload failed:", error);
                toast.error(`فشل في رفع الملف ${file.name}`);
                setUploadProgress(prev => {
                    const newState = { ...prev };
                    delete newState[uniqueFileName];
                    return newState;
                });
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    setFiles(prev => [...prev, { name: file.name, url: downloadURL, storagePath }]);
                    setUploadProgress(prev => {
                        const newState = { ...prev };
                        delete newState[uniqueFileName];
                        return newState;
                    });
                    toast.success(`${file.name} تم الرفع بنجاح!`);
                });
            }
        );
    }
  };

  const handleFileRemove = async (fileToRemove: FirebaseFile) => {
    if (!fileToRemove.storagePath) {
        toast.error("لا يمكن حذف ملف بدون مسار تخزين.");
        return;
    }
    const storageRef = ref(storage, fileToRemove.storagePath);
    try {
        await deleteObject(storageRef);
        setFiles(prev => prev.filter(f => f.storagePath !== fileToRemove.storagePath));
        toast.success(`${fileToRemove.name} تم الحذف بنجاح.`);
    } catch (error) {
        console.error("Failed to delete file from Firebase Storage:", error);
        toast.error(`فشل في حذف ${fileToRemove.name}.`);
    }
  };

  const onSubmit = handleSubmit((formData) => {
    setIsSubmitting(true);
    const payload = { ...formData, files };
    formAction(payload as any);
  });

  useEffect(() => {
    if (state.success || state.error) {
    setIsSubmitting(false);
    }
    if (state.success) {
      // UPDATED: Set the ref to true before closing the modal
      submissionSuccessRef.current = true;
      toast.success(state.message || `Course has been ${type}d successfully!`);
      setOpen(false);
    }
    if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, type, setOpen]);

  // UPDATED: The cleanup effect is now simpler and more reliable
  useEffect(() => {
    return () => {
        // This cleanup function runs when the component is unmounted
        const currentFiles = filesRef.current;
        // Only clean up if creating, the form was NOT successfully submitted, and there are files.
        if (type === 'create' && !submissionSuccessRef.current && currentFiles.length > 0) {
            console.log("Form closed without saving. Deleting orphaned files...");
            currentFiles.forEach(async (file) => {
                try {
                    const storageRef = ref(storage, file.storagePath);
                    await deleteObject(storageRef);
                    console.log(`Deleted orphaned file: ${file.name}`);
                } catch (error) {
                    console.error(`Failed to delete orphaned file ${file.name}:`, error);
                }
            });
        }
    }
  }, [type]); // The dependency array is now correct and only runs on mount/unmount

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      {type === "update" && (
        <input type="hidden" {...register("id")} defaultValue={data?.id} />
      )}
      <h1 className="text-xl font-semibold">
        {type === "create" ? "انشاء درس جديد" : "تحديث الدرس"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="عنوان الدرس"
          name="title"
          register={register}
          error={errors?.title}
        />

        {role === "admin" && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500">الاستاذ</label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
              {...register("teacherId")}
            >
              <option value="">حدد استاذ</option>
              {teachers.map(
                (teacher: { id: string; name: string; surname: string }) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name} {teacher.surname}
                  </option>
                )
              )}
            </select>
            {errors.teacherId?.message && (
              <p className="text-xs text-red-400">
                {errors.teacherId.message.toString()}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">المادة</label>
          <select
            key={selectedTeacherId}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full h-[42px]"
            {...register("subjectId")}
            disabled={!selectedTeacherId}
          >
            <option value="">حدد مادة</option>
            {availableSubjects.map((subject: { id: number; name: string }) => (
              <option value={subject.id} key={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">
              {errors.subjectId.message.toString()}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500">الوصف</label>
          <textarea
            {...register("description")}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full min-h-24"
            placeholder="أدخل وصفًا مختصرًا للدرس..."
          />
          {errors.description?.message && (
            <p className="text-xs text-red-400">
              {errors.description.message.toString()}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full">
            <label className="text-xs text-gray-500">ملفات الدرس</label>
            <div className="ring-[1.5px] ring-gray-300 p-4 rounded-md text-sm w-full flex flex-col gap-4">
                <label htmlFor="file-upload" className="cursor-pointer flex self-start items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-2 px-4 rounded-md">
                    <Image src="/upload.png" alt="upload" width={16} height={16} />
                    <span>رفع ملفات</span>
                </label>
                <input id="file-upload" type="file" multiple onChange={handleFileUpload} className="hidden" />
                
                {Object.entries(uploadProgress).map(([name, progress]) => (
                    <div key={name} className="text-sm">
                        <p className="flex justify-between"><span>جاري الرفع: {name.split('-').slice(1).join('-')}</span> <span>{Math.round(progress)}%</span></p>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                ))}

                {files.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <h4 className="text-sm font-medium">الملفات المرفقة:</h4>
                        <ul className="list-disc pl-5">
                            {files.map((file, index) => (
                                <li key={index} className="text-sm flex items-center justify-between">
                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                        {file.name}
                                    </a>
                                    <button type="button" onClick={() => handleFileRemove(file)} className="text-red-500 hover:text-red-700 text-xs">
                                        حذف
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
      </div>

      {state.error && !state.message && (
        <span className="text-red-500">حدث خطأ ما!</span>
      )}
      <button 
        type="submit" 
        disabled={isSubmitting}
        className="text-xl font-semibold bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-md transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (type === 'create' ? "قيد الإنشاء..." : "قيد التحديث...") : (type === 'create' ? "إنشاء" : "تحديث")}
      </button>
    </form>
  );
};

export default CourseForm;
