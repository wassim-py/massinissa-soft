"use client";

import { Workshop, WorkshopParticipant, WorkshopSession, WorkshopAttendance } from "@prisma/client";
import { useState } from "react";
import Image from "next/image";
import WorkshopAttendanceForm from "./forms/WorkshopAttendanceForm";

type FullSession = WorkshopSession & {
    attendances: WorkshopAttendance[];
};

const WorkshopSchedule = ({ workshop, sessions, participants }: { workshop: Workshop, sessions: FullSession[], participants: WorkshopParticipant[] }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSession, setSelectedSession] = useState<FullSession | null>(null);

    const openAttendanceModal = (session: FullSession) => {
        setSelectedSession(session);
        setIsModalOpen(true);
    };

    return (
        <>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-bold text-gray-800 mb-4">البرنامج والحضور</h3>
                <ul className="space-y-3">
                    {sessions.map(session => (
                        <li key={session.id} className="text-sm flex items-center justify-between p-3 bg-gray-50 rounded-md">
                            <div>
                                <p className="font-medium">{new Date(session.startTime).toLocaleDateString('ar-DZ', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                                <p className="text-xs text-gray-500">{new Date(session.startTime).toLocaleTimeString('ar-DZ', { hour: 'numeric', minute: '2-digit' })} - {new Date(session.endTime).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}</p>
                            </div>
                            <button onClick={() => openAttendanceModal(session)} className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full hover:bg-green-200">
                                تسجيل الحضور
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
