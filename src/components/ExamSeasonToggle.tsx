"use client";

import { updateExamSeasonStatus } from "@/lib/actions";
import { useActionState, useEffect } from "react";

import { toast } from "react-toastify";

const ExamSeasonToggle = ({ isActive }: { isActive: boolean }) => {
  const initialState = { success: false, error: false, message: "" };
  const [state, formAction] = useActionState(updateExamSeasonStatus, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(state.message);
    }
    if (state.error) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex items-center gap-4 p-4 border rounded-lg bg-yellow-50 border-yellow-200">
      <div>
        <h3 className="font-semibold">التحكم في فترة الامتحانات</h3>
        <p className="text-sm text-gray-600">
          فعّل هذه الخاصية لعرض جدول الامتحانات لجميع المستخدمين.
        </p>
      </div>
      <input type="hidden" name="isActive" value={String(!isActive)} />
      <button
        type="submit"
        className={`px-4 py-2 rounded-md font-semibold text-white transition-colors ${
          isActive
            ? "bg-red-500 hover:bg-red-600"
            : "bg-green-500 hover:bg-green-600"
        }`}
      >
        {isActive ? "تعطيل" : "تفعيل"}
      </button>
    </form>
  );
};

export default ExamSeasonToggle;
