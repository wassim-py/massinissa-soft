"use client";

import { Student, Attendance, Payment, Lesson, Class, Subject, Teacher, Refund } from "@prisma/client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { saveAttendance } from "@/lib/actions";
import { toast } from "react-toastify";
import PaymentForm from "./PaymentForm";
import PrintTicketButton from "../PrintTicketButton";

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

type FullPayment = Payment & {
    refunds: Refund[];
};

type FullStudent = Student & {
    payments: FullPayment[];
    attendances: Attendance[];
};

type FullLesson = Lesson & {
    class: Class;
    subject: Subject;
    teacher: Teacher;
}

const AttendanceRoster = ({
    lesson,
    students,
    existingRecords,
}: {
    lesson: FullLesson;
    students: FullStudent[];
    existingRecords: Attendance[];
}) => {
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
        const initialState: Record<string, AttendanceStatus> = {};
        students.forEach(student => {
            const record = existingRecords.find(r => r.studentId === student.id);
            initialState[student.id] = record?.present ? "PRESENT" : "ABSENT";
        });
        return initialState;
    });

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<FullStudent | null>(null);

    const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };
    
    const handleRecordPaymentClick = (student: FullStudent) => {
        setSelectedStudent(student);
        setIsPaymentModalOpen(true);
    };

    const saveAttendanceWithId = saveAttendance.bind(null, lesson.id);
    const [state, formAction] = useActionState(saveAttendanceWithId, {
        success: false,
        error: false,
        message: "",
    });

    useEffect(() => {
        if (state?.success) {
            toast.success(state.message);
        }
        if (state?.error) {
            toast.error(state.message);
        }
    }, [state]);

    return (
        <>
            {/* The list of students is no longer inside a form */}
            <div className="space-y-3">
                {students.map((student) => {
                    const currentStatus = attendance[student.id];

                    const totalPaid = student.payments.reduce((sum, p) => sum + p.amount, 0);
                    const totalRefunded = student.payments.flatMap(p => p.refunds || []).reduce((sum, r) => sum + r.amount, 0);
                    const netPaid = totalPaid - totalRefunded;

                    const pricePerSession = lesson.class.price > 0 ? lesson.class.price / 4 : 0;
                    const sessionsPurchased = pricePerSession > 0 ? netPaid / pricePerSession : 0;
                    const sessionsConsumed = student.attendances.length;
                    const sessionsRemaining = sessionsPurchased - sessionsConsumed;
                    
                    let statusBubble = { text: 'غير دافع', color: 'bg-red-500' };
                    if (sessionsRemaining >= 2) {
                        statusBubble = { text: 'دافع', color: 'bg-green-500' };
                    } else if (sessionsRemaining >= 1) {
                        statusBubble = { text: 'قريب الانتهاء', color: 'bg-yellow-500' };
                    }

                    const mostRecentPayment = student.payments.length > 0 
                        ? [...student.payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                        : null;
                    
                    const sessionsForLastPayment = mostRecentPayment && pricePerSession > 0 ? mostRecentPayment.amount / pricePerSession : 0;
                    const amountOwed = lesson.class.price > netPaid ? lesson.class.price - netPaid : 0;

                    return (
                        <div key={student.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-3 border rounded-lg gap-4">
                            <div className="flex items-center gap-4 flex-grow">
                                <Image src={student.img || "/noAvatar.png"} alt="" width={40} height={40} className="rounded-full object-cover"/>
                                <div>
                                    <p className="font-semibold">{`${student.name} ${student.surname}`}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span className="font-medium">{Math.floor(sessionsRemaining)} حصة متبقية</span>
                                        <span className={`w-2 h-2 rounded-full ${statusBubble.color}`}></span>
                                        <span>{statusBubble.text}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                                <div className="flex items-center gap-2">
                                    {/* The hidden input is now outside the save form, but that's okay */}
                                    <button type="button" onClick={() => handleStatusChange(student.id, "PRESENT")} className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors ${currentStatus === 'PRESENT' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-green-100'}`}>
                                        حاضر
                                    </button>
                                    <button type="button" onClick={() => handleStatusChange(student.id, "ABSENT")} className={`px-4 py-1 text-sm font-semibold rounded-full transition-colors ${currentStatus === 'ABSENT' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-red-100'}`}>
                                        غائب
                                    </button>
                                </div>    
                                <button type="button" onClick={() => handleRecordPaymentClick(student)} className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200">
                                    تسجيل الدفع
                                </button>
                                {mostRecentPayment && (
                                    <PrintTicketButton
                                        payment={{ ...mostRecentPayment, student, class: lesson.class }}
                                        sessionsForThisPayment={sessionsForLastPayment}
                                        amountOwedByStudent={amountOwed}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* The "Save" button is now wrapped in its own dedicated form */}
            <form action={formAction} className="mt-8 flex justify-end">
                {/* We map over the current attendance state to create hidden inputs */}
                {Object.entries(attendance).map(([studentId, status]) => (
                    <input key={studentId} type="hidden" name={`attendance[${studentId}]`} value={status} />
                ))}
                <SubmitButton/>
            </form>

            {/* Payment Modal */}
            {isPaymentModalOpen && selectedStudent && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl relative w-full max-w-sm">
                        <button onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
                            <Image src="/close.png" alt="close" width={16} height={16} />
                        </button>
                        <PaymentForm
                            student={selectedStudent}
                            classData={lesson.class}
                            setOpen={setIsPaymentModalOpen}
                            type="create"
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default AttendanceRoster;
