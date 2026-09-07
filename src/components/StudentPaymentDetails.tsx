"use client";

import Image from "next/image";
import { useState } from "react";
import FormContainer from "./FormContainer";
import RefundForm from "./forms/RefundForm";
import PrintTicketButton from "./PrintTicketButton";
import { Attendance, Class, Payment, Student } from "@prisma/client";
import PaymentForm from "./forms/PaymentForm";

// Define a more specific type for the student prop to match the data we are fetching
type StudentWithPayments = Student & {
    payments: (Payment & {
        refunds: { amount: number }[];
    })[];
    attendances: Attendance[];
};

// The classData prop can now just be the full Class type
type ClassData = Class;

const StudentPaymentDetails = ({ student, classData }: { student: StudentWithPayments, classData: ClassData }) => {
    const [isHistoryVisible, setIsHistoryVisible] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState<{ type: 'create' | 'update', payment?: Payment } | null>(null);


    // Calculate the student's overall financial status
    const totalPaid = student.payments.reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = student.payments.flatMap(p => p.refunds).reduce((sum, r) => sum + r.amount, 0);
    const netPaid = totalPaid - totalRefunded;

    // Calculate session status
    const pricePerSession = classData.price > 0 ? classData.price / 4 : 0;
    const sessionsPurchased = pricePerSession > 0 ? netPaid / pricePerSession : 0;
    const sessionsConsumed = student.attendances.length;
    const sessionsRemaining = sessionsPurchased - sessionsConsumed;

    let statusBubble = { text: 'غير دافع', color: 'bg-red-500' };
    if (sessionsRemaining >= 2) {
        statusBubble = { text: 'دافع', color: 'bg-green-500' };
    } else if (sessionsRemaining >= 1) {
        statusBubble = { text: 'قريب الانتهاء', color: 'bg-yellow-500' };
    }

    const openModal = (type: 'create' | 'update', payment?: Payment) => {
        setModalData({ type, payment });
        setIsModalOpen(true);
    };

    return (
        <>
            <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                {/* Student Header */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-gray-50 border-b gap-4">
                    <div className="flex items-center gap-4 flex-grow">
                        <Image
                            src={student.img || "/noAvatar.png"}
                            alt={`${student.name} ${student.surname}`}
                            width={48}
                            height={48}
                            className="rounded-full object-cover"
                        />
                        <div>
                            <p className="font-bold text-lg">{`${student.name} ${student.surname}`}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-600 mt-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${statusBubble.color}`}></span>
                                    <span>{statusBubble.text}</span>
                                </div>
                                <span>|</span>
                                <span className="font-medium">{Math.floor(sessionsRemaining)} حصة متبقية</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <button onClick={() => setIsHistoryVisible(!isHistoryVisible)} className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-md hover:bg-gray-300">
                            {isHistoryVisible ? 'اخفي' : 'اضهر'} السجل
                        </button>                        
                        <button onClick={() => openModal('create')} className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md hover:bg-blue-600 transition-colors">
                            تسجيل دفع
                        </button>
                    </div>
                </div>

                {/* Collapsible Payment History Table */}
                {isHistoryVisible && (
                    <div className="p-4">
                        {student.payments.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-right">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-2">التاريخ</th>
                                            <th className="px-4 py-2">المبلغ</th>
                                            <th className="px-4 py-2">تم استرجاعه</th>
                                            <th className="px-4 py-2">الرصيد</th>
                                            <th className="px-4 py-2 hidden md:table-cell">ملاحظات</th>
                                            <th className="px-4 py-2 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {student.payments.map((payment) => {
                                            const paymentTotalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
                                            const paymentBalance = payment.amount - paymentTotalRefunded;
                                            const sessionsForThisPayment = pricePerSession > 0 ? payment.amount / pricePerSession : 0;

                                            return (
                                                <tr key={payment.id} className="bg-white border-b hover:bg-gray-50">
                                                    <td className="px-4 py-2 font-medium">{new Date(payment.date).toLocaleDateString("ar-DZ")}</td>
                                                    <td className="px-4 py-2">{payment.amount.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</td>
                                                    <td className={`px-4 py-2 ${paymentTotalRefunded > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                                        {paymentTotalRefunded.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}
                                                    </td>
                                                    <td className="px-4 py-2 font-semibold text-green-700">{paymentBalance.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</td>
                                                    <td className="px-4 py-2 text-gray-600 hidden md:table-cell">{payment.notes || 'لا يوجد'}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={() => openModal('update', payment)} className="w-7 h-7 flex items-center justify-center rounded-full bg-sky-100 hover:bg-sky-200">
                                                                <Image src="/update.png" alt="Update" width={14} height={14} />
                                                            </button>
                                                            <RefundForm payment={{...payment, paymentType: 'class'}} />
                                                            <PrintTicketButton 
                                                                payment={{...payment, student, class: classData}} 
                                                                sessionsForThisPayment={sessionsForThisPayment}
                                                                amountOwedByStudent={0} // This can be improved if needed
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 text-center py-4">لم يتم تسجيل أي دفعات لهذا التلميذ.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {isModalOpen && modalData && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl relative w-full max-w-sm">
                        <button onClick={() => setIsModalOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
                            <Image src="/close.png" alt="close" width={16} height={16} />
                        </button>
                        <PaymentForm
                            student={student}
                            classData={classData}
                            setOpen={setIsModalOpen}
                            type={modalData.type}
                            data={modalData.payment}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default StudentPaymentDetails;
