"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect } from "react";
import { toast } from "react-toastify";
import Image from "next/image";
import { saveResults } from "@/lib/actions";

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xl font-semibold w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
    >
      {pending ? "جاري الحفظ..." : "حفظ النتائج"}
    </button>
  );
};

// This is the Client Component that handles the form logic.
// It receives all data as props from its parent Server Component.
const EnterResultsForm = ({ exam, students, existingResults }: any) => {
  // Bind the examId to the saveResults server action
  const saveResultsWithId = saveResults.bind(null, exam.id);

  // Initialize form state using the useFormState hook
  const [state, formAction] = useFormState(saveResultsWithId, {
    success: false,
    error: false,
    message: "",
  });

  // Show success or error messages using toast notifications
  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
    }
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    // The form now uses the formAction from the hook
    <form action={formAction} className="mt-6">
      <div className="space-y-4">
        {students.map((student: any) => {
          const existingResult = existingResults.find(
            (r: any) => r.studentId === student.id
          );
          return (
            <div
              key={student.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-gray-50"
            >
              <div className="flex items-center gap-4">
                <Image
                  src={student.img || "/noAvatar.png"}
                  alt={`${student.name} ${student.surname}`}
                  width={40}
                  height={40}
                  className="rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold">{`${student.name} ${student.surname}`}</p>
                  <p className="text-sm text-gray-500">{student.username}</p>
                </div>
              </div>
              <div className="w-1/4">
                <input
                  type="number"
                  name={`scores[${student.id}]`}
                  defaultValue={existingResult?.score || ""}
                  placeholder="ادخل العلامة (0-20)"
                  className="w-full p-2 border rounded-md"
                  min="0"
                  max="20"
                  step="0.25"
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
};

export default EnterResultsForm;
