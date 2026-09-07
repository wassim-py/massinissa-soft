import React from 'react';
import { Workshop, WorkshopParticipant, WorkshopPayment } from "@prisma/client";
import Image from 'next/image';

type TicketProps = {
    payment: WorkshopPayment & { participant: WorkshopParticipant, workshop: Workshop };
    amountOwedByParticipant: number;
};

export class WorkshopTicket extends React.Component<TicketProps> {
  render() {
    const { payment, amountOwedByParticipant } = this.props;
    const { participant, workshop } = payment;

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
          <p className="text-xs">وصل دفع الدورة</p>
        </div>

        <div className="border-t border-b border-dashed border-black my-2 py-2">
            <div className="flex justify-between">
                <span>رقم الوصل:</span>
                <span>W-{payment.id}</span>
            </div>
            <div className="flex justify-between">
                <span>التاريخ:</span>
                <span>{new Date(payment.date).toLocaleString()}</span>
            </div>
        </div>

        {/* Details */}
        <div className="my-2">
            <p><span className="font-bold">الاسم واللقب:</span> {participant.name}</p>
            <p><span className="font-bold">الدورة:</span> {workshop.title}</p>
        </div>

        {/* Items Table */}
        <div className="border-t border-dashed border-black pt-2">
          <div className="flex justify-between font-bold">
            <span>الوصف</span>
            <span>المبلغ</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>رسوم التسجيل في الدورة</span>
            <span>DZD {payment.amount.toFixed()}</span>
          </div>
        </div>
        
        <div className="border-t border-dashed border-black mt-2 pt-2">
            <div className="flex justify-between">
                <span>المبلغ المتبقي:</span>
                <span className="font-bold">DZD {amountOwedByParticipant.toFixed()}</span>
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
