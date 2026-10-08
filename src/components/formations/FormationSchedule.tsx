"use client";

import { useState } from "react";
import Image from "next/image";
import AddFormationSessionModal from "./AddFormationSessionModal";
import EditFormationSessionModal from "./EditFormationSessionModal";
import DeleteFormationSessionModal from "./DeleteFormationSessionModal";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { CalendarCheck, Pencil, Trash2, CheckCircle2, UserCheck } from "lucide-react";

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
  const t = useTranslations("formations");
  const locale = useLocale();
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [deletingSession, setDeletingSession] = useState<any | null>(null);

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
            {sessions.map((session) => {
              const attendancesCount = session.attendances?.length || 0;
              const presentCount =
                session.attendances?.filter((a) => a.status === "PRESENT").length || 0;
              const isAttendanceDone = attendancesCount > 0;

              return (
                <li
                  key={session.id}
                  className="text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-surface-subtle border border-border/60 rounded-xl hover:border-border transition-colors group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 capitalize">
                        {new Date(session.startsAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ", {
                          weekday: "long",
                        })}
                      </p>
                      <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-300">
                        {locale === "ar" ? "أسبوعي ثابت" : "Hebdomadaire fixe"}
                      </span>
                      {isAttendanceDone && (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          <span>
                            {locale === "ar"
                              ? `تم الحضور (${presentCount}/${attendancesCount})`
                              : `Présences (${presentCount}/${attendancesCount})`}
                          </span>
                        </span>
                      )}
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
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
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

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <Link
                      href={`/list/attendance/take/${session.id}`}
                      className={`text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors shadow-2xs ${
                        isAttendanceDone
                          ? "text-emerald-700 border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100/80"
                          : "bg-primary text-white hover:bg-primary-hover border-transparent"
                      }`}
                      title={t("takeAttendance")}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{t("takeAttendance")}</span>
                    </Link>

                    {role === "admin" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingSession(session)}
                          title={t("editSession")}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-primary hover:bg-primary/10 border border-border/80 hover:border-primary/30 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingSession(session)}
                          title={t("deleteSession")}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 border border-border/80 hover:border-red-200 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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

      {/* EDIT SESSION MODAL */}
      {editingSession && (
        <EditFormationSessionModal
          isOpen={!!editingSession}
          onClose={() => setEditingSession(null)}
          session={editingSession}
          classId={formationClass.id}
          className={formationClass.name}
          classrooms={classrooms}
          teachers={teachers}
          defaultTeacherId={formationClass.teacherId}
          onSessionUpdated={() => router.refresh()}
        />
      )}

      {/* DELETE SESSION MODAL */}
      {deletingSession && (
        <DeleteFormationSessionModal
          isOpen={!!deletingSession}
          onClose={() => setDeletingSession(null)}
          session={deletingSession}
          classId={formationClass.id}
          className={formationClass.name}
          onSessionDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}
