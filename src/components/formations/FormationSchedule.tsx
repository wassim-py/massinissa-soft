"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import FormationAttendanceModal from "./FormationAttendanceModal";
import AddFormationSessionModal from "./AddFormationSessionModal";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

export default function FormationSchedule({
  formationClass,
  sessions,
  enrolledStudents,
  classrooms = [],
  teachers = [],
  role = "admin",
}: {
  formationClass: {
    id: number;
    name: string;
    branchId: number;
    teacherId?: string | null;
  };
  sessions: Array<{
    id: number;
    startsAt: Date | string;
    endsAt: Date | string;
    teacher?: { id: string; name: string } | null;
    classroom?: { id: number; name: string } | null;
    attendances?: Array<{ id: number; studentId: string; status: string }>;
  }>;
  enrolledStudents: Array<{ id: string; name: string; phone?: string | null }>;
  classrooms?: Array<{ id: number; name: string }>;
  teachers?: Array<{ id: string; name: string }>;
  role?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("session");
  const t = useTranslations("formations");
  const locale = useLocale();
  const [selectedSessionForAttendance, setSelectedSessionForAttendance] = useState<any | null>(null);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);

  useEffect(() => {
    if (sessionIdParam) {
      const match = sessions.find((s) => s.id.toString() === sessionIdParam);
      if (match) {
        setSelectedSessionForAttendance(match);
      }
    }
  }, [sessionIdParam, sessions]);

  return (
    <>
      <div className="bg-surface p-6 rounded-xl shadow-xs border border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-section-title font-bold text-gray-900">{t("scheduleTitle")}</h3>
            <Link
              href={`/list/attendance/class/${formationClass.id}`}
              className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
            >
              <CalendarCheck className="w-3 h-3" />
              <span>{locale === "ar" ? "عرض سجل الحضور الكامل ←" : "Feuille de présence complète →"}</span>
            </Link>
          </div>
          {role === "admin" && (
            <Button
              variant="primary"
              size="icon"
              title={t("addSession")}
              onClick={() => setIsAddSessionOpen(true)}
            >
              <Image src="/create.png" alt="" width={14} height={14} className="brightness-0 invert" />
            </Button>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">
            {t("noSessionsScheduled")}
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-surface-subtle border border-border/60 rounded-xl hover:border-border transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 capitalize">
                      {new Date(session.startsAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                        weekday: "long",
                      })}
                    </p>
                    <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-300">
                      {locale === "ar" ? "أسبوعي ثابت" : "Hebdomadaire fixe"}
                    </span>
                  </div>
                  <p className="text-xs text-muted font-mono font-medium" dir="ltr">
                    {new Date(session.startsAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {new Date(session.endsAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {(session.classroom || session.teacher) && (
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      {session.classroom && (
                        <span>
                          {locale === "ar" ? `القاعة: ${session.classroom.name}` : `Salle : ${session.classroom.name}`}
                        </span>
                      )}
                      {session.teacher && (
                        <span>
                          {locale === "ar" ? `الأستاذ: ${session.teacher.name}` : `Enseignant : ${session.teacher.name}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSessionForAttendance(session)}
                    className="text-xs font-semibold"
                  >
                    {t("takeAttendance")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ATTENDANCE MODAL */}
      {selectedSessionForAttendance && (
        <FormationAttendanceModal
          isOpen={!!selectedSessionForAttendance}
          onClose={() => setSelectedSessionForAttendance(null)}
          lesson={selectedSessionForAttendance}
          enrolledStudents={enrolledStudents}
          existingAttendance={selectedSessionForAttendance.attendances || []}
          onAttendanceSaved={() => router.refresh()}
        />
      )}

      {/* ADD SESSION MODAL */}
      {isAddSessionOpen && (
        <AddFormationSessionModal
          isOpen={isAddSessionOpen}
          onClose={() => setIsAddSessionOpen(false)}
          classId={formationClass.id}
          className={formationClass.name}
          branchId={formationClass.branchId}
          classrooms={classrooms}
          teachers={teachers}
          defaultTeacherId={formationClass.teacherId}
          onSessionAdded={() => router.refresh()}
        />
      )}
    </>
  );
}
