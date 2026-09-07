import React from 'react';
import { Payment, Student, Class } from "@prisma/client";
import Image from 'next/image';

// --- FIX ---
// The props are simplified to accept calculated values directly,
// which resolves the complex type error.
type TicketProps = {
    payment: Payment & { student: Student, class: Class };
    sessionsForThisPayment: number;
    amountOwedByStudent: number;
};

// This must be a class component to work reliably with the `ref` from react-to-print
export class PaymentTicket extends React.Component<TicketProps> {
  render() {
    // The component now receives all necessary data directly via props.
    const { payment, sessionsForThisPayment, amountOwedByStudent } = this.props;
    const { student, class: classData } = payment;

    const ticketStyle: React.CSSProperties = {
      width: '80mm',
      fontFamily: 'tajawal',
      fontSize: '10pt',
      padding: '16px',
      color: 'black',
      direction: 'rtl',
    };

    return (
      <div style={ticketStyle}>
        {/* Header */}
        <div className="text-center mb-4">
          <Image src="/logo.png" alt="logo" width={48} height={48} className="mx-auto" />
          <h1 className="text-lg font-bold mt-2">Classty</h1>
          <p className="text-xs">وصل دفع</p>
        </div>

        <div className="border-t border-b border-dashed border-black my-2 py-2">
            <div className="flex justify-between">
                <span>رقم الوصل:</span>
                <span>{payment.id}</span>
            </div>
            <div className="flex justify-between">
                <span>التاريخ:</span>
                <span>{new Date(payment.date).toLocaleString()}</span>
            </div>
        </div>

        {/* Details */}
        <div className="my-2">
            <p><span className="font-bold">الاسم واللقب:</span> {student.name} {student.surname}</p>
            <p><span className="font-bold">القسم:</span> {classData.name}</p>
        </div>

        {/* Items Table */}
        <div className="border-t border-dashed border-black pt-2">
          <div className="flex justify-between font-bold">
            <span>الوصف</span>
            <span>المبلغ</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>رسوم الدراسة</span>
            <span>DZD {payment.amount.toFixed()}</span>
          </div>
        </div>
        
        {/* Payment Summary Section */}
        <div className="border-t border-dashed border-black mt-2 pt-2">
            <div className="flex justify-between">
                <span>عدد الحصص:</span>
                <span>{sessionsForThisPayment.toFixed()}</span>
            </div>
            <div className="flex justify-between">
                <span>المبلغ المتبقي:</span>
                <span className="font-bold">DZD {amountOwedByStudent.toFixed()}</span>
            </div>
        </div>

        {/* Total */}
        <div className="border-t-2 border-black mt-2 pt-2 text-right">
          <p className="font-bold text-lg">المجموع: DZD {payment.amount.toFixed()}</p>
        </div>

        {/* Notes */}
        {payment.notes && (
            <div className="mt-4 text-xs">
                <p className="font-bold">ملاحظات:</p>
                <p>{payment.notes}</p>
            </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs mt-6">
          <p>شكرا لكم!</p>
        </div>
      </div>
    );
  }
}
