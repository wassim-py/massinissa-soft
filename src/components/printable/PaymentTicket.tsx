import React from 'react';
import { Voucher, Student, Class } from "@prisma/client";
import {
  formatVoucherDisplay,
  getPaymentTypeLabel,
  resolveVoucherTicketStatus,
} from "@/lib/voucherUtils";
import { formatAlgiersDateTime, formatDZD } from "@/lib/algiersDate";
import { formatDiscountBadgeLabel } from "@/lib/studentBilling";
import {
  CLASSTY_THERMAL_LOGO_BASE64,
  MASSINISSA_THERMAL_LOGO_BASE64,
  MASSINISSA_QR_BASE64,
} from "@/lib/receiptAssets";

export type VoucherTicketProps = {
  voucher: (Voucher & {
    student?: (Student & { id?: string; globalNumber?: string | null; name?: string }) | any;
    class?: (Class & { name?: string; isFormation?: boolean | null }) | any;
    series?: {
      scope?: string | null;
      id?: number | string;
      prefix?: string | null;
      level?: { name: string } | null;
      issuingBranch?: { name: string } | null;
      targetBranch?: { name: string } | null;
    } | null;
    issuingBranch?: { name: string } | null;
    targetBranch?: { name: string } | null;
    refunds?: Array<{ id?: number | string; amount: number | string | any }>;
  }) & {
    items?: Array<{ type: string; labelFr?: string; labelAr?: string; label?: string; amount: number }>;
    totalAmount?: number;
    remainingSessions?: number;
    cycleRemainingFee?: number;
  };
  sessionsCount?: number;
  remainingSessions?: number;
  cycleRemainingFee?: number;
  remainingBalance?: number;
  isPartial?: boolean;
  locale?: string;
};

// Class component for react-to-print compatibility
export class PaymentTicket extends React.Component<VoucherTicketProps> {
  render() {
    const {
      voucher,
      sessionsCount,
      remainingSessions,
      cycleRemainingFee,
      remainingBalance,
      isPartial,
      locale = "ar",
    } = this.props;
    const isAr = locale === "ar";
    const student = voucher?.student;
    const classData = voucher?.class;
    const voucherFormatted = formatVoucherDisplay(voucher);

    const ticketStyle: React.CSSProperties = {
      width: '78mm',
      maxWidth: '100%',
      fontFamily: isAr ? 'Tajawal, sans-serif' : 'system-ui, -apple-system, sans-serif',
      fontSize: '10pt',
      padding: '4px 6px',
      color: 'black',
      direction: isAr ? 'rtl' : 'ltr',
      lineHeight: '1.3',
    };

    const typeLabel = getPaymentTypeLabel(voucher?.paymentType, locale);
    const amountNum = Number(voucher?.amount ?? 0);
    const displayTotal =
      voucher?.totalAmount !== undefined && voucher?.totalAmount !== null
        ? Number(voucher.totalAmount)
        : amountNum;

    const resolvedRemainingSessions =
      remainingSessions !== undefined ? remainingSessions : voucher?.remainingSessions;
    const resolvedCycleRemainingFee =
      cycleRemainingFee !== undefined ? cycleRemainingFee : voucher?.cycleRemainingFee;
    const resolvedIsPartial =
      isPartial !== undefined ? isPartial : (voucher?.isPartial ?? undefined);

    const statusInfo = resolveVoucherTicketStatus(voucher, {
      cycleRemainingFee: resolvedCycleRemainingFee,
      remainingBalance,
      isPartial: resolvedIsPartial ?? undefined,
    });

    const showRemainingSessions =
      resolvedRemainingSessions !== undefined &&
      resolvedRemainingSessions !== null &&
      voucher?.paymentType !== "REVISION_SESSION" &&
      voucher?.paymentType !== "WORKSHOP" &&
      voucher?.paymentType !== "FORMATION" &&
      !classData?.isFormation;

    const hasCycleTuitionItem =
      voucher?.paymentType === "TUITION_4SESSION" ||
      (Array.isArray(voucher?.items) &&
        voucher.items.some((it: any) => it?.type === "TUITION_4SESSION"));

    const discountInfo =
      (voucher as any)?.discountInfo ||
      ((voucher as any)?.appliedPayerStatus === "DISCOUNTED"
        ? {
            appliedPayerStatus: "DISCOUNTED",
            discountType: (voucher as any)?.discountType,
            discountValue: (voucher as any)?.discountValue,
            baseCyclePrice: (voucher as any)?.baseCyclePrice,
            effectiveCyclePrice: (voucher as any)?.effectiveCyclePrice,
          }
        : null);

    const showAdditionalSection =
      Boolean(discountInfo) ||
      sessionsCount !== undefined ||
      showRemainingSessions ||
      (statusInfo.restToCompleteCycle !== undefined && statusInfo.restToCompleteCycle > 0) ||
      statusInfo.isPartiallyRefunded ||
      statusInfo.isRefunded;

    const studentName = student?.name || "—";
    const studentIdentifier = student?.globalNumber || student?.id || "—";
    const className = classData?.name || (voucher as any)?.workshop?.title || "—";

    return (
      <div style={ticketStyle}>
        {/* Header with Co-branded logos & Contact Info */}
        <div className="text-center mb-1.5">
          <div className="flex items-center justify-center gap-2 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLASSTY_THERMAL_LOGO_BASE64} alt="Classty" style={{ width: '40px', height: '40px', objectFit: 'contain', imageRendering: 'crisp-edges' }} />
            <span className="text-black font-bold text-sm">×</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MASSINISSA_THERMAL_LOGO_BASE64} alt="Massinissa School" style={{ width: '48px', height: '36px', objectFit: 'contain', imageRendering: 'crisp-edges' }} />
          </div>
          <h1 className="text-base font-black text-black leading-tight">
            {isAr ? "مدرسة ماسينيسا" : "École Massinissa"}
          </h1>
          <div className="text-[10px] text-gray-800 leading-tight mt-0.5 space-y-0.5">
            <p>{isAr ? "العنوان: مقابل المحطة الاخيرة للترامواي / جامعة قسنطينة 02" : "Adresse : En face terminus tramway / Univ. Constantine 02"}</p>
            <p dir="ltr" className="font-mono font-bold text-black">0560-99-01-30 | 0542-34-81-32 | 0542-19-39-80</p>
          </div>
          {statusInfo.isVoided && (
            <div className="mt-1 inline-block border-2 border-red-600 text-red-600 font-extrabold px-2 py-0.5 text-[10px] rounded">
              {isAr ? "وصل ملغى (VOIDED)" : "Reçu Annulé (VOIDED)"}
            </div>
          )}
          {!statusInfo.isVoided && statusInfo.isRefundVoucher && (
            <div className="mt-1 inline-block border-2 border-black bg-black text-white font-extrabold px-2 py-0.5 text-[10px] rounded">
              {isAr ? "وصل استرداد (REFUND)" : "Bon de remboursement (REFUND)"}
            </div>
          )}
          {!statusInfo.isVoided && !statusInfo.isRefundVoucher && statusInfo.isRefunded && (
            <div className="mt-1 inline-block border-2 border-red-600 text-red-600 font-extrabold px-2 py-0.5 text-[10px] rounded">
              {isAr ? "وصل مسترجع كلياً (REFUNDED)" : "Reçu Remboursé (REFUNDED)"}
            </div>
          )}
          {!statusInfo.isVoided && !statusInfo.isRefundVoucher && statusInfo.isPartiallyRefunded && (
            <div className="mt-1 inline-block border-2 border-orange-700 text-orange-800 font-extrabold px-2 py-0.5 text-[10px] rounded">
              {isAr ? "مسترجع جزئياً (PARTIAL REFUND)" : "Partiellement remboursé"}
            </div>
          )}
          {statusInfo.isPartialPayment && (
            <div className="mt-1 inline-block border-2 border-amber-700 text-amber-800 font-extrabold px-2 py-0.5 text-[10px] rounded">
              {isAr ? "دفع جزئي (PARTIEL)" : "Paiement partiel (PARTIEL)"}
            </div>
          )}
        </div>

        {/* Voucher Transaction Metadata (Single, non-duplicated) */}
        <div className="border-t border-b border-dashed border-black my-1.5 py-1 text-[11px] space-y-0.5">
          <div className="flex justify-between items-center">
            <span className="font-bold">{isAr ? "الوصل:" : "Reçu :"}</span>
            <span className="font-mono font-bold text-xs" dir="ltr">{voucherFormatted}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold">{isAr ? "التاريخ:" : "Date :"}</span>
            <span className="font-mono font-semibold" dir="ltr">{formatAlgiersDateTime(voucher?.issuedAt, locale) || "—"}</span>
          </div>
          {statusInfo.isRefundVoucher && voucher?.refundForVoucherId && (
            <div className="flex justify-between font-bold text-[10px]">
              <span>{isAr ? "مرجع الوصل:" : "Réf. reçu :"}</span>
              <span className="font-mono" dir="ltr">#{voucher.refundForVoucherId}</span>
            </div>
          )}
          {voucher?.issuingBranchId !== undefined &&
            voucher?.targetBranchId !== undefined &&
            voucher.issuingBranchId !== voucher.targetBranchId && (
              <div className="flex justify-between text-blue-700 font-bold text-[10px]">
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
        <div className="my-1.5 text-[11px] space-y-0.5">
          <p><span className="font-bold">{isAr ? "التلميذ:" : "Élève :"}</span> <span className="font-bold text-xs">{studentName}</span></p>
          <p><span className="font-bold">{isAr ? "معرّف التلميذ:" : "N° ID :"}</span> <span className="font-mono font-bold">#{studentIdentifier}</span></p>
          <p><span className="font-bold">{isAr ? "الفوج:" : "Classe :"}</span> <span className="font-semibold">{className}</span></p>
        </div>

        {/* Items Table: replaced 'البيان' with 'نوع الدفع' */}
        <div className="border-t border-dashed border-black pt-1">
          <div className="flex justify-between font-bold text-[11px] pb-0.5 border-b border-dashed border-black/40">
            <span>{isAr ? "نوع الدفع" : "Type de paiement"}</span>
            <span>{isAr ? "المبلغ" : "Montant"}</span>
          </div>
          {voucher?.items && Array.isArray(voucher.items) && voucher.items.length > 0 ? (
            voucher.items.map((item: any, idx: number) => {
              const label =
                (isAr ? item.labelAr || item.label : item.labelFr || item.label) ||
                getPaymentTypeLabel(item.type, locale);
              const amt = Number(item.amount);
              return (
                <div key={idx} className="flex justify-between mt-0.5 text-[10.5px]">
                  <span>{label}</span>
                  <span className="font-mono font-bold">{formatDZD(amt, locale)}</span>
                </div>
              );
            })
          ) : (
            <div className="flex justify-between mt-0.5 text-[11px]">
              <span>{typeLabel}</span>
              <span className="font-mono font-bold">{formatDZD(amountNum, locale)}</span>
            </div>
          )}
        </div>

        {/* Additional Info: Sessions paid, Remaining sessions, Cycle balance, Refund summary */}
        {showAdditionalSection && (
          <div className="border-t border-dashed border-black mt-1 pt-0.5 text-[10px] space-y-0.5">
            {discountInfo && (
              <div className="flex justify-between font-bold">
                <span>{isAr ? "تخفيض مطبق:" : "Remise appliquée :"}</span>
                <span className="font-mono">
                  {formatDiscountBadgeLabel(
                    discountInfo.discountType,
                    discountInfo.discountValue,
                    isAr ? "ar" : "fr"
                  )}
                </span>
              </div>
            )}
            {sessionsCount !== undefined && (
              <div className="flex justify-between">
                <span className="font-semibold">{isAr ? "عدد الحصص:" : "Séances :"}</span>
                <span className="font-bold">{sessionsCount}</span>
              </div>
            )}
            {showRemainingSessions && (
              <div className="flex justify-between">
                <span className="font-semibold">{isAr ? "الحصص المتبقية:" : "Séances restantes :"}</span>
                <span className={`font-mono font-bold ${Number(resolvedRemainingSessions) <= 0 ? "text-red-700" : ""}`}>
                  {resolvedRemainingSessions}
                </span>
              </div>
            )}
            {statusInfo.restToCompleteCycle !== undefined && statusInfo.restToCompleteCycle > 0 && (
              <div className="flex justify-between text-amber-800 font-bold">
                <span>
                  {hasCycleTuitionItem
                    ? isAr
                      ? "المتبقي لإكمال الدورة:"
                      : "Reste pour 1 cycle :"
                    : isAr
                    ? "المبلغ المتبقي:"
                    : "Reste à payer :"}
                </span>
                <span className="font-mono font-bold">{formatDZD(statusInfo.restToCompleteCycle, locale)}</span>
              </div>
            )}
            {(statusInfo.isPartiallyRefunded || statusInfo.isRefunded) && statusInfo.totalRefunded > 0 && (
              <div className="flex justify-between text-red-700 font-bold">
                <span>{isAr ? "المبلغ المسترجع:" : "Montant remboursé :"}</span>
                <span className="font-mono font-bold">
                  {statusInfo.isPartiallyRefunded ? `-${formatDZD(statusInfo.totalRefunded, locale)}` : formatDZD(statusInfo.totalRefunded, locale)}
                </span>
              </div>
            )}
            {statusInfo.isPartiallyRefunded && statusInfo.totalRefunded > 0 && (
              <div className="flex justify-between font-bold">
                <span>{isAr ? "الصافي المدفوع:" : "Net payé :"}</span>
                <span className="font-mono font-bold">
                  {formatDZD(Math.max(0, displayTotal - statusInfo.totalRefunded), locale)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="border-t-2 border-black mt-1.5 pt-1 text-end">
          <p className="font-black text-base text-black">
            {statusInfo.isRefundVoucher
              ? isAr
                ? "المجموع المسترد:"
                : "Total remboursé :"
              : isAr
              ? "المجموع:"
              : "Total :"}{" "}
            {formatDZD(
              statusInfo.isRefundVoucher ? statusInfo.effectiveAmount : displayTotal,
              locale
            )}
          </p>
        </div>

        {/* Footer with Compact QR code & Thank You note (No issuer line) */}
        <div className="text-center mt-2 pt-1 border-t border-dashed border-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MASSINISSA_QR_BASE64}
            alt="QR Code"
            style={{ width: '58px', height: '75px', margin: '0 auto', display: 'block', imageRendering: 'crisp-edges' }}
          />
          <p className="text-[9px] font-mono text-gray-800 font-bold mt-0.5">massinissa_school_2011</p>
          <p className="text-[10.5px] text-gray-900 font-bold mt-0.5 leading-tight">
            {isAr ? "شكرًا لثقتكم بمؤسسة ماسينيسا" : "Merci de votre confiance en l'École Massinissa"}
          </p>
        </div>
      </div>
    );
  }
}

export default PaymentTicket;
