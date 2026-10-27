import React from 'react';
import Image from 'next/image';
import { formatAlgiersDate, formatDZD as formatDZDLib, ALGIERS_TIMEZONE } from "@/lib/algiersDate";

export interface MasterOwnerPayrollTeacherItem {
  teacherId: string;
  teacherName: string;
  phone?: string | null;
  payslipId?: number;
  periodStart: string | Date;
  periodEnd: string | Date;
  groups: Array<{
    teacherName: string;
    groupName: string;
    branchName?: string;
    payableLessons: number;
    teacherCut: number;
    schoolCut: number;
  }>;
  totalLessons: number;
  grossTeacherCut: number;
  advances: number;
  photocopyDeductions: number;
  netTeacherCut: number;
  totalSchoolCut: number;
}

export interface MasterOwnerPayrollPrintData {
  periodStart?: string | Date;
  periodEnd?: string | Date;
  generatedAt?: string | Date;
  teachersCount: number;
  totalLessons: number;
  totalTeacherGross: number;
  totalAdvances: number;
  totalPhotocopy: number;
  totalTeacherNet: number;
  totalSchoolGross: number;
  totalSchoolNet: number;
  teachers: MasterOwnerPayrollTeacherItem[];
}

interface MasterOwnerPayrollReportProps {
  data: MasterOwnerPayrollPrintData;
  locale?: string;
}

export function MasterOwnerPayrollReport({ data }: MasterOwnerPayrollReportProps) {
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

  return (
    <div style={containerStyle} className="master-owner-payroll-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <Image src="/massinissa-emblem.png" alt="École Massinissa" width={60} height={60} className="object-contain" unoptimized />
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">École Massinissa</h1>
            <p className="text-xs text-gray-600 font-semibold">Constantine - Algérie</p>
            <p className="text-[11px] text-gray-500 font-mono">Système Financier & Contrôle de Gestion</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-bold px-3 py-1 text-xs rounded uppercase tracking-wider">
            Rapport Financier Consolidé Global
          </span>
          <p className="text-[11px] font-mono text-red-700 font-bold mt-1">
            STRICTEMENT CONFIDENTIEL — PROPRIÉTAIRE
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Édité le : {formatDateTime(data.generatedAt || new Date())}
          </p>
        </div>
      </div>

      {/* Global Period & Overall Stats Banner */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3.5 rounded-lg border border-gray-200 mb-5 text-sm">
        <div>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Période du Rapport</p>
          <p className="text-sm font-bold text-gray-900">
            {data.periodStart && data.periodEnd
              ? `Du ${formatDate(data.periodStart)} au ${formatDate(data.periodEnd)}`
              : "Toutes périodes confondues"}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Nombre d'enseignants consolidés : <span className="font-bold text-gray-900 font-mono">{data.teachersCount}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Volume d'Enseignement</p>
          <p className="text-sm font-bold text-gray-900 font-mono">
            {data.totalLessons} séance(s) dispensée(s)
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            Total groupes cumulés : <span className="font-bold text-gray-900 font-mono">
              {data.teachers.reduce((sum, t) => sum + t.groups.length, 0)}
            </span>
          </p>
        </div>
      </div>

      {/* Master 5-Column Consolidated Table */}
      <div className="mb-6">
        <h2 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-2 pb-1 border-b border-gray-200">
          Détail par Enseignant et Groupe (5 Colonnes de Contrôle)
        </h2>

        <table className="w-full border-collapse border border-gray-300 text-[11px]">
          <thead>
            <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[9px] tracking-wider">
              <th className="border border-gray-300 p-2 text-left">1. Enseignant</th>
              <th className="border border-gray-300 p-2 text-left">2. Groupe / Classe</th>
              <th className="border border-gray-300 p-2 text-center">3. Séances Payables</th>
              <th className="border border-gray-300 p-2 text-right">4. Part Enseignant</th>
              <th className="border border-gray-300 p-2 text-right">5. Part École</th>
            </tr>
          </thead>
          <tbody>
            {data.teachers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500 italic">
                  Aucune fiche de paie générée trouvée pour cette période.
                </td>
              </tr>
            ) : (
              data.teachers.map((teacher, tIdx) => (
                <React.Fragment key={teacher.teacherId || tIdx}>
                  {/* Group rows for this teacher */}
                  {teacher.groups.length === 0 ? (
                    <tr className="bg-white">
                      <td className="border border-gray-300 p-2 font-bold text-gray-900">
                        {teacher.teacherName}
                      </td>
                      <td colSpan={4} className="border border-gray-300 p-2 text-gray-400 italic">
                        Aucun cours régulier (Salaire fixe ou retenues seules)
                      </td>
                    </tr>
                  ) : (
                    teacher.groups.map((group, gIdx) => (
                      <tr key={gIdx} className="hover:bg-gray-50/50">
                        <td className="border border-gray-300 p-1.5 font-bold text-gray-900">
                          {gIdx === 0 ? teacher.teacherName : ''}
                        </td>
                        <td className="border border-gray-300 p-1.5">
                          <span className="font-semibold text-gray-900">{group.groupName}</span>
                          {group.branchName && (
                            <span className="text-[9px] text-gray-500 ml-1">({group.branchName})</span>
                          )}
                        </td>
                        <td className="border border-gray-300 p-1.5 text-center font-mono font-bold text-gray-800">
                          {group.payableLessons}
                        </td>
                        <td className="border border-gray-300 p-1.5 text-right font-mono font-bold text-rose-700">
                          {formatDZD(group.teacherCut)}
                        </td>
                        <td className="border border-gray-300 p-1.5 text-right font-mono font-bold text-emerald-700">
                          {formatDZD(group.schoolCut)}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Teacher Subtotal Row */}
                  <tr className="bg-slate-50 font-bold border-b-2 border-gray-400 text-[10px]">
                    <td colSpan={2} className="border border-gray-300 p-1.5 text-gray-800">
                      Sous-total : <span className="text-gray-950 font-black">{teacher.teacherName}</span>
                      {(teacher.advances > 0 || teacher.photocopyDeductions > 0) && (
                        <span className="font-normal text-gray-500 ml-2">
                          [Avances: -{formatDZD(teacher.advances)} | Photocopies: -{formatDZD(teacher.photocopyDeductions)} | Net payé: {formatDZD(teacher.netTeacherCut)}]
                        </span>
                      )}
                    </td>
                    <td className="border border-gray-300 p-1.5 text-center font-mono text-gray-900">
                      {teacher.totalLessons}
                    </td>
                    <td className="border border-gray-300 p-1.5 text-right font-mono text-rose-800">
                      {formatDZD(teacher.grossTeacherCut)}
                    </td>
                    <td className="border border-gray-300 p-1.5 text-right font-mono text-emerald-800">
                      {formatDZD(teacher.totalSchoolCut)}
                    </td>
                  </tr>
                </React.Fragment>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-black text-xs border-t-2 border-gray-900">
              <td colSpan={2} className="border border-gray-300 p-2 text-gray-900 uppercase">
                TOTAL GÉNÉRAL CUMULÉ ({data.teachersCount} enseignants)
              </td>
              <td className="border border-gray-300 p-2 text-center font-mono text-gray-900">
                {data.totalLessons}
              </td>
              <td className="border border-gray-300 p-2 text-right font-mono text-rose-700">
                {formatDZD(data.totalTeacherGross)}
              </td>
              <td className="border border-gray-300 p-2 text-right font-mono text-emerald-700">
                {formatDZD(data.totalSchoolGross)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Master Financial Recap Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Payout Summary */}
        <div className="bg-rose-50/50 border border-rose-200 rounded-lg p-3 text-xs">
          <p className="font-bold text-rose-950 uppercase mb-2 pb-1 border-b border-rose-200">
            Synthèse Masse Salariale Enseignants
          </p>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-600 font-sans">Masse Salariale Brute :</span>
              <span className="font-bold text-gray-900">{formatDZD(data.totalTeacherGross)}</span>
            </div>
            {data.totalAdvances > 0 && (
              <div className="flex justify-between text-red-600">
                <span className="font-sans">Total Avances Déduites :</span>
                <span>- {formatDZD(data.totalAdvances)}</span>
              </div>
            )}
            {data.totalPhotocopy > 0 && (
              <div className="flex justify-between text-amber-700">
                <span className="font-sans">Total Photocopies Déduites :</span>
                <span>- {formatDZD(data.totalPhotocopy)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rose-200 pt-1.5 text-sm font-black text-rose-900">
              <span className="font-sans">Masse Salariale Nette Décaissée :</span>
              <span>{formatDZD(data.totalTeacherNet)}</span>
            </div>
          </div>
        </div>

        {/* School Financial Return Summary */}
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 text-xs">
          <p className="font-bold text-emerald-950 uppercase mb-2 pb-1 border-b border-emerald-200">
            Synthèse Rendement École
          </p>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-600 font-sans">Part Brute École :</span>
              <span className="font-bold text-gray-900">{formatDZD(data.totalSchoolGross)}</span>
            </div>
            {data.totalPhotocopy > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span className="font-sans">Photocopies Récupérées :</span>
                <span>+ {formatDZD(data.totalPhotocopy)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-emerald-200 pt-1.5 text-sm font-black text-emerald-900">
              <span className="font-sans">Part Nette Totale École :</span>
              <span>{formatDZD(data.totalSchoolNet)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signature and Confidentiality Footer */}
      <div className="border-t border-gray-300 pt-4 flex justify-between items-end text-xs text-gray-600">
        <div>
          <p className="font-bold text-gray-800">Avis de Confidentialité et Rapprochement :</p>
          <p className="text-[10px] text-gray-500 max-w-sm">
            Ce document récapitulatif regroupe l'ensemble des fiches de paie générées pour la période.
            Document strictement réservé au Propriétaire / Direction Générale.
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
