"use client";

import { WorkshopParticipant, WorkshopAttendance } from "@prisma/client";
import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { saveWorkshopAttendance } from "@/lib/actions";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";

const SubmitButton = () => {
  const { pending } = useFormStatus();
  const t = useTranslations("workshops");
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={pending}
      className="w-full"
    >
      {pending ? t("saving") : t("saveAttendance")}
    </Button>
  );
};

type AttendanceStatus = "PRESENT" | "ABSENT";

type ParticipantWithStudent = WorkshopParticipant & {
  Student?: { name: string } | null;
  name?: string;
  gender?: string;
  chairNumber?: number | null;
};

const WorkshopAttendanceForm = ({
  sessionId,
  participants,
  existingRecords,
  setOpen,
}: {
  sessionId: number;
  participants: ParticipantWithStudent[];
  existingRecords: WorkshopAttendance[];
  setOpen: (isOpen: boolean) => void;
}) => {
  const t = useTranslations("workshops");
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    const initialState: Record<string, AttendanceStatus> = {};
    participants.forEach((participant) => {
      const record = existingRecords.find((r) => r.studentId === participant.studentId);
      initialState[participant.id] = record?.status === "PRESENT" ? "PRESENT" : "ABSENT";
    });
    return initialState;
  });

  const handleStatusChange = (participantId: number, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [participantId]: status }));
  };

  const saveAttendanceWithId = saveWorkshopAttendance.bind(null, sessionId);
  const [state, formAction] = useActionState(saveAttendanceWithId, {
    success: false,
    error: false,
    message: "",
  });

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message);
      setOpen(false);
    }
    if (state?.error) {
      toast.error(state.message);
    }
  }, [state, setOpen]);

  return (
    <form action={formAction} className="p-4 font-sans">
      <h2 className="text-section-title font-bold text-gray-900 mb-4">{t("attendanceRosterTitle")}</h2>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {participants.map((participant) => {
          const currentStatus = attendance[participant.id];
          const displayName = participant.Student?.name || participant.name || `${t("student")} #${participant.id}`;
          const isGirl = participant.gender === "FEMALE";

          return (
            <div
              key={participant.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-gray-50"
            >
              <div className="flex items-center gap-2">
                {participant.chairNumber && (
                  <span
                    className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded-full text-xs ${
                      isGirl
                        ? "bg-pink-100 text-pink-700 border border-pink-300"
                        : "bg-blue-100 text-blue-700 border border-blue-300"
                    }`}
                  >
                    #{participant.chairNumber}
                  </span>
                )}
                <p className="font-semibold text-gray-800">{displayName}</p>
              </div>

              <div className="flex items-center gap-2">
                <input type="hidden" name={`attendance[${participant.id}]`} value={currentStatus} />
                <button
                  type="button"
                  onClick={() => handleStatusChange(participant.id, "PRESENT")}
                  className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors ${
                    currentStatus === "PRESENT"
                      ? "bg-green-600 text-white shadow-sm"
                      : "bg-gray-200 text-gray-700 hover:bg-green-100"
                  }`}
                >
                  {t("present")}
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(participant.id, "ABSENT")}
                  className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors ${
                    currentStatus === "ABSENT"
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-gray-200 text-gray-700 hover:bg-red-100"
                  }`}
                >
                  {t("absent")}
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
