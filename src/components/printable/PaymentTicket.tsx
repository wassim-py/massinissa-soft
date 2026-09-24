import React from 'react';
import { Voucher, Student, Class } from "@prisma/client";
import Image from 'next/image';
import { formatVoucherDisplay } from "@/lib/voucherUtils";

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
  voucher: Voucher & {
    student: Student;
    class: Class;
    series?: { scope: string; id: number; level?: { name: string } | null; issuingBranch?: { name: string } | null; targetBranch?: { name: string } | null } | null;
    issuingBranch?: { name: string } | null;
    targetBranch?: { name: string } | null;
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
      width: '80mm',
      fontFamily: isAr ? 'Tajawal, sans-serif' : 'system-ui, -apple-system, sans-serif',
      fontSize: '10pt',
      padding: '16px',
      color: 'black',
      direction: isAr ? 'rtl' : 'ltr',
    };

    const typeLabels = isAr ? PAYMENT_TYPE_LABELS_AR : PAYMENT_TYPE_LABELS_FR;
    const typeLabel = typeLabels[voucher.paymentType] || voucher.paymentType;
    const amountNum = Number(voucher.amount);

    return (
      <div style={ticketStyle}>
        {/* Header */}
        <div className="text-center mb-4">
          <Image src="/logo.png" alt="logo" width={48} height={48} className="mx-auto" />
          <h1 className="text-lg font-bold mt-2">{isAr ? "مدرسة ماسينيسا" : "École Massinissa"}</h1>
          <p className="text-xs font-bold text-gray-800 font-mono tracking-tight mt-1" dir="ltr">
            {voucherFormatted}
          </p>
          {voucher.isVoided && (
            <div className="mt-1 inline-block border-2 border-red-600 text-red-600 font-extrabold px-2 py-0.5 text-xs rounded">
              {isAr ? "وصل ملغى (VOIDED)" : "Reçu Annulé (VOIDED)"}
            </div>
          )}
        </div>

        <div className="border-t border-b border-dashed border-black my-2 py-2 text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span className="font-semibold">{isAr ? "الوصل:" : "Reçu :"}</span>
            <span className="font-mono font-bold" dir="ltr">{voucherFormatted}</span>
          </div>
          <div className="flex justify-between">
            <span>{isAr ? "التاريخ:" : "Date :"}</span>
            <span>{new Date(voucher.issuedAt).toLocaleString(isAr ? "ar-DZ" : "fr-DZ")}</span>
          </div>
          {voucher.issuingBranchId !== voucher.targetBranchId && (
            <div className="flex justify-between text-blue-700 font-semibold">
              <span>{isAr ? "نوع الوصل:" : "Type :"}</span>
              <span>
                {isAr
                  ? `عبر الفروع (فرع مصدر ${voucher.issuingBranchId} → فرع دراسة ${voucher.targetBranchId})`
                  : `Inter-branches (Émetteur ${voucher.issuingBranchId} → Étude ${voucher.targetBranchId})`}
              </span>
            </div>
          )}
        </div>

        {/* Student & Class Details */}
        <div className="my-2 text-xs space-y-1">
          <p><span className="font-bold">{isAr ? "التلميذ:" : "Élève :"}</span> {student.name}</p>
          {student.phone && <p><span className="font-bold">{isAr ? "الهاتف:" : "Tél :"}</span> {student.phone}</p>}
          <p><span className="font-bold">{isAr ? "الفوج:" : "Classe :"}</span> {classData.name}</p>
          <p><span className="font-bold">{isAr ? "نوع الدفع:" : "Type :"}</span> {typeLabel}</p>
        </div>

        {/* Items Table */}
        <div className="border-t border-dashed border-black pt-2">
          <div className="flex justify-between font-bold text-xs">
            <span>{isAr ? "البيان" : "Désignation"}</span>
            <span>{isAr ? "المبلغ" : "Montant"}</span>
          </div>
          <div className="flex justify-between mt-1 text-sm">
            <span>{typeLabel}</span>
            <span>{amountNum.toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')} {isAr ? 'دج' : 'DZD'}</span>
          </div>
        </div>

        {/* Additional Info if applicable */}
        {(sessionsCount !== undefined || remainingBalance !== undefined) && (
          <div className="border-t border-dashed border-black mt-2 pt-2 text-xs space-y-1">
            {sessionsCount !== undefined && (
              <div className="flex justify-between">
                <span>{isAr ? "عدد الحصص:" : "Séances :"}</span>
                <span>{sessionsCount}</span>
              </div>
            )}
            {remainingBalance !== undefined && remainingBalance > 0 && (
              <div className="flex justify-between text-amber-800 font-bold">
                <span>{isAr ? "المبلغ المتبقي:" : "Reste à payer :"}</span>
                <span>{remainingBalance.toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')} {isAr ? 'دج' : 'DZD'}</span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="border-t-2 border-black mt-2 pt-2 text-end">
          <p className="font-bold text-base">
            {isAr ? "المجموع:" : "Total :"} {amountNum.toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ')} {isAr ? 'دج' : 'DZD'}
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-xs mt-6 text-gray-600">
          <p>{isAr ? "شكرًا لثقتكم بمؤسسة ماسينيسا" : "Merci de votre confiance en l'École Massinissa"}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            {isAr ? "حرر بواسطة:" : "Émis par :"} {voucher.issuedBy}
          </p>
        </div>
      </div>
    );
  }
}

export default PaymentTicket;
