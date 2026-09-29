import React from "react";
import Image from "next/image";

export interface StaffPayslipPrintData {
  id: number;
  staffName: string;
  roleTitle: string;
  phone?: string | null;
  branchName?: string | null;
  month: number;
  year: number;
  amount: number; // base salary
  bonus: number; // prime / bonus cash
  totalNet: number;
  status: string;
  paidAt?: string | Date | null;
  notes?: string | null;
}

interface StaffPayslipTicketProps {
  data: StaffPayslipPrintData;
}

const MONTH_NAMES_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export function StaffPayslipTicket({ data }: StaffPayslipTicketProps) {
  // All staff payroll printables are strictly in French per owner specifications
  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "210mm",
    margin: "0 auto",
    padding: "24px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "12pt",
    color: "#111827",
    direction: "ltr",
    backgroundColor: "#ffffff",
  };

  const formatDZD = (num: number) => `${Number(num || 0).toLocaleString("fr-FR")} DZD`;
  const periodLabel = `${MONTH_NAMES_FR[data.month - 1] || data.month} ${data.year}`;

  const formatPaidDate = (d?: string | Date | null) => {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return String(d);
    }
  };

  return (
    <div style={containerStyle} className="staff-payslip-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="logo" width={60} height={60} className="object-contain" />
          <div>
            <h1 className="text-2xl font-black text-gray-900">École Massinissa</h1>
            <p className="text-xs text-gray-600 font-semibold">Siège principal : Constantine - Algérie</p>
            <p className="text-xs text-gray-500">Gestion administrative et paie du personnel</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-blue-900 text-white font-bold px-3 py-1 text-sm rounded">
            Bulletin de Paie - Personnel
          </span>
          <p className="text-xs font-mono mt-1 text-gray-600">N° Bulletin : #STF-{data.id}</p>
          <p className="text-xs text-gray-500 font-medium">
            Statut : {data.status === "PAID" ? "Payé (PAID)" : "En attente (PENDING)"}
          </p>
        </div>
      </div>

      {/* Staff & Period Information */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Informations du membre du personnel :</p>
          <p className="text-lg font-bold text-gray-900">{data.staffName}</p>
          <p className="text-xs text-gray-700 font-semibold mt-0.5">Poste / Fonction : <span className="text-gray-900">{data.roleTitle}</span></p>
          <p className="text-xs text-gray-600 mt-0.5">
            Succursale d&apos;affectation : <span className="font-medium text-gray-800">{data.branchName || "Siège / Toutes les succursales"}</span>
          </p>
          {data.phone && <p className="text-xs text-gray-600 font-mono mt-0.5">Tél : {data.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-xs">Période comptable :</p>
          <p className="text-base font-black text-blue-950">{periodLabel}</p>
          <p className="text-xs text-gray-600 mt-1">
            Date de règlement : <span className="font-semibold">{formatPaidDate(data.paidAt)}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Date d&apos;impression : {new Date().toLocaleDateString("fr-FR")}
          </p>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-2">
          Détail de la rémunération :
        </h2>
        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-gray-100 border border-gray-300 text-gray-700">
              <th className="p-2.5 border border-gray-300 font-bold">Rubrique</th>
              <th className="p-2.5 border border-gray-300 font-bold">Désignation</th>
              <th className="p-2.5 border border-gray-300 font-bold text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border border-gray-200">
              <td className="p-2.5 border border-gray-200 font-semibold text-gray-900">Salaire de base</td>
              <td className="p-2.5 border border-gray-200 text-gray-600">
                Rémunération contractuelle mensuelle ({periodLabel})
              </td>
              <td className="p-2.5 border border-gray-200 font-mono font-bold text-right text-gray-900">
                {formatDZD(data.amount)}
              </td>
            </tr>

            {/* Bonus / Prime Line */}
            <tr className="border border-gray-200 bg-orange-50/40">
              <td className="p-2.5 border border-gray-200 font-bold text-orange-950 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-500"></span>
                <span>Prime / Gratification</span>
              </td>
              <td className="p-2.5 border border-gray-200 text-orange-900">
                {data.notes ? (
                  <span>Prime exceptionnelle — {data.notes}</span>
                ) : (
                  <span>Prime de rendement / bonus de performance</span>
                )}
              </td>
              <td className="p-2.5 border border-gray-200 font-mono font-bold text-right text-orange-950">
                {data.bonus > 0 ? `+ ${formatDZD(data.bonus)}` : "0 DZD"}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold border border-gray-300">
              <td colSpan={2} className="p-2.5 border border-gray-300 text-gray-900 font-bold text-sm">
                Total Net Versé
              </td>
              <td className="p-2.5 border border-gray-300 font-mono text-blue-900 text-right text-base font-black">
                {formatDZD(data.totalNet)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Consolidated Summary Box */}
      <div className="border-2 border-gray-900 rounded-lg p-4 bg-gray-50 mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3 border-b border-gray-300 pb-1">
          Récapitulatif Financier :
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center text-gray-800">
            <span className="font-semibold">1. Salaire de base :</span>
            <span className="font-mono font-bold">{formatDZD(data.amount)}</span>
          </div>

          <div className="flex justify-between items-center text-orange-900">
            <span className="font-semibold">2. Prime / Bonus en espèces :</span>
            <span className="font-mono font-bold">
              {data.bonus > 0 ? `+ ${formatDZD(data.bonus)}` : "0 DZD"}
            </span>
          </div>

          {data.notes && (
            <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200 mt-1">
              <span className="font-semibold text-gray-700">Observation / Note : </span>
              <span>{data.notes}</span>
            </div>
          )}

          <div className="border-t-2 border-dashed border-gray-900 pt-2 mt-2 flex justify-between items-center text-lg font-black text-gray-900 bg-white p-3 rounded border">
            <span>Net total perçu :</span>
            <span className="font-mono text-blue-900 text-xl font-black">
              {formatDZD(data.totalNet)}
            </span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 pt-6 border-t border-gray-300 text-center text-xs">
        <div>
          <p className="font-bold text-gray-700 mb-12">Signature de l&apos;employé(e)</p>
          <p className="text-gray-400">...................................................</p>
        </div>
        <div>
          <p className="font-bold text-gray-700 mb-12">Cachet et signature de l&apos;administration</p>
          <p className="text-gray-400">...................................................</p>
        </div>
      </div>
    </div>
  );
}

export default StaffPayslipTicket;
