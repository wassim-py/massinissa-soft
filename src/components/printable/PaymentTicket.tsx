import React from 'react';
import Image from 'next/image';
import { Voucher, Student, Class } from "@prisma/client";
import { formatVoucherDisplay, formatPaymentDateTime } from "@/lib/voucherUtils";

const PAYMENT_TYPE_LABELS_AR: Record<string, string> = {
  INSCRIPTION: "حقوق التسجيل",
  TUITION_4SESSION: "اشتراك دراسي (4 حصص)",
  BOOK: "رسوم الكتب المدرسية",
  EXTRA_SESSION: "حصة إضافية",
  CATCHUP: "حصة استدراكية",
  FORMATION: "دفع التكوين اللغوي",
  WORKSHOP: "دفع الورشة / الدورة",
};

const PAYMENT_TYPE_LABELS_FR: Record<string, string> = {
  INSCRIPTION: "Frais d'inscription",
  TUITION_4SESSION: "Cycle d'études (4 séances)",
  BOOK: "Frais des livres",
  EXTRA_SESSION: "Séance supplémentaire",
  CATCHUP: "Séance de rattrapage",
  FORMATION: "Formation linguistique",
  WORKSHOP: "Atelier / Formation courte",
};

export type VoucherTicketProps = {
  voucher: (Voucher & {
    student: Student;
    class: Class;
    series?: { scope: string; id: number; level?: { name: string } | null; issuingBranch?: { name: string } | null; targetBranch?: { name: string } | null } | null;
    issuingBranch?: { name: string } | null;
    targetBranch?: { name: string } | null;
  }) & {
    items?: Array<{ type: string; labelFr?: string; labelAr?: string; label?: string; amount: number }>;
    totalAmount?: number;
  };
  sessionsCount?: number;
  remainingBalance?: number;
  locale?: string;
};

// Class component for react-to-print compatibility
export class PaymentTicket extends React.Component<VoucherTicketProps> {
  render() {
    const { voucher, sessionsCount, remainingBalance, locale = "ar" } = this.props;
    const isAr = locale === "ar";
    const { student, class: classData } = voucher;
    const voucherFormatted = formatVoucherDisplay(voucher);

    const ticketStyle: React.CSSProperties = {
      width: '76mm',
      maxWidth: '100%',
      fontFamily: isAr ? 'Tajawal, sans-serif' : 'system-ui, -apple-system, sans-serif',
      fontSize: '9pt',
      padding: '4px 6px',
      color: 'black',
      direction: isAr ? 'rtl' : 'ltr',
      lineHeight: '1.25',
    };

    const typeLabels = isAr ? PAYMENT_TYPE_LABELS_AR : PAYMENT_TYPE_LABELS_FR;
    const typeLabel = typeLabels[voucher.paymentType] || voucher.paymentType;
    const amountNum = Number(voucher.amount);

    return (
      <div style={ticketStyle}>
        {/* Header with Co-branded logos & Contact Info */}
        <div className="text-center mb-1.5">
          <div className="flex items-center justify-center gap-2 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/classty-logo.png" alt="Classty" style={{ width: '30px', height: '30px', objectFit: 'contain' }} />
            <span className="text-gray-400 font-bold text-xs">×</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/massinissa-logo.png" alt="Massinissa School" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          </div>
          <h1 className="text-sm font-extrabold text-black leading-tight">
            {isAr ? "مدرسة ماسينيسا" : "École Massinissa"}
          </h1>
          <div className="text-[8.5px] text-gray-700 leading-tight mt-0.5 space-y-0.5">
            <p>{isAr ? "العنوان: مقابل المحطة الاخيرة للترامواي / جامعة قسنطينة 02" : "Adresse : En face terminus tramway / Univ. Constantine 02"}</p>
            <p dir="ltr" className="font-mono font-medium">0560-99-01-30 | 0542-34-81-32 | 0542-19-39-80</p>
          </div>
          {voucher.isVoided && (
            <div className="mt-1 inline-block border-2 border-red-600 text-red-600 font-extrabold px-2 py-0.5 text-[10px] rounded">
              {isAr ? "وصل ملغى (VOIDED)" : "Reçu Annulé (VOIDED)"}
            </div>
          )}
        </div>

        {/* Voucher Transaction Metadata (Single, non-duplicated) */}
        <div className="border-t border-b border-dashed border-black my-1 py-1 text-[9.5px] space-y-0.5">
          <div className="flex justify-between items-center">
            <span className="font-semibold">{isAr ? "الوصل:" : "Reçu :"}</span>
            <span className="font-mono font-bold" dir="ltr">{voucherFormatted}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>{isAr ? "التاريخ:" : "Date :"}</span>
            <span className="font-mono" dir="ltr">{formatPaymentDateTime(voucher.issuedAt)}</span>
          </div>
          {voucher.issuingBranchId !== voucher.targetBranchId && (
            <div className="flex justify-between text-blue-700 font-semibold text-[9px]">
              <span>{isAr ? "نوع الوصل:" : "Type :"}</span>
              <span>
                {isAr
                  ? `عبر الفروع (مصدر ${voucher.issuingBranchId} → دراسة ${voucher.targetBranchId})`
                  : `Inter-branches (${voucher.issuingBranchId} → ${voucher.targetBranchId})`}
              </span>
            </div>
          )}
        </div>

        {/* Student & Class Details (No student phone, No teacher) */}
        <div className="my-1 text-[9.5px] space-y-0.5">
          <p><span className="font-bold">{isAr ? "التلميذ:" : "Élève :"}</span> {student.name}</p>
          <p><span className="font-bold">{isAr ? "معرّف التلميذ:" : "N° ID :"}</span> <span className="font-mono font-semibold">#{student.globalNumber || student.id}</span></p>
          <p><span className="font-bold">{isAr ? "الفوج:" : "Classe :"}</span> {classData.name}</p>
        </div>

        {/* Items Table: replaced 'البيان' with 'نوع الدفع' */}
        <div className="border-t border-dashed border-black pt-1">
          <div className="flex justify-between font-bold text-[9.5px] pb-0.5 border-b border-dashed border-black/40">
            <span>{isAr ? "نوع الدفع" : "Type de paiement"}</span>
            <span>{isAr ? "المبلغ" : "Montant"}</span>
          </div>
          {voucher.items && Array.isArray(voucher.items) && voucher.items.length > 0 ? (
            voucher.items.map((item: any, idx: number) => {
              const label = isAr ? item.labelAr || item.label : item.labelFr || item.label;
              const amt = Number(item.amount);
              return (
                <div key={idx} className="flex justify-between mt-0.5 text-[9px]">
                  <span>{label}</span>
                  <span className="font-mono font-semibold">{amt.toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')} {isAr ? 'دج' : 'DZD'}</span>
                </div>
              );
            })
          ) : (
            <div className="flex justify-between mt-0.5 text-[9.5px]">
              <span>{typeLabel}</span>
              <span className="font-mono font-semibold">{amountNum.toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')} {isAr ? 'دج' : 'DZD'}</span>
            </div>
          )}
        </div>

        {/* Additional Info if applicable */}
        {(sessionsCount !== undefined || remainingBalance !== undefined) && (
          <div className="border-t border-dashed border-black mt-1 pt-0.5 text-[9px] space-y-0.5">
            {sessionsCount !== undefined && (
              <div className="flex justify-between">
                <span>{isAr ? "عدد الحصص:" : "Séances :"}</span>
                <span className="font-semibold">{sessionsCount}</span>
              </div>
            )}
            {remainingBalance !== undefined && remainingBalance > 0 && (
              <div className="flex justify-between text-amber-800 font-bold">
                <span>{isAr ? "المبلغ المتبقي:" : "Reste à payer :"}</span>
                <span className="font-mono">{remainingBalance.toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')} {isAr ? 'دج' : 'DZD'}</span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="border-t-2 border-black mt-1 pt-1 text-end">
          <p className="font-extrabold text-sm">
            {isAr ? "المجموع:" : "Total :"} {
              (voucher.totalAmount !== undefined ? Number(voucher.totalAmount) : amountNum).toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')
            } {isAr ? 'دج' : 'DZD'}
          </p>
        </div>

        {/* Footer with Compact QR code & Thank You note (No issuer line) */}
        <div className="text-center mt-2 pt-1 border-t border-dashed border-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/massinissa-qr.png"
            alt="QR Code"
            style={{ width: '58px', height: '75px', margin: '0 auto', display: 'block' }}
          />
          <p className="text-[8px] font-mono text-gray-700 mt-0.5">massinissa_school_2011</p>
          <p className="text-[9px] text-gray-800 font-medium mt-0.5 leading-tight">
            {isAr ? "شكرًا لثقتكم بمؤسسة ماسينيسا" : "Merci de votre confiance en l'École Massinissa"}
          </p>
        </div>
      </div>
    );
  }
}

export default PaymentTicket;
