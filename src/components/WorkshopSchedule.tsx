"use client";

import { Workshop, WorkshopParticipant, WorkshopSession, WorkshopAttendance } from "@prisma/client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import WorkshopAttendanceForm from "./forms/WorkshopAttendanceForm";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CalendarCheck } from "lucide-react";
import { formatAlgiersTime } from "@/lib/algiersDate";

type FullSession = WorkshopSession & {
    attendances: WorkshopAttendance[];
};

const WorkshopSchedule = ({
    workshop,
    sessions,
    participants,
    canTakeAttendance = true,
}: {
    workshop: Workshop;
    sessions: FullSession[];
    participants: WorkshopParticipant[];
    canTakeAttendance?: boolean;
}) => {
    const t = useTranslations("workshops");
    const locale = useLocale();
    const searchParams = useSearchParams();
    const sessionIdParam = searchParams.get("session");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSession, setSelectedSession] = useState<FullSession | null>(null);
    const handledSessionParamRef = useRef<string | null>(null);

    const openAttendanceModal = (session: FullSession) => {
        setSelectedSession(session);
        setIsModalOpen(true);
    };

    useEffect(() => {
        if (!canTakeAttendance) return;
        if (sessionIdParam && handledSessionParamRef.current !== sessionIdParam) {
            const match = sessions.find((s) => s.id.toString() === sessionIdParam);
            if (match) {
                handledSessionParamRef.current = sessionIdParam;
                openAttendanceModal(match);
            }
        }
    }, [sessionIdParam, sessions, canTakeAttendance]);

    const dateLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";

    return (
        <>
            <div className="bg-white p-6 rounded-lg shadow-sm border font-sans">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{t("scheduleTitle")}</h3>
                        {canTakeAttendance && (
                            <Link
                                href={`/list/attendance/workshop/${workshop.id}`}
                                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                                <CalendarCheck className="w-3 h-3" />
                                <span>{locale === "ar" ? "عرض سجل الحضور الكامل ←" : "Feuille de présence complète →"}</span>
                            </Link>
                        )}
                    </div>
                </div>
                {sessions.length > 0 ? (
                    <ul className="space-y-3">
                        {sessions.map((session) => {
                            const startSource = (session as any).startTime ?? session.startsAt;
                            const endSource = (session as any).endTime ?? session.endsAt;
                            return (
                                <li key={session.id} className="text-sm flex items-center justify-between p-3 bg-gray-50 rounded-md gap-2">
                                    <div>
                                        <p className="font-medium">
                                            {new Date(startSource).toLocaleDateString(dateLocale, {
                                                weekday: "long",
                                                month: "short",
                                                day: "numeric",
                                                timeZone: "Africa/Algiers",
                                            })}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {formatAlgiersTime(startSource, locale)} - {formatAlgiersTime(endSource, locale)}
                                        </p>
                                    </div>
                                    {canTakeAttendance && (
                                        <button
                                            onClick={() => openAttendanceModal(session)}
                                            className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full hover:bg-green-200 shrink-0"
                                        >
                                            {t("takeAttendance")}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                        {locale === "ar" ? "لم يتم جدولة أي حصص بعد." : "Aucune séance programmée pour le moment."}
                    </p>
                )}
            </div>

            {/* Attendance Modal */}
            {canTakeAttendance && isModalOpen && selectedSession && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl relative w-full max-w-lg">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 end-4 text-gray-400 hover:text-gray-600">
                            <Image src="/close.png" alt="close" width={16} height={16} />
                        </button>
                        <WorkshopAttendanceForm
                            key={selectedSession.id}
                            sessionId={selectedSession.id}
                            participants={participants}
                            existingRecords={selectedSession.attendances}
                            setOpen={setIsModalOpen}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default WorkshopSchedule;
