import React from 'react';
import { MASSINISSA_LOGO_BASE64 } from "@/lib/receiptAssets";
import { formatAlgiersDate, formatDZD as formatDZDLib, ALGIERS_TIMEZONE } from "@/lib/algiersDate";

export interface OwnerConsolidatedGroupLine {
  teacherName: string;
  groupName: string;
  branchName?: string;
  payableLessons: number;
  teacherCut: number;
  schoolCut: number;
  totalTuition?: number;
}

export interface OwnerTeacherConsolidationPrintData {
  id?: number;
  periodStart: string | Date;
  periodEnd: string | Date;
  status?: string;
  teacher: {
    id: string;
    name: string;
    phone?: string | null;
  };
  groups: OwnerConsolidatedGroupLine[];
  totalPayableLessons: number;
  totalTeacherCut: number;
  totalSchoolCut: number;
  bonus?: number;
  salaryAdvances?: number;
  photocopyDeductions?: number;
  netTeacherPayout?: number;
  netSchoolRevenue?: number;
  generatedAt?: string | Date;
}

interface OwnerTeacherConsolidationReportProps {
  data: OwnerTeacherConsolidationPrintData;
  locale?: string;
}

export function OwnerTeacherConsolidationReport({ data }: OwnerTeacherConsolidationReportProps) {
  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '210mm',
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '11pt',
    color: '#111827',
    direction: 'ltr',
    backgroundColor: '#ffffff',
  };

  const formatDate = (d: string | Date) => {
    try {
      return formatAlgiersDate(d, 'fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) || String(d);
    } catch {
      return String(d);
    }
  };

  const formatDateTime = (d: string | Date) => {
    try {
      const dateObj = typeof d === 'string' ? new Date(d) : d;
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: ALGIERS_TIMEZONE,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(dateObj);
    } catch {
      return String(d);
    }
  };

  const formatDZD = (num: number) => formatDZDLib(num, 'fr');

  const bonus = data.bonus || 0;
  const advances = data.salaryAdvances || 0;
  const photocopy = data.photocopyDeductions || 0;
  const netTeacher = data.netTeacherPayout !== undefined
    ? data.netTeacherPayout
    : Math.max(0, data.totalTeacherCut + bonus - advances - photocopy);
  const netSchool = data.netSchoolRevenue !== undefined
    ? data.netSchoolRevenue
    : data.totalSchoolCut + photocopy;

  return (
    <div style={containerStyle} className="owner-teacher-consolidation-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <img
            src={MASSINISSA_LOGO_BASE64}
            alt="Massinissa School"
            style={{ width: '64px', height: '64px', objectFit: 'contain' }}
          />
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Massinissa School</h1>
            <p className="text-xs text-gray-600 font-semibold">Constantine - Algérie</p>
            <p className="text-[11px] text-gray-500 font-mono">Système de Consolidation Financière</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-bold px-3 py-1 text-xs rounded uppercase tracking-wider">
            Rapport Consolidé Propriétaire
          </span>
          <p className="text-[11px] font-mono text-red-700 font-bold mt-1">
            STRICTEMENT CONFIDENTIEL — DIRECTION
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Édité le : {formatDateTime(data.generatedAt || new Date())}
          </p>
        </div>
      </div>

      {/* Teacher and Period Metadata */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
        <div>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Enseignant</p>
          <p className="text-base font-bold text-gray-900">{data.teacher.name}</p>
          <p className="text-xs text-gray-600 font-mono mt-0.5">
            ID : {data.teacher.id} {data.teacher.phone ? `| Tél : ${data.teacher.phone}` : ''}
          </p>
          {data.id && (
            <p className="text-xs text-gray-500 mt-1">
              Fiche de paie réf : <span className="font-mono font-bold text-gray-800">#{data.id}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Période concernée</p>
          <p className="text-sm font-bold text-gray-900">
            Du {formatDate(data.periodStart)} au {formatDate(data.periodEnd)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Statut de la fiche : <span className="font-bold text-gray-800">{data.status || 'DRAFT'}</span>
          </p>
        </div>
      </div>

      {/* The 5 Columns Table */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
            Ventilation par Groupe (Rapport Consolidé Enseignant & École)
          </h2>
          <span className="text-xs text-gray-500 font-medium">
            {data.groups.length} groupe(s) dispensé(s)
          </span>
        </div>

        <table className="w-full border-collapse border border-gray-300 text-xs">
          <thead>
            <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px] tracking-wider">
              <th className="border border-gray-300 p-2 text-left">1. Enseignant</th>
              <th className="border border-gray-300 p-2 text-left">2. Groupe / Classe</th>
              <th className="border border-gray-300 p-2 text-center">3. Séances Payables</th>
              <th className="border border-gray-300 p-2 text-right">4. Part Enseignant</th>
              <th className="border border-gray-300 p-2 text-right">5. Part École</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500 italic">
                  Aucun groupe trouvé pour cette période.
                </td>
              </tr>
            ) : (
              data.groups.map((group, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="border border-gray-300 p-2 font-bold text-gray-900">
                    {group.teacherName || data.teacher.name}
                  </td>
                  <td className="border border-gray-300 p-2">
                    <span className="font-semibold text-gray-900">{group.groupName}</span>
                    {group.branchName && (
                      <span className="text-[10px] text-gray-500 block">({group.branchName})</span>
                    )}
                  </td>
                  <td className="border border-gray-300 p-2 text-center font-mono font-bold text-gray-800">
                    {group.payableLessons}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-mono font-bold text-rose-700">
                    {formatDZD(group.teacherCut)}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-mono font-bold text-emerald-700">
                    {formatDZD(group.schoolCut)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
              <td colSpan={2} className="border border-gray-300 p-2.5 text-gray-900 uppercase">
                Total Général Brut
              </td>
              <td className="border border-gray-300 p-2.5 text-center font-mono text-sm text-gray-900">
                {data.totalPayableLessons}
              </td>
              <td className="border border-gray-300 p-2.5 text-right font-mono text-sm text-rose-700">
                {formatDZD(data.totalTeacherCut)}
              </td>
              <td className="border border-gray-300 p-2.5 text-right font-mono text-sm text-emerald-700">
                {formatDZD(data.totalSchoolCut)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Financial Consolidation & Net Payout Summary (Strictly Owner) */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Teacher Payout Summary */}
        <div className="bg-rose-50/40 border border-rose-200 rounded-lg p-3 text-xs">
          <p className="font-bold text-rose-950 uppercase mb-2 pb-1 border-b border-rose-200">
            Masse Salariale Enseignant
          </p>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-600 font-sans">Part Brute des Cours :</span>
              <span className="font-bold text-gray-900">{formatDZD(data.totalTeacherCut)}</span>
            </div>
            {bonus > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold">
                <span className="font-sans">Prime / Bonus accordé :</span>
                <span>+ {formatDZD(bonus)}</span>
              </div>
            )}
            {bonus < 0 && (
              <div className="flex justify-between text-rose-700 font-bold">
                <span className="font-sans">Déduction / Retenue exceptionnelle :</span>
                <span>- {formatDZD(Math.abs(bonus))}</span>
              </div>
            )}
            {advances > 0 && (
              <div className="flex justify-between text-red-600">
                <span className="font-sans">Avances sur salaire déduites :</span>
                <span>- {formatDZD(advances)}</span>
              </div>
            )}
            {photocopy > 0 && (
              <div className="flex justify-between text-amber-700">
                <span className="font-sans">Frais de photocopie déduits :</span>
                <span>- {formatDZD(photocopy)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200 pt-1.5 text-sm font-black text-rose-800">
              <span className="font-sans">Net Réel à Décaisser :</span>
              <span>{formatDZD(netTeacher)}</span>
            </div>
          </div>
        </div>

        {/* School Share Summary */}
        <div className="bg-emerald-50/40 border border-emerald-200 rounded-lg p-3 text-xs">
          <p className="font-bold text-emerald-950 uppercase mb-2 pb-1 border-b border-emerald-200">
            Part École Consolidée
          </p>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-600 font-sans">Part Brute École :</span>
              <span className="font-bold text-gray-900">{formatDZD(data.totalSchoolCut)}</span>
            </div>
            {photocopy > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span className="font-sans">Photocopies récupérées :</span>
                <span>+ {formatDZD(photocopy)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-emerald-200 pt-1.5 text-sm font-black text-emerald-800">
              <span className="font-sans">Rendement Net École :</span>
              <span>{formatDZD(netSchool)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signature and Confidentiality Footer */}
      <div className="border-t border-gray-300 pt-4 flex justify-between items-end text-xs text-gray-600">
        <div>
          <p className="font-bold text-gray-800">Avis de Confidentialité :</p>
          <p className="text-[10px] text-gray-500 max-w-sm">
            Ce rapport consolidé détaille la marge de l&apos;établissement et les montants par groupe.
            Il est exclusivement destiné au propriétaire / à la direction générale et ne doit en aucun cas être remis à l&apos;enseignant.
          </p>
        </div>
        <div className="text-center min-w-[180px]">
          <p className="text-xs font-semibold mb-8 text-gray-700">Signature & Cachet de la Direction</p>
          <div className="border-b border-gray-400 w-36 mx-auto"></div>
        </div>
      </div>
    </div>
  );
}
