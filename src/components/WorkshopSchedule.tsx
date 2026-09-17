"use client";

import { Workshop, WorkshopParticipant, WorkshopSession, WorkshopAttendance } from "@prisma/client";
import { useState, useEffect } from "react";
import Image from "next/image";
import WorkshopAttendanceForm from "./forms/WorkshopAttendanceForm";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

type FullSession = WorkshopSession & {
    attendances: WorkshopAttendance[];
};

const WorkshopSchedule = ({ workshop, sessions, participants }: { workshop: Workshop, sessions: FullSession[], participants: WorkshopParticipant[] }) => {
    const t = useTranslations("workshops");
    const locale = useLocale();
    const searchParams = useSearchParams();
    const sessionIdParam = searchParams.get("session");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSession, setSelectedSession] = useState<FullSession | null>(null);

    const openAttendanceModal = (session: FullSession) => {
        setSelectedSession(session);
        setIsModalOpen(true);
    };

    useEffect(() => {
        if (sessionIdParam) {
            const match = sessions.find((s) => s.id.toString() === sessionIdParam);
            if (match) {
                openAttendanceModal(match);
            }
        }
    }, [sessionIdParam, sessions]);

    const dateLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";

    return (
        <>
            <div className="bg-white p-6 rounded-lg shadow-sm border font-sans">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{t("scheduleTitle")}</h3>
                        <Link
                            href={`/list/attendance/workshop/${workshop.id}`}
                            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                            <CalendarCheck className="w-3 h-3" />
                            <span>{locale === "ar" ? "عرض سجل الحضور الكامل ←" : "Feuille de présence complète →"}</span>
                        </Link>
                    </div>
                </div>
                <ul className="space-y-3">
                    {sessions.map(session => (
                        <li key={session.id} className="text-sm flex items-center justify-between p-3 bg-gray-50 rounded-md">
                            <div>
                                <p className="font-medium">{new Date(session.startsAt).toLocaleDateString(dateLocale, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                                <p className="text-xs text-gray-500">{new Date(session.startsAt).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })} - {new Date(session.endsAt).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })}</p>
                            </div>
                            <button onClick={() => openAttendanceModal(session)} className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full hover:bg-green-200">
                                {t("takeAttendance")}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {/* Attendance Modal */}
            {isModalOpen && selectedSession && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl relative w-full max-w-lg">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
                            <Image src="/close.png" alt="close" width={16} height={16} />
                        </button>
                        <WorkshopAttendanceForm
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
