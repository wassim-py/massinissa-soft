"use client";

import { WorkshopParticipant, WorkshopAttendance } from "@prisma/client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { saveWorkshopAttendance } from "@/lib/actions";
import { toast } from "react-toastify";

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xl font-semibold w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
    >
      {pending ? "جاري الحفظ..." : "حفظ"}
    </button>
  );
};

type AttendanceStatus = "PRESENT" | "ABSENT";

const WorkshopAttendanceForm = ({
  sessionId,
  participants,
  existingRecords,
  setOpen,
}: {
  sessionId: number;
  participants: WorkshopParticipant[];
  existingRecords: WorkshopAttendance[];
  setOpen: (isOpen: boolean) => void;
}) => {
  // Initialize the state of attendance for each participant
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    const initialState: Record<string, AttendanceStatus> = {};
    participants.forEach(participant => {
      const record = existingRecords.find(r => r.participantId === participant.id);
      // If a record exists, use its status. Otherwise, default to PRESENT.
      initialState[participant.id] = record?.present ? "PRESENT" : "ABSENT";
    });
    return initialState;
  });

  const handleStatusChange = (participantId: number, status: AttendanceStatus) => {
    setAttendance(prev => ({ ...prev, [participantId]: status }));
  };

  // Set up the server action with the form state
  const saveAttendanceWithId = saveWorkshopAttendance.bind(null, sessionId);
  const [state, formAction] = useActionState(saveAttendanceWithId, {
    success: false,
    error: false,
    message: "",
  });

  // Show toast notifications based on the form action's result
  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setOpen(false); // Close the modal on success
    }
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state, setOpen]);

  return (
    <form action={formAction} className="p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">سجل الحضور</h2>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {participants.map((participant) => {
          const currentStatus = attendance[participant.id];
          return (
            <div
              key={participant.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
            >
              <p className="font-semibold">{participant.name}</p>

              <div className="flex items-center gap-2">
                <input type="hidden" name={`attendance[${participant.id}]`} value={currentStatus} />
                <button
                  type="button"
                  onClick={() => handleStatusChange(participant.id, "PRESENT")}
                  className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors ${
                    currentStatus === 'PRESENT'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-green-100'
                  }`}
                >
                  حاضر
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(participant.id, "ABSENT")}
                  className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors ${
                    currentStatus === 'ABSENT'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-red-100'
                  }`}
                >
                  غائب
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
};

export default WorkshopAttendanceForm;
