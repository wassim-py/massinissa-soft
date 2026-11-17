import React from 'react';
import { formatAlgiersDateTime, formatDZD } from "@/lib/algiersDate";
import { resolveVoucherTicketStatus } from "@/lib/voucherUtils";
import {
  CLASSTY_THERMAL_LOGO_BASE64,
  MASSINISSA_THERMAL_LOGO_BASE64,
} from "@/lib/receiptAssets";

export type WorkshopTicketPayment = {
  id: number | string;
  number?: number | string;
  voucherDisplay?: string;
  amount: number;
  date: Date | string;
  notes?: string | null;
  isVoided?: boolean | null;
  isPartial?: boolean | null;
  isRefund?: boolean | null;
  status?: string | null;
  refundForVoucherId?: number | null;
  remainingBalance?: number | null;
  refunds?: Array<{ id?: number | string; amount: number }>;
  paymentType?: string | null;
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
    const statusInfo = resolveVoucherTicketStatus(
      { ...payment, paymentType: payment.paymentType || "WORKSHOP" },
      {
        remainingBalance: amountOwedByParticipant,
        isPartial: payment.isPartial ?? undefined,
      }
    );

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
          <div className="flex items-center justify-center gap-2 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLASSTY_THERMAL_LOGO_BASE64} alt="Classty" style={{ width: '40px', height: '40px', objectFit: 'contain', imageRendering: 'crisp-edges' }} />
            <span className="text-black font-bold text-sm">×</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MASSINISSA_THERMAL_LOGO_BASE64} alt="Massinissa School" style={{ width: '48px', height: '36px', objectFit: 'contain', imageRendering: 'crisp-edges' }} />
          </div>
          <h1 className="text-lg font-bold mt-1">École Massinissa</h1>
          <p className="text-xs">{isAr ? "وصل دفع الورشة / الدورة" : "Reçu de paiement de l'atelier"}</p>
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

        <div className="border-t border-b border-dashed border-black my-2 py-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span>{isAr ? "رقم الوصل:" : "N° Reçu :"}</span>
            <span className="font-mono font-bold">
              {payment.voucherDisplay || `BON ${payment.number || payment.id}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{isAr ? "التاريخ:" : "Date :"}</span>
            <span>{formatAlgiersDateTime(payment.date, locale) || "—"}</span>
          </div>
          {statusInfo.isRefundVoucher && payment.refundForVoucherId && (
            <div className="flex justify-between font-bold text-[10px]">
              <span>{isAr ? "مرجع الوصل:" : "Réf. reçu :"}</span>
              <span className="font-mono" dir="ltr">#{payment.refundForVoucherId}</span>
            </div>
          )}
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
            <span>
              {statusInfo.isRefundVoucher
                ? isAr
                  ? "استرداد رسوم الدورة / الورشة"
                  : "Remboursement d'atelier"
                : isAr
                ? "رسوم الورشة / الدورة"
                : "Frais d'atelier"}
            </span>
            <span className="font-mono">{formatDZD(payment.amount, locale)}</span>
          </div>
        </div>
        
        {/* Payment Summary Section */}
        {(!statusInfo.isVoided && !statusInfo.isRefundVoucher && !statusInfo.isRefunded) ||
        ((statusInfo.isPartiallyRefunded || statusInfo.isRefunded) && statusInfo.totalRefunded > 0) ? (
          <div className="border-t border-dashed border-black mt-2 pt-2 text-xs space-y-1">
            {!statusInfo.isVoided && !statusInfo.isRefundVoucher && !statusInfo.isRefunded && (
              statusInfo.restToCompleteCycle !== undefined && statusInfo.restToCompleteCycle > 0 ? (
                <div className="flex justify-between text-amber-800 font-bold">
                  <span>{isAr ? "المبلغ المتبقي:" : "Reste à payer :"}</span>
                  <span className="font-bold font-mono">{formatDZD(statusInfo.restToCompleteCycle, locale)}</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span>{isAr ? "المبلغ المتبقي:" : "Reste à payer :"}</span>
                  <span className="font-bold font-mono">{formatDZD(amountOwedByParticipant, locale)}</span>
                </div>
              )
            )}
            {(statusInfo.isPartiallyRefunded || statusInfo.isRefunded) && statusInfo.totalRefunded > 0 && (
              <div className="flex justify-between text-red-700 font-bold">
                <span>{isAr ? "المبلغ المسترجع:" : "Montant remboursé :"}</span>
                <span className="font-mono font-bold">
                  {statusInfo.isPartiallyRefunded ? `-${formatDZD(statusInfo.totalRefunded, locale)}` : formatDZD(statusInfo.totalRefunded, locale)}
                </span>
              </div>
            )}
          </div>
        ) : null}

        {/* Total */}
        <div className="border-t-2 border-black mt-2 pt-2 text-end">
          <p className="font-bold text-base">
            {statusInfo.isRefundVoucher
              ? isAr
                ? "المجموع المسترد:"
                : "Total remboursé :"
              : isAr
              ? "المجموع:"
              : "Total :"}{" "}
            {formatDZD(
              statusInfo.isRefundVoucher ? statusInfo.effectiveAmount : payment.amount,
              locale
            )}
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
