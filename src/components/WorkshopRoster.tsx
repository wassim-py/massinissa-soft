"use client";

import { Workshop, WorkshopParticipant, WorkshopPayment, Refund } from "@prisma/client";
import { useState } from "react";
import Image from "next/image";
import WorkshopParticipantForm from "./forms/WorkshopParticipantForm";
import DeleteButton from "./DeleteButton";
import WorkshopPaymentForm from "./forms/WorkshopPaymentForm";
import PrintWorkshopTicketButton from "./PrintWorkshopTicketButton";
import RefundForm from "./forms/RefundForm"; // Import the new RefundForm

// Define more specific types to include the nested refund data
type FullPayment = WorkshopPayment & {
    refunds: Refund[];
};

type FullParticipant = WorkshopParticipant & {
    payments: FullPayment[];
};

type PaymentModalData = {
    type: 'create' | 'update';
    participant: FullParticipant;
    payment?: FullPayment;
    amountOwedByParticipant?: number;
};

const WorkshopRoster = ({ workshop, participants }: { workshop: Workshop, participants: FullParticipant[] }) => {
    const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
    const [participantModalData, setParticipantModalData] = useState<{ type: 'create' | 'update', participant?: WorkshopParticipant } | null>(null);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);

    const [visibleHistory, setVisibleHistory] = useState<number | null>(null);

    const toggleHistory = (participantId: number) => {
        setVisibleHistory(prev => prev === participantId ? null : participantId);
    };

    const openParticipantModal = (type: 'create' | 'update', participant?: WorkshopParticipant) => {
        setParticipantModalData({ type, participant });
        setIsParticipantModalOpen(true);
    };

    const openPaymentModal = (type: 'create' | 'update', participant: FullParticipant, payment?: FullPayment) => {
        const totalPaid = participant.payments.reduce((sum, p) => sum + p.amount, 0);
        const totalRefunded = participant.payments.flatMap(p => p.refunds).reduce((sum, r) => sum + r.amount, 0);
        const netPaid = totalPaid - totalRefunded;
        const amountOwed = workshop.price > netPaid ? workshop.price - netPaid : 0;

        setPaymentModalData({ type, participant, payment, amountOwedByParticipant: amountOwed });
        setIsPaymentModalOpen(true);
    };

    return (
        <>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-800">التلاميذ المسجلون ({participants.length})</h2>
                    <button 
                        onClick={() => openParticipantModal('create')} 
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-wsmYellow hover:opacity-90 transition-opacity"
                        title="Add Participant"
                    >
                        <Image src="/create.png" alt="Add Participant" width={16} height={16} />
                    </button>
                </div>
                <div className="space-y-3">
                    {participants.map(participant => {
                        const totalPaid = participant.payments.reduce((sum, p) => sum + p.amount, 0);
                        const totalRefunded = participant.payments.flatMap(p => p.refunds).reduce((sum, r) => sum + r.amount, 0);
                        const netPaid = totalPaid - totalRefunded;
                        
                        const isPaidInFull = netPaid >= workshop.price;
                        const amountOwed = isPaidInFull ? 0 : workshop.price - netPaid;

                        return (
                            <div key={participant.id} className="bg-gray-50 rounded-md border">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3">
                                    <div className="flex items-center gap-3 flex-grow">
                                        <Image src="/avatar.png" alt="avatar" width={32} height={32} className="rounded-full"/>
                                        <div>
                                            <p className="font-medium">{participant.name}</p>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className={`font-semibold ${isPaidInFull ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isPaidInFull ? 'Paid in Full' : `Owed: DZD${amountOwed.toFixed()}`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 self-end sm:self-center">
                                        <button onClick={() => toggleHistory(participant.id)} className="px-3 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300">
                                            {visibleHistory === participant.id ? 'اخفي' : 'اضهر'} السجل
                                        </button>
                                        <button onClick={() => openPaymentModal('create', participant)} className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200">
                                            تسجيل دفع
                                        </button>
                                        <button onClick={() => openParticipantModal('update', participant)} className="w-7 h-7 flex items-center justify-center rounded-full bg-wsmSky hover:opacity-80">
                                            <Image src="/update.png" alt="Update" width={14} height={14} />
                                        </button>
                                        <DeleteButton table="workshopParticipant" id={participant.id} data={{ workshopId: workshop.id }} />
                                    </div>
                                </div>
                                
                                {visibleHistory === participant.id && (
                                    <div className="p-4 border-t">
                                        {participant.payments.length > 0 ? (
                                            <table className="w-full text-sm">
                                            <thead className="text-right text-xs text-gray-500">
                                                <tr>
                                                    <th className="pb-2 font-medium">التاريخ</th>
                                                    <th className="pb-2 font-medium">المبلغ</th>
                                                    <th className="pb-2 font-medium">المسترجع</th>
                                                    <th className="pb-2 font-medium">الرصيد</th>
                                                    <th className="pb-2 font-medium pl-4">ملاحظات</th>
                                                    <th className="pb-2 font-medium text-right"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {participant.payments.map(payment => {
                                                    const paymentTotalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
                                                    const paymentBalance = payment.amount - paymentTotalRefunded;

                                                    return (
                                                        <tr key={payment.id} className="border-b last:border-b-0">
                                                            <td className="py-2">{new Date(payment.date).toLocaleDateString()}</td>
                                                            <td className="py-2">{payment.amount.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</td>
                                                            <td className={`py-2 ${paymentTotalRefunded > 0 ? 'text-red-600' : ''}`}>{paymentTotalRefunded.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</td>
                                                            <td className="py-2 font-semibold text-green-700">{paymentBalance.toLocaleString('fr-DZ', { style: 'currency', currency: 'DZD' })}</td>
                                                            <td className="py-2 pl-4 text-gray-600">{payment.notes || '-'}</td>
                                                            <td className="py-2 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button onClick={() => openPaymentModal('update', participant, payment)} className="w-7 h-7 flex items-center justify-center rounded-full bg-wsmSky hover:opacity-80">
                                                                        <Image src="/update.png" alt="Update" width={14} height={14} />
                                                                    </button>
                                                                    <RefundForm payment={{...payment, paymentType: 'workshop'}} />
                                                                    <PrintWorkshopTicketButton 
                                                                        payment={{...payment, participant, workshop}}
                                                                        amountOwedByParticipant={amountOwed}
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                            </table>
                                        ) : (
                                            <p className="text-sm text-gray-500 text-center py-4">لم يتم تسجيل أي دفعات لهذا التلميذ</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {participants.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">لم يتم إضافة أي تلاميذ إلى هذه الورشة بعد.</p>
                    )}
                </div>
            </div>

            {/* Add/Update Participant Modal */}
            {isParticipantModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl relative w-full max-w-md">
                        <button onClick={() => setIsParticipantModalOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
                            <Image src="/close.png" alt="close" width={16} height={16} />
                        </button>
                        <WorkshopParticipantForm
                            type={participantModalData!.type}
                            workshopId={workshop.id}
                            data={participantModalData!.participant}
                            setOpen={setIsParticipantModalOpen}
                        />
                    </div>
                </div>
            )}

            {/* Add/Update Payment Modal */}
            {isPaymentModalOpen && paymentModalData && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl relative w-full max-w-sm">
                        <button onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600">
                            <Image src="/close.png" alt="close" width={16} height={16} />
                        </button>
                        <WorkshopPaymentForm
                            type={paymentModalData.type}
                            participant={paymentModalData.participant}
                            workshop={workshop}
                            data={paymentModalData.payment}
                            setOpen={setIsPaymentModalOpen}
                            amountOwedByParticipant={paymentModalData.amountOwedByParticipant}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default WorkshopRoster;
