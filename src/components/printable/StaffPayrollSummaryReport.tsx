import React from "react";
import Image from "next/image";
import { formatAlgiersDate, formatDZD as formatDZDLib } from "@/lib/algiersDate";
import {
  OUTCOME_FUNDING_SOURCES,
  getOutcomeFundingSourceMeta,
  normalizeOutcomeFundingSource,
} from "@/lib/financeConstants";

export interface StaffPayrollSummaryPrintRow {
  id: number;
  staffName: string;
  roleTitle: string;
  branchName?: string | null;
  month: number;
  year: number;
  amount: number;
  advance: number;
  bonus: number;
  totalNet: number;
  status: string;
  fundingSource?: string | null;
  paidAt?: string | Date | null;
  notes?: string | null;
}

export interface StaffAdvanceSummaryPrintRow {
  id: number;
  staffName: string;
  roleTitle?: string;
  amount: number;
  date: string;
  month?: number | null;
  year?: number | null;
  fundingSource?: string | null;
  notes?: string | null;
}

export interface StaffPayrollSummaryPrintData {
  periodLabel: string;
  branchLabel: string;
  statusFilterLabel: string;
  generatedAt?: string | Date;
  staffMembersCount: number;
  payrolls: StaffPayrollSummaryPrintRow[];
  advances?: StaffAdvanceSummaryPrintRow[];
}

const MONTH_NAMES_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function StaffPayrollSummaryReport({
  data,
}: {
  data: StaffPayrollSummaryPrintData;
}) {
  const formatDZD = (num: number) => formatDZDLib(num, "fr");
  const formatShortDate = (d?: string | Date | null) => {
    if (!d) return "—";
    return (
      formatAlgiersDate(d, "fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) || String(d)
    );
  };

  let totalBaseAll = 0;
  let totalAdvancesAll = 0;
  let totalBonusAll = 0;
  let totalNetAll = 0;
  let totalNetPaid = 0;
  let totalNetPending = 0;

  const disbursedBySource: Record<string, { payrollPaid: number; advancesPaid: number }> = {};
  for (const src of OUTCOME_FUNDING_SOURCES) {
    disbursedBySource[src] = { payrollPaid: 0, advancesPaid: 0 };
  }

  for (const row of data.payrolls) {
    const net = Math.max(0, row.amount - (row.advance || 0) + (row.bonus || 0));
    totalBaseAll += row.amount;
    totalAdvancesAll += row.advance || 0;
    totalBonusAll += row.bonus || 0;
    totalNetAll += net;

    if (row.status === "PAID") {
      totalNetPaid += net;
      const src = normalizeOutcomeFundingSource(row.fundingSource);
      disbursedBySource[src].payrollPaid += net;
    } else {
      totalNetPending += net;
    }
  }

  let totalStandaloneAdvances = 0;
  for (const adv of data.advances || []) {
    totalStandaloneAdvances += adv.amount;
    const src = normalizeOutcomeFundingSource(adv.fundingSource);
    disbursedBySource[src].advancesPaid += adv.amount;
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "210mm",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "10.5pt",
        color: "#0f172a",
        direction: "ltr",
        backgroundColor: "#ffffff",
      }}
      className="staff-payroll-summary-container staff-payslip-container"
    >
      {/* Official Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <Image
            src="/massinissa-emblem.png"
            alt="École Massinissa"
            width={58}
            height={58}
            className="object-contain"
            unoptimized
          />
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              École Massinissa
            </h1>
            <p className="text-xs text-slate-600 font-semibold">
              Direction Générale &amp; Administration Financière
            </p>
            <p className="text-[11px] text-slate-500">
              Constantine — Algérie
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-bold px-3 py-1 text-xs rounded uppercase tracking-wide">
            Rapport de Paie du Personnel
          </span>
          <p className="text-xs font-bold text-slate-900 mt-1.5">
            Période : <span className="text-indigo-700">{data.periodLabel}</span>
          </p>
          <p className="text-[11px] text-slate-600">
            Succursale : <span className="font-semibold">{data.branchLabel}</span>
          </p>
          <p className="text-[11px] text-slate-500">
            Filtre : {data.statusFilterLabel} • Édité le{" "}
            {formatShortDate(data.generatedAt || new Date())}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-2.5 mb-5 avoid-break">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
            Salaires de Base Bruts
          </p>
          <p className="text-sm font-mono font-extrabold text-slate-900 mt-1">
            {formatDZD(totalBaseAll)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {data.payrolls.length} bulletin(s) • {data.staffMembersCount} employé(s)
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-amber-800">
            Avances Déduites
          </p>
          <p className="text-sm font-mono font-extrabold text-amber-900 mt-1">
            - {formatDZD(totalAdvancesAll)}
          </p>
          <p className="text-[10px] text-amber-700 mt-0.5">
            Primes : + {formatDZD(totalBonusAll)}
          </p>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">
            Total Net Payé (Décaissé)
          </p>
          <p className="text-sm font-mono font-black text-emerald-900 mt-1">
            {formatDZD(totalNetPaid)}
          </p>
          <p className="text-[10px] text-emerald-700 mt-0.5">
            {data.payrolls.filter((r) => r.status === "PAID").length} règlement(s) effectué(s)
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
            Total Net Période (Global)
          </p>
          <p className="text-sm font-mono font-extrabold text-slate-900 mt-1">
            {formatDZD(totalNetAll)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            En attente : {formatDZD(totalNetPending)}
          </p>
        </div>
      </div>

      {/* Breakdown by Funding Source */}
      <div className="mb-5 avoid-break">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
          Répartition des décaissements par source de financement
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          {OUTCOME_FUNDING_SOURCES.map((src) => {
            const meta = getOutcomeFundingSourceMeta(src, "fr");
            const bucket = disbursedBySource[src];
            return (
              <div
                key={src}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-800">
                    {meta.label}
                  </span>
                </div>
                <p className="text-sm font-mono font-black text-slate-900 mt-1">
                  {formatDZD(bucket.payrollPaid)}
                </p>
                {bucket.advancesPaid > 0 && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    + {formatDZD(bucket.advancesPaid)} d&apos;acomptes enregistrés
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Payrolls Table */}
      <div className="mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
          Détail des Bulletins de Paie ({data.payrolls.length})
        </h2>

        {data.payrolls.length === 0 ? (
          <div className="border border-slate-200 rounded-lg p-6 text-center text-xs text-slate-500">
            Aucun bulletin de paie ne correspond aux critères sélectionnés.
          </div>
        ) : (
          <table className="w-full border-collapse text-[10.5px] text-left">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-2 border border-slate-800 font-bold">Mois</th>
                <th className="p-2 border border-slate-800 font-bold">Employé &amp; Poste</th>
                <th className="p-2 border border-slate-800 font-bold">Succursale</th>
                <th className="p-2 border border-slate-800 font-bold text-right">Base</th>
                <th className="p-2 border border-slate-800 font-bold text-right">Avance</th>
                <th className="p-2 border border-slate-800 font-bold text-right">Prime</th>
                <th className="p-2 border border-slate-800 font-bold text-right">Net à payer</th>
                <th className="p-2 border border-slate-800 font-bold">Source</th>
                <th className="p-2 border border-slate-800 font-bold text-center">Statut / Date</th>
              </tr>
            </thead>
            <tbody>
              {data.payrolls.map((p, idx) => {
                const net = Math.max(0, p.amount - (p.advance || 0) + (p.bonus || 0));
                const srcMeta = getOutcomeFundingSourceMeta(p.fundingSource, "fr");
                return (
                  <tr
                    key={p.id}
                    className={idx % 2 === 1 ? "bg-slate-50/80" : "bg-white"}
                  >
                    <td className="p-2 border border-slate-200 font-mono whitespace-nowrap font-semibold">
                      {MONTH_NAMES_FR[p.month - 1] || p.month} {p.year}
                    </td>
                    <td className="p-2 border border-slate-200">
                      <span className="font-bold text-slate-900 block">{p.staffName}</span>
                      <span className="text-[9.5px] text-slate-500">{p.roleTitle}</span>
                      {p.notes && (
                        <span className="text-[9px] text-slate-500 italic block">
                          {p.notes}
                        </span>
                      )}
                    </td>
                    <td className="p-2 border border-slate-200 text-slate-600">
                      {p.branchName || "Siège"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-right whitespace-nowrap">
                      {formatDZD(p.amount)}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-right whitespace-nowrap text-amber-800">
                      {p.advance > 0 ? `- ${formatDZD(p.advance)}` : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono text-right whitespace-nowrap text-indigo-800">
                      {p.bonus > 0 ? `+ ${formatDZD(p.bonus)}` : "—"}
                    </td>
                    <td className="p-2 border border-slate-200 font-mono font-black text-right whitespace-nowrap text-slate-900">
                      {formatDZD(net)}
                    </td>
                    <td className="p-2 border border-slate-200 whitespace-nowrap text-[9.5px] font-semibold text-slate-700">
                      {srcMeta.shortLabel}
                    </td>
                    <td className="p-2 border border-slate-200 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          p.status === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {p.status === "PAID" ? "PAYÉ" : "EN ATTENTE"}
                      </span>
                      <span className="block text-[9px] font-mono text-slate-500 mt-0.5">
                        {formatShortDate(p.paidAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-900">
                <td colSpan={3} className="p-2 border border-slate-300 uppercase text-[10px]">
                  Totaux ({data.payrolls.length} bulletins)
                </td>
                <td className="p-2 border border-slate-300 font-mono text-right whitespace-nowrap">
                  {formatDZD(totalBaseAll)}
                </td>
                <td className="p-2 border border-slate-300 font-mono text-right whitespace-nowrap text-amber-900">
                  - {formatDZD(totalAdvancesAll)}
                </td>
                <td className="p-2 border border-slate-300 font-mono text-right whitespace-nowrap text-indigo-900">
                  + {formatDZD(totalBonusAll)}
                </td>
                <td className="p-2 border border-slate-300 font-mono font-black text-right whitespace-nowrap">
                  {formatDZD(totalNetAll)}
                </td>
                <td colSpan={2} className="p-2 border border-slate-300 text-right text-[9.5px]">
                  Payé : {formatDZD(totalNetPaid)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Standalone Advances Breakdown (if any matching advances exist) */}
      {data.advances && data.advances.length > 0 && (
        <div className="mb-6 avoid-break">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
            Journal des Avances / Acomptes Enregistrés ({data.advances.length} — Total :{" "}
            {formatDZD(totalStandaloneAdvances)})
          </h2>
          <table className="w-full border-collapse text-[10px] text-left">
            <thead>
              <tr className="bg-amber-900 text-white">
                <th className="p-2 border border-amber-950 font-bold">Date</th>
                <th className="p-2 border border-amber-950 font-bold">Employé</th>
                <th className="p-2 border border-amber-950 font-bold">Mois ciblé</th>
                <th className="p-2 border border-amber-950 font-bold">Source</th>
                <th className="p-2 border border-amber-950 font-bold">Notes</th>
                <th className="p-2 border border-amber-950 font-bold text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {data.advances.map((a) => {
                const srcMeta = getOutcomeFundingSourceMeta(a.fundingSource, "fr");
                return (
                  <tr key={a.id} className="border-b border-slate-200">
                    <td className="p-1.5 border border-slate-200 font-mono whitespace-nowrap">
                      {formatShortDate(a.date)}
                    </td>
                    <td className="p-1.5 border border-slate-200 font-semibold">
                      {a.staffName}
                      {a.roleTitle ? ` (${a.roleTitle})` : ""}
                    </td>
                    <td className="p-1.5 border border-slate-200 font-mono whitespace-nowrap">
                      {a.month ? `${MONTH_NAMES_FR[a.month - 1] || a.month} ${a.year || ""}` : "—"}
                    </td>
                    <td className="p-1.5 border border-slate-200 whitespace-nowrap">
                      {srcMeta.shortLabel}
                    </td>
                    <td className="p-1.5 border border-slate-200 text-slate-600">
                      {a.notes || "—"}
                    </td>
                    <td className="p-1.5 border border-slate-200 font-mono font-bold text-right whitespace-nowrap text-amber-900">
                      - {formatDZD(a.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Signature Footer */}
      <div className="grid grid-cols-2 gap-12 pt-4 mt-6 border-t border-slate-300 text-xs avoid-break">
        <div className="text-center">
          <p className="font-bold text-slate-800">Responsable Comptabilité &amp; Paie</p>
          <p className="text-[10px] text-slate-500 mt-1 mb-10">Date et visa</p>
          <div className="border-b border-dashed border-slate-400 w-44 mx-auto" />
        </div>
        <div className="text-center">
          <p className="font-bold text-slate-800">Le Directeur / Propriétaire</p>
          <p className="text-[10px] text-slate-500 mt-1 mb-10">Cachet et signature</p>
          <div className="border-b border-dashed border-slate-400 w-44 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export default StaffPayrollSummaryReport;
