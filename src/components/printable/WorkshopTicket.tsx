import React from 'react';
import Image from 'next/image';

export type WorkshopTicketPayment = {
  id: number | string;
  number?: number | string;
  voucherDisplay?: string;
  amount: number;
  date: Date | string;
  notes?: string | null;
  participant: { name: string; phone?: string | null; chairNumber?: number | null; gender?: string | null };
  workshop: { title: string; totalPrice?: any; branchName?: string };
};

type TicketProps = {
  payment: WorkshopTicketPayment;
  amountOwedByParticipant: number;
  locale?: string;
};

export class WorkshopTicket extends React.Component<TicketProps> {
  render() {
    const { payment, amountOwedByParticipant, locale = "ar" } = this.props;
    const isAr = locale === "ar";
    const { participant, workshop } = payment;

    const ticketStyle: React.CSSProperties = {
      width: '80mm',
      fontFamily: isAr ? 'Tajawal, sans-serif' : 'system-ui, -apple-system, sans-serif',
      fontSize: '10pt',
      padding: '16px',
      color: 'black',
      direction: isAr ? 'rtl' : 'ltr',
    };

    return (
      <div style={ticketStyle}>
        {/* Header */}
        <div className="text-center mb-4">
          <Image src="/logo.png" alt="logo" width={48} height={48} className="mx-auto" />
          <h1 className="text-lg font-bold mt-2">École Massinissa</h1>
          <p className="text-xs">{isAr ? "وصل دفع الورشة / الدورة" : "Reçu de paiement de l'atelier"}</p>
        </div>

        <div className="border-t border-b border-dashed border-black my-2 py-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span>{isAr ? "رقم الوصل:" : "N° Reçu :"}</span>
            <span className="font-mono font-bold">
              {payment.voucherDisplay || `BON ${payment.number || payment.id}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{isAr ? "التاريخ:" : "Date :"}</span>
            <span>{new Date(payment.date).toLocaleString(isAr ? "ar-DZ" : "fr-DZ")}</span>
          </div>
        </div>

        {/* Details */}
        <div className="my-2 text-xs space-y-1">
          <p><span className="font-bold">{isAr ? "الاسم واللقب:" : "Nom & prénom :"}</span> {participant.name}</p>
          {participant.chairNumber && (
            <p><span className="font-bold">{isAr ? "رقم الكرسي:" : "N° Chaise :"}</span> #{participant.chairNumber}</p>
          )}
          <p><span className="font-bold">{isAr ? "الدورة:" : "Atelier :"}</span> {workshop.title}</p>
        </div>

        {/* Items Table */}
        <div className="border-t border-dashed border-black pt-2">
          <div className="flex justify-between font-bold text-xs">
            <span>{isAr ? "الوصف" : "Description"}</span>
            <span>{isAr ? "المبلغ" : "Montant"}</span>
          </div>
          <div className="flex justify-between mt-1 text-sm">
            <span>{isAr ? "رسوم التسجيل في الدورة" : "Frais d'inscription"}</span>
            <span className="font-mono">{Number(payment.amount).toLocaleString(isAr ? "ar-DZ" : "fr-DZ")} {isAr ? "دج" : "DZD"}</span>
          </div>
        </div>
        
        {/* Payment Summary Section */}
        <div className="border-t border-dashed border-black mt-2 pt-2 text-xs">
          <div className="flex justify-between">
            <span>{isAr ? "المبلغ المتبقي:" : "Reste à payer :"}</span>
            <span className="font-bold font-mono">{amountOwedByParticipant.toLocaleString(isAr ? "ar-DZ" : "fr-DZ")} {isAr ? "دج" : "DZD"}</span>
          </div>
        </div>

        {/* Total */}
        <div className="border-t-2 border-black mt-2 pt-2 text-end">
          <p className="font-bold text-base">
            {isAr ? "المجموع:" : "Total :"} {Number(payment.amount).toLocaleString(isAr ? "ar-DZ" : "fr-DZ")} {isAr ? "دج" : "DZD"}
          </p>
        </div>

        {/* Notes */}
        {payment.notes && (
          <div className="mt-4 text-xs">
            <p className="font-bold">{isAr ? "ملاحظات:" : "Remarques :"}</p>
            <p>{payment.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs mt-6 text-gray-600">
          <p>{isAr ? "شكراً لكم لثقتكم بمؤسستنا!" : "Merci pour votre confiance !"}</p>
        </div>
      </div>
    );
  }
}

