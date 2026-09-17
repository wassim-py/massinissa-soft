"use client";

import { Workshop, WorkshopParticipant } from "@prisma/client";
import { useState, Fragment } from "react";
import Image from "next/image";
import WorkshopParticipantForm from "./forms/WorkshopParticipantForm";
import DeleteButton from "./DeleteButton";
import WorkshopPaymentForm from "./forms/WorkshopPaymentForm";
import PrintWorkshopTicketButton from "./PrintWorkshopTicketButton";
import RefundForm from "./forms/RefundForm";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { useTranslations, useLocale } from "next-intl";

type FullParticipant = WorkshopParticipant & {
  Student?: { name: string; phone: string | null } | null;
  name?: string;
  phone?: string;
  gender?: string;
  chairNumber?: number | null;
  payments?: {
    id: number;
    number?: number;
    amount: number;
    date: Date | string;
    isVoided?: boolean;
    series?: any;
    issuingBranchId?: number | null;
    targetBranchId?: number | null;
    paymentType?: string;
    refunds?: { id: number; amount: number }[];
  }[];
};

type PaymentModalData = {
  type: "create" | "update";
  participant: FullParticipant;
  payment?: any;
  amountOwedByParticipant?: number;
};

const WorkshopRoster = ({
  workshop,
  participants,
}: {
  workshop: Workshop;
  participants: FullParticipant[];
}) => {
  const t = useTranslations("workshops");
  const locale = useLocale();

  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [participantModalData, setParticipantModalData] = useState<{
    type: "create" | "update";
    participant?: WorkshopParticipant;
  } | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);
  const [visibleHistory, setVisibleHistory] = useState<number | null>(null);

  const toggleHistory = (participantId: number) => {
    setVisibleHistory((prev) => (prev === participantId ? null : participantId));
  };

  const openParticipantModal = (type: "create" | "update", participant?: WorkshopParticipant) => {
    setParticipantModalData({ type, participant });
    setIsParticipantModalOpen(true);
  };

  const openPaymentModal = (type: "create" | "update", participant: FullParticipant, payment?: any) => {
    const totalPaid = Number(participant.totalPaid || 0);
    const totalRefunded = Number(participant.totalRefunded || 0);
    const netPaid = totalPaid - totalRefunded;
    const workshopPrice = Number(workshop.totalPrice || 0);
    const amountOwed = workshopPrice > netPaid ? workshopPrice - netPaid : 0;

    setPaymentModalData({ type, participant, payment, amountOwedByParticipant: amountOwed });
    setIsPaymentModalOpen(true);
  };

  // Fallback calculation in case chairNumber was null on any legacy record (§7.14)
  let boyCounter = 0;
  let girlCounter = 0;
  const processedParticipants = [];
  for (const p of participants) {
    const isGirl = p.gender === "FEMALE";
    let num = p.chairNumber;
    if (!num) {
      if (isGirl) {
        girlCounter += 1;
        num = girlCounter;
      } else {
        boyCounter += 1;
        num = boyCounter;
      }
    }
    processedParticipants.push({
      ...p,
      chairNumber: num,
    });
  }

  // Sort by chair number: Boy #1 then Girl #1, Boy #2 then Girl #2...
  const sortedParticipants = [...processedParticipants].sort((a, b) => {
    const chairA = a.chairNumber ?? 0;
    const chairB = b.chairNumber ?? 0;
    if (chairA !== chairB) {
      return chairA - chairB;
    }
    const weightA = a.gender === "MALE" ? 0 : 1;
    const weightB = b.gender === "MALE" ? 0 : 1;
    return weightA - weightB;
  });

  return (
    <>
      <div className="bg-white p-6 rounded-lg shadow-sm border font-sans">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {t("participantsTitle", { count: sortedParticipants.length })}
          </h2>
          <button
            onClick={() => openParticipantModal("create")}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-wsmYellow hover:opacity-90 transition-opacity"
            title="Add Participant"
          >
            <Image src="/create.png" alt="Add Participant" width={16} height={16} />
          </button>
        </div>

        {/* WORKSHOP STUDENT LIST TABLE (§7.14) */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-start">
            <thead className="bg-gray-50 text-gray-600 text-xs font-semibold">
              <tr>
                <th scope="col" className="p-3 text-start whitespace-nowrap">
                  {t("chairNumber")}
                </th>
                <th scope="col" className="p-3 text-start whitespace-nowrap">
                  {t("student")}
                </th>
                <th scope="col" className="p-3 text-end whitespace-nowrap">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm">
              {sortedParticipants.map((participant) => {
                const netPaid = Number(participant.totalPaid || 0) - Number(participant.totalRefunded || 0);
                const workshopPrice = Number(workshop.totalPrice || 0);
                const isPaidInFull = netPaid >= workshopPrice;
                const amountOwed = isPaidInFull ? 0 : workshopPrice - netPaid;
                const participantName = participant.Student?.name || participant.name || `${t("student")} #${participant.id}`;
                const participantPhone = participant.Student?.phone || participant.phone || null;
                const isGirl = participant.gender === "FEMALE";
                const isHistoryVisible = visibleHistory === participant.id;

                return (
                  <Fragment key={participant.id}>
                    <tr className="hover:bg-gray-50/80 transition-colors">
                      {/* Auto-assigned Chair Number Column (§7.14) */}
                      <td className="p-3 whitespace-nowrap">
                        {isGirl ? (
                          <span className="inline-flex items-center justify-center font-bold px-3 py-1 rounded-full text-xs bg-pink-100 text-pink-700 border border-pink-300">
                            #{participant.chairNumber}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center font-bold px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-700 border border-blue-300">
                            #{participant.chairNumber}
                          </span>
                        )}
                      </td>

                      {/* Student Info Column */}
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Image
                            src="/avatar.png"
                            alt="avatar"
                            width={32}
                            height={32}
                            className="rounded-full flex-shrink-0"
                          />
                          <div>
                            <p className="font-semibold text-gray-900">{participantName}</p>
                            {participantPhone && (
                              <p className="text-xs text-gray-500">{participantPhone}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="p-3 text-end whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleHistory(participant.id)}
                            className="px-3 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300"
                          >
                            {isHistoryVisible ? t("hideHistory") : t("showHistory")}
                          </button>
                          <button
                            onClick={() => openPaymentModal("create", participant)}
                            className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
                          >
                            {t("recordPayment")}
                          </button>
                          <button
                            onClick={() => openParticipantModal("update", participant)}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-wsmSky hover:opacity-80"
                            title="Edit Participant"
                          >
                            <Image src="/update.png" alt="Update" width={14} height={14} />
                          </button>
                          <DeleteButton
                            table="workshopParticipant"
                            id={participant.id}
                            data={{ workshopId: workshop.id }}
                          />
                        </div>
                      </td>
                    </tr>

                    {/* Expandable History Row: Rendered directly under the corresponding student */}
                    {isHistoryVisible && (
                      <tr key={`history-${participant.id}`} className="bg-gray-50 border-t">
                        <td colSpan={3} className="p-4">
                          <div className="text-sm space-y-3 bg-white p-4 rounded-lg border">
                            <div className="flex justify-between items-center py-1">
                              <span className="font-semibold text-gray-700">{t("totalPaid")}</span>
                              <span className="font-bold text-green-700">
                                {netPaid.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                              </span>
                            </div>

                            {participant.payments && participant.payments.length > 0 ? (
                              <div className="overflow-x-auto mt-2">
                                <table className="min-w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-gray-100 text-gray-600 border-b">
                                      <th className="p-2 text-start">{t("voucherNumber")}</th>
                                      <th className="p-2 text-start">{t("paidAmountLabel")}</th>
                                      <th className="p-2 text-start">{t("date")}</th>
                                      <th className="p-2 text-center">{t("print")}</th>
                                      <th className="p-2 text-center">{t("refund")}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {participant.payments.map((p, idx) => {
                                      const voucherDisplay = formatVoucherDisplay(
                                        {
                                          number: p.number || p.id,
                                          issuedAt: p.date,
                                          paymentType: "WORKSHOP",
                                          issuingBranchId: p.issuingBranchId,
                                          targetBranchId: p.targetBranchId,
                                          series: p.series,
                                        },
                                        {
                                          branchName: (workshop as any).branch?.name,
                                          isWorkshop: true,
                                        }
                                      );

                                      return (
                                        <tr key={p.id || idx} className="hover:bg-gray-50">
                                          <td className="p-2 font-mono font-bold text-blue-600">
                                            {voucherDisplay}
                                          </td>
                                          <td className="p-2 font-medium">
                                            {Number(p.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                                          </td>
                                          <td className="p-2 text-gray-500">
                                            {new Date(p.date).toLocaleDateString(
                                              locale === "ar" ? "ar-DZ" : "fr-DZ"
                                            )}
                                          </td>
                                          <td className="p-2 text-center">
                                            <PrintWorkshopTicketButton
                                              payment={{
                                                id: p.number || p.id,
                                                number: p.number || p.id,
                                                voucherDisplay,
                                                amount: p.amount,
                                                date: p.date,
                                                participant: {
                                                  name: participantName,
                                                  phone: participantPhone,
                                                  chairNumber: participant.chairNumber,
                                                  gender: participant.gender,
                                                },
                                                workshop: {
                                                  title: workshop.title,
                                                  totalPrice: workshop.totalPrice,
                                                  branchName: (workshop as any).branch?.name,
                                                },
                                              }}
                                              amountOwedByParticipant={amountOwed}
                                            />
                                          </td>
                                        <td className="p-2 text-center">
                                          <RefundForm
                                            payment={{
                                              id: p.id,
                                              voucherId: p.id,
                                              amount: p.amount,
                                              refunds: p.refunds || [],
                                              paymentType: "WORKSHOP",
                                            }}
                                          />
                                        </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 py-1">{t("noVouchers")}</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {sortedParticipants.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-sm text-gray-500 text-center py-6">
                    {t("noParticipantsAdded")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Update Participant Modal */}
      {isParticipantModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl relative w-full max-w-md">
            <button
              onClick={() => setIsParticipantModalOpen(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"
            >
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
            <button
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"
            >
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
