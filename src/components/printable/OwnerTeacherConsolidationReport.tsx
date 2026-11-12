import React from 'react';
import { MASSINISSA_LOGO_BASE64 } from "@/lib/receiptAssets";
import { formatAlgiersDate, formatUtcPeriodDate, formatDZD as formatDZDLib, ALGIERS_TIMEZONE } from "@/lib/algiersDate";

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
  // Selective reporting properties
  includeRegularLessons?: boolean;
  includeFormationCourses?: boolean;
  includeBooks?: boolean;
  formationGroups?: OwnerConsolidatedGroupLine[];
  totalFormationLessons?: number;
  totalFormationTeacherCut?: number;
  totalFormationSchoolCut?: number;
  books?: Array<{
    title: string;
    levelName?: string;
    copiesSold: number;
    totalRevenue: number;
  }>;
  totalBooksCopies?: number;
  totalBooksFees?: number;
  bonus?: number;
  salaryAdvances?: number;
  salaryAdvanceDetails?: Array<{
    amount: number;
    date: string | Date;
    remarque?: string | null;
  }>;
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

  const formatPeriodDate = (d: string | Date) => {
    try {
      return formatUtcPeriodDate(d, 'fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) || String(d);
    } catch {
      return String(d);
    }
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

  const includeRegular = data.includeRegularLessons !== false;
  const includeFormation = !!data.includeFormationCourses;
  const includeBooks = !!data.includeBooks;

  const regularTeacherCut = includeRegular ? data.totalTeacherCut : 0;
  const regularSchoolCut = includeRegular ? data.totalSchoolCut : 0;

  const formationTeacherCut = includeFormation ? (data.totalFormationTeacherCut || 0) : 0;
  const formationSchoolCut = includeFormation ? (data.totalFormationSchoolCut || 0) : 0;

  const booksTotalCut = includeBooks ? (data.totalBooksFees || 0) : 0;
  const totalGrossPayout = regularTeacherCut + formationTeacherCut + booksTotalCut;

  const netTeacher = data.netTeacherPayout !== undefined
    ? data.netTeacherPayout
    : Math.max(0, totalGrossPayout + bonus - advances - photocopy);

  const netSchool = data.netSchoolRevenue !== undefined
    ? data.netSchoolRevenue
    : regularSchoolCut + formationSchoolCut + photocopy;

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
            Du {formatPeriodDate(data.periodStart)} au {formatPeriodDate(data.periodEnd)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Statut de la fiche : <span className="font-bold text-gray-800">{data.status || 'DRAFT'}</span>
          </p>
        </div>
      </div>

      {/* 1. Regular Lessons Table (if included) */}
      {includeRegular && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              1. Ventilation Cours Réguliers (Rapport Consolidé Enseignant & École)
            </h2>
            <span className="text-xs text-gray-500 font-medium">
              {data.groups.length} groupe(s) dispensé(s)
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px] tracking-wider">
                <th className="border border-gray-300 p-2 text-left">Enseignant</th>
                <th className="border border-gray-300 p-2 text-left">Groupe / Classe</th>
                <th className="border border-gray-300 p-2 text-center">Séances Payables</th>
                <th className="border border-gray-300 p-2 text-right">Part Enseignant</th>
                <th className="border border-gray-300 p-2 text-right">Part École</th>
              </tr>
            </thead>
            <tbody>
              {data.groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500 italic">
                    Aucun cours régulier pour cette période.
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
                  Sous-total Cours Réguliers
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
      )}

      {/* 2. Formation Lessons Table (if included) */}
      {includeFormation && data.formationGroups && data.formationGroups.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              2. Ventilation Formations & Dawarat
            </h2>
            <span className="text-xs text-gray-500 font-medium">
              {data.formationGroups.length} groupe(s) de formation
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-rose-50 text-rose-900 uppercase font-bold text-[10px] tracking-wider border border-rose-300">
                <th className="border border-rose-300 p-2 text-left">Enseignant</th>
                <th className="border border-rose-300 p-2 text-left">Groupe Formation / Atelier</th>
                <th className="border border-rose-300 p-2 text-center">Séances Payables</th>
                <th className="border border-rose-300 p-2 text-right">Part Enseignant</th>
                <th className="border border-rose-300 p-2 text-right">Part École</th>
              </tr>
            </thead>
            <tbody>
              {data.formationGroups.map((group, idx) => (
                <tr key={idx} className="hover:bg-rose-50/30">
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
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-rose-100/70 font-bold border-t-2 border-rose-300">
                <td colSpan={2} className="border border-gray-300 p-2.5 text-gray-900 uppercase">
                  Sous-total Formations & Dawarat
                </td>
                <td className="border border-gray-300 p-2.5 text-center font-mono text-sm text-gray-900">
                  {data.totalFormationLessons || 0}
                </td>
                <td className="border border-gray-300 p-2.5 text-right font-mono text-sm text-rose-700">
                  {formatDZD(data.totalFormationTeacherCut || 0)}
                </td>
                <td className="border border-gray-300 p-2.5 text-right font-mono text-sm text-emerald-700">
                  {formatDZD(data.totalFormationSchoolCut || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 3. Books Section (if included) */}
      {includeBooks && data.books && data.books.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
              3. Ventes & Frais de Livres / Manuels
            </h2>
            <span className="text-xs text-gray-500 font-medium">
              {data.books.length} manuel(s)
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-indigo-50 text-indigo-950 uppercase font-bold text-[10px] tracking-wider border border-indigo-200">
                <th className="border border-indigo-200 p-2 text-left">Titre du Manuel</th>
                <th className="border border-indigo-200 p-2 text-left">Niveau / Section</th>
                <th className="border border-indigo-200 p-2 text-center">Exemplaires Vendus</th>
                <th className="border border-indigo-200 p-2 text-right">Montant Total</th>
              </tr>
            </thead>
            <tbody>
              {data.books.map((b, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/20">
                  <td className="border border-gray-300 p-2 font-bold text-gray-900">{b.title}</td>
                  <td className="border border-gray-300 p-2 text-gray-700">{b.levelName || "Général"}</td>
                  <td className="border border-gray-300 p-2 text-center font-mono font-bold text-gray-800">
                    {b.copiesSold}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-mono font-bold text-indigo-700">
                    {formatDZD(b.totalRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-100/70 font-bold border-t-2 border-indigo-300">
                <td colSpan={2} className="border border-gray-300 p-2.5 text-gray-900 uppercase">
                  Sous-total Manuels & Livres
                </td>
                <td className="border border-gray-300 p-2.5 text-center font-mono text-sm text-gray-900">
                  {data.totalBooksCopies || data.books.reduce((s, b) => s + b.copiesSold, 0)}
                </td>
                <td className="border border-gray-300 p-2.5 text-right font-mono text-sm text-indigo-700">
                  {formatDZD(data.totalBooksFees || data.books.reduce((s, b) => s + b.totalRevenue, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Salary Advances Breakdown with Remarque */}
      {data.salaryAdvanceDetails && data.salaryAdvanceDetails.length > 0 && (
        <div className="mb-6">
          <p className="font-bold text-gray-800 text-xs uppercase mb-1.5 pb-1 border-b border-gray-200">
            Détail des avances sur salaire déduites :
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-red-50 text-red-950 font-bold border border-red-200">
                <th className="p-1.5 border border-red-200 text-center w-28">Date</th>
                <th className="p-1.5 border border-red-200 text-left">Remarque / Motif</th>
                <th className="p-1.5 border border-red-200 text-right w-36">Montant déduit</th>
              </tr>
            </thead>
            <tbody>
              {data.salaryAdvanceDetails.map((adv, idx) => (
                <tr key={idx} className="border border-gray-200">
                  <td className="p-1.5 border border-gray-200 text-center font-mono">{formatDate(adv.date)}</td>
                  <td className="p-1.5 border border-gray-200 text-gray-800">
                    {adv.remarque ? (
                      <span className="font-medium text-gray-900">{adv.remarque}</span>
                    ) : (
                      <span className="text-gray-400 italic">Avance sur salaire</span>
                    )}
                  </td>
                  <td className="p-1.5 border border-gray-200 text-right font-mono text-red-700 font-bold">
                    - {formatDZD(adv.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-red-100 font-bold text-red-950">
                <td colSpan={2} className="p-1.5 border border-red-200">
                  Total des avances sur salaire
                </td>
                <td className="p-1.5 border border-red-200 text-right font-mono font-black text-red-700">
                  - {formatDZD(advances)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Financial Consolidation & Net Payout Summary (Strictly Owner) */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Teacher Payout Summary */}
        <div className="bg-rose-50/40 border border-rose-200 rounded-lg p-3 text-xs">
          <p className="font-bold text-rose-950 uppercase mb-2 pb-1 border-b border-rose-200">
            Masse Salariale Enseignant (Sélectionnée)
          </p>
          <div className="space-y-1.5 font-mono">
            {includeRegular && (
              <div className="flex justify-between">
                <span className="text-gray-600 font-sans">Part Cours Réguliers :</span>
                <span className="font-bold text-gray-900">{formatDZD(regularTeacherCut)}</span>
              </div>
            )}
            {includeFormation && (
              <div className="flex justify-between text-rose-800 font-semibold">
                <span className="font-sans">Part Formations & Dawarat :</span>
                <span>{formatDZD(formationTeacherCut)}</span>
              </div>
            )}
            {includeBooks && (
              <div className="flex justify-between text-indigo-800 font-semibold">
                <span className="font-sans">Part Frais de Livres :</span>
                <span>{formatDZD(booksTotalCut)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200/60 pt-1 font-bold text-gray-950">
              <span className="font-sans">Total Brut Enseignant :</span>
              <span>{formatDZD(totalGrossPayout)}</span>
            </div>
            {bonus > 0 && (
              <div className="flex justify-between text-emerald-700 font-bold">
                <span className="font-sans">Prime / Bonus accordé :</span>
                <span>+ {formatDZD(bonus)}</span>
              </div>
            )}
            {bonus < 0 && (
              <div className="flex justify-between text-rose-700 font-bold">
                <span className="font-sans">Déduction / Retenue :</span>
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
            <div className="flex justify-between border-t border-rose-300 pt-1.5 text-sm font-black text-rose-800">
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
            {includeRegular && (
              <div className="flex justify-between">
                <span className="text-gray-600 font-sans">Part Cours Réguliers École :</span>
                <span className="font-bold text-gray-900">{formatDZD(regularSchoolCut)}</span>
              </div>
            )}
            {includeFormation && (
              <div className="flex justify-between text-emerald-800 font-semibold">
                <span className="font-sans">Part Formations École :</span>
                <span>{formatDZD(formationSchoolCut)}</span>
              </div>
            )}
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
