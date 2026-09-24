"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import WorkshopAttendanceForm from "@/components/forms/WorkshopAttendanceForm";
import { ClipboardCheck, CheckCircle2, XCircle, HelpCircle, Search, Users, Check, X } from "lucide-react";

export type WorkshopSessionItem = {
  id: number;
  startsAt: string | Date;
  endsAt: string | Date;
  attendances: Array<{
    id: number;
    sessionId: number;
    studentId: string;
    status: string;
  }>;
};

export type WorkshopParticipantItem = {
  id: number;
  studentId: string;
  chairNumber?: number | null;
  gender?: string;
  name: string;
  phone?: string | null;
};

export default function WorkshopAttendanceGrid({
  workshop,
  sessions,
  participants,
  canManageAttendance = true,
}: {
  workshop: {
    id: number;
    title: string;
    branchId: number;
  };
  sessions: WorkshopSessionItem[];
  participants: WorkshopParticipantItem[];
  canManageAttendance?: boolean;
}) {
  const t = useTranslations("workshops");
  const tAtt = useTranslations("attendance");
  const locale = useLocale();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<WorkshopSessionItem | null>(null);

  const dateLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";

  // Quick search filter
  const filteredParticipants = participants.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.chairNumber && String(p.chairNumber).includes(q))
    );
  });

  // Calculate attendance map: studentId -> sessionId -> status
  const attendanceMap = new Map<string, Map<number, string>>();
  for (const session of sessions) {
    for (const att of session.attendances) {
      if (!attendanceMap.has(att.studentId)) {
        attendanceMap.set(att.studentId, new Map());
      }
      attendanceMap.get(att.studentId)!.set(session.id, att.status);
    }
  }

  // Calculate stats
  const totalSessions = sessions.length;
  const totalParticipants = participants.length;

  return (
    <div className="w-full bg-surface rounded-xl border border-border overflow-hidden shadow-xs font-sans">
      {/* Top Bar: Legend & Search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 bg-surface-muted/60 border-b border-border">
        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-gray-700 font-medium">
          <span className="font-bold text-gray-900">{tAtt("legendTitle")}</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-success inline-block shadow-2xs"></span>
            <span>{tAtt("legendPresent")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-danger inline-block shadow-2xs"></span>
            <span>{tAtt("legendAbsent")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-300 inline-block shadow-2xs"></span>
            <span>{tAtt("notRecorded")}</span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={locale === "ar" ? "بحث برقم الكرسي أو الاسم..." : "Filtrer par nom ou N° chaise..."}
            className="w-full ps-9 pe-3 py-1.5 text-xs bg-surface border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-gray-900 placeholder:text-muted"
          />
        </div>
      </div>

      {/* Swipe hint on mobile */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-muted border-b border-border text-form-helper text-muted sm:hidden">
        <span className="font-semibold text-gray-700">{tAtt("attendanceGridTitle")}</span>
        <span className="text-primary font-medium">{tAtt("swipeHint")}</span>
      </div>

      {/* Main Grid Table */}
      <div className="w-full overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-surface-muted/80 sticky top-0 z-10">
            <tr>
              {/* Participant Header (sticky start) */}
              <th className="p-3 text-start text-xs font-bold text-gray-700 border-b border-e border-border min-w-[200px] sm:min-w-[240px] sticky start-0 bg-surface-muted z-20">
                {t("student")}
              </th>

              {/* Sessions Headers */}
              {sessions.map((session, idx) => {
                const sessionDate = new Date(session.startsAt);
                const sessionEndDate = new Date(session.endsAt);

                return (
                  <th
                    key={session.id}
                    className="p-3 text-center border-b border-border min-w-[120px] sm:min-w-[150px]"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-bold text-gray-900 text-xs">
                        {locale === "ar" ? `الحصة ${idx + 1}` : `Séance ${idx + 1}`}
                      </span>
                      <span className="text-[11px] text-muted font-normal">
                        {sessionDate.toLocaleDateString(dateLocale, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="text-[10px] text-muted font-mono" dir="ltr">
                        {sessionDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {sessionEndDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>

                      {canManageAttendance && (
                        <button
                          type="button"
                          onClick={() => setSelectedSessionForModal(session)}
                          className="mt-1 text-[10px] font-bold text-primary hover:underline hover:text-primary-dark inline-flex items-center gap-1 cursor-pointer"
                          title={t("takeAttendance")}
                        >
                          <ClipboardCheck className="w-3 h-3" />
                          <span>{t("takeAttendance")}</span>
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}

              {/* Summary Header */}
              <th className="p-3 text-center text-xs font-bold text-gray-700 border-b border-s border-border min-w-[120px]">
                {tAtt("attendanceRate")}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {filteredParticipants.map((participant, pIndex) => {
              const rowBg = pIndex % 2 === 0 ? "bg-surface" : "bg-surface-muted/30";
              const isGirl = participant.gender === "FEMALE";
              const studentRecords = attendanceMap.get(participant.studentId);

              // Calculate attended count for this student
              let attendedCount = 0;
              let recordedCount = 0;

              for (const session of sessions) {
                const status = studentRecords ? studentRecords.get(session.id) : undefined;
                if (status) {
                  recordedCount++;
                  if (status === "PRESENT") attendedCount++;
                }
              }

              const ratePercent = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;

              return (
                <tr
                  key={participant.id}
                  className={`${rowBg} hover:bg-surface-subtle/80 transition-colors`}
                >
                  {/* Sticky Participant Column */}
                  <td className={`p-3 text-start border-e border-border sticky start-0 z-10 min-w-[200px] sm:min-w-[240px] ${rowBg}`}>
                    <div className="flex items-center gap-2.5">
                      {/* Chair Number Badge */}
                      {participant.chairNumber != null ? (
                        <span
                          className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded-full text-xs shrink-0 ${
                            isGirl
                              ? "bg-pink-100 text-pink-700 border border-pink-300"
                              : "bg-blue-100 text-blue-700 border border-blue-300"
                          }`}
                          title={isGirl ? t("girl") : t("boy")}
                        >
                          #{participant.chairNumber}
                        </span>
                      ) : (
                        <span className="w-6 text-center text-xs text-muted">—</span>
                      )}

                      <div className="truncate">
                        <p className="font-bold text-gray-900 text-xs sm:text-sm truncate">
                          {participant.name}
                        </p>
                        {participant.phone && (
                          <p className="text-[11px] text-muted font-mono" dir="ltr">
                            {participant.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Sessions Cells */}
                  {sessions.map((session) => {
                    const status = studentRecords ? studentRecords.get(session.id) : undefined;

                    if (status === "PRESENT") {
                      return (
                        <td key={session.id} className="p-3 text-center">
                          <div
                            className="w-5 h-5 mx-auto rounded-full bg-success shadow-2xs flex items-center justify-center text-white"
                            title={tAtt("legendPresent")}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        </td>
                      );
                    }

                    if (status === "ABSENT") {
                      return (
                        <td key={session.id} className="p-3 text-center">
                          <div
                            className="w-5 h-5 mx-auto rounded-full bg-danger shadow-2xs flex items-center justify-center text-white"
                            title={tAtt("legendAbsent")}
                          >
                            <X className="w-3 h-3 stroke-[3]" />
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={session.id} className="p-3 text-center">
                        <div
                          className="w-5 h-5 mx-auto rounded-full bg-surface-subtle border border-border"
                          title={tAtt("notRecorded")}
                        />
                      </td>
                    );
                  })}

                  {/* Student Attendance Rate Column */}
                  <td className="p-3 text-center border-s border-border">
                    <div className="flex flex-col items-center gap-0.5">
                      <Badge
                        variant={ratePercent >= 80 ? "success" : ratePercent >= 50 ? "warning" : "danger"}
                        size="sm"
                        className="font-mono font-bold"
                      >
                        {ratePercent}%
                      </Badge>
                      <span className="text-[10px] text-muted">
                        {attendedCount}/{totalSessions} {locale === "ar" ? "حصة" : "séances"}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredParticipants.length === 0 && (
              <tr>
                <td
                  colSpan={sessions.length + 2}
                  className="text-center py-12 text-sm text-muted"
                >
                  {searchQuery
                    ? (locale === "ar" ? "لم يتم العثور على أي مشارك يطابق البحث." : "Aucun participant ne correspond à la recherche.")
                    : t("noParticipantsAdded")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Attendance Taking Modal */}
      {selectedSessionForModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-xl relative w-full max-w-lg overflow-hidden border border-border">
            <button
              onClick={() => setSelectedSessionForModal(null)}
              className="absolute top-4 end-4 text-muted hover:text-gray-900 p-1.5 rounded-lg hover:bg-surface-subtle z-10 transition-colors"
            >
              <Image src="/close.png" alt="close" width={14} height={14} />
            </button>
            <WorkshopAttendanceForm
              sessionId={selectedSessionForModal.id}
              participants={participants.map((p) => ({
                id: p.id,
                studentId: p.studentId,
                gender: p.gender || "MALE",
                chairNumber: p.chairNumber ?? null,
                name: p.name,
                workshopId: workshop.id,
                totalPaid: 0 as any,
                totalRefunded: 0 as any,
                status: "ACTIVE",
              }))}
              existingRecords={selectedSessionForModal.attendances as any}
              setOpen={(open) => {
                if (!open) {
                  setSelectedSessionForModal(null);
                  router.refresh();
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
