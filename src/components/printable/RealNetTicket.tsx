import React from 'react';
import Image from 'next/image';

export interface RealNetPrintData {
  payrollRunId?: number;
  periodStart: string | Date;
  periodEnd: string | Date;
  status?: string;
  totalRevenue: number;
  totalOutcomes: number;
  totalTeacherPayroll: number;
  totalStaffPayroll: number;
  realNet: number;
  revenueBreakdown?: Array<{
    branchId: number;
    branchName: string;
    amount: number;
  }>;
  outcomesByCategory?: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  outcomesBreakdown?: Array<{
    id: number;
    branchName: string;
    amount: number;
    category: string;
    description: string;
    date: string;
  }>;
  staffPayrollBreakdown?: Array<{
    id: number;
    staffName: string;
    roleTitle: string;
    branchName: string;
    amount: number;
    bonus: number;
    total: number;
  }>;
  branchBreakdown?: Array<{
    branchId: number;
    branchName: string;
    revenue: number;
    outcomes: number;
    teacherPayroll: number;
    staffPayroll: number;
    realNet: number;
  }>;
}

interface RealNetTicketProps {
  data: RealNetPrintData;
}

export function RealNetTicket({ data }: RealNetTicketProps) {
  // All financial printables are in French per school administration standard
  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '210mm',
    margin: '0 auto',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '12pt',
    color: '#111827',
    direction: 'ltr',
    backgroundColor: '#ffffff',
  };

  const formatDate = (d: string | Date) => {
    try {
      return new Date(d).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(d);
    }
  };

  const formatDZD = (num: number) => `${Number(num || 0).toLocaleString('fr-FR')} DZD`;

  const totalCharges = data.totalOutcomes + data.totalTeacherPayroll + data.totalStaffPayroll;
  const isProfitable = data.realNet >= 0;

  return (
    <div style={containerStyle} className="real-net-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="logo" width={60} height={60} className="object-contain" />
          <div>
            <h1 className="text-2xl font-black text-gray-900">École Massinissa</h1>
            <p className="text-xs text-gray-600 font-semibold">Siège principal : Constantine - Algérie</p>
            <p className="text-xs text-gray-500">Direction Financière — Bilan Net Réel d&apos;Exploitation</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-blue-950 text-white font-black px-3 py-1 text-sm rounded uppercase tracking-wider">
            Bilan Financier & Net Réel
          </span>
          <p className="text-xs font-mono mt-1 text-gray-600">
            {data.payrollRunId ? `Cycle de Paie : #${data.payrollRunId}` : "Rapport Périodique"}
          </p>
          <p className="text-xs text-gray-500">
            Statut : {data.status === 'PAID' ? 'Validé & Décaissé (PAID)' : data.status === 'VALIDATED' ? 'Validé (VALIDATED)' : 'Calculé (DRAFT)'}
          </p>
        </div>
      </div>

      {/* Period & Reference Information */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Période du Bilan :</p>
          <p className="text-base font-bold text-gray-900">
            Du {formatDate(data.periodStart)} au {formatDate(data.periodEnd)}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">Périmètre : Ensemble des succursales et activités</p>
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-xs">Date d&apos;émission :</p>
          <p className="font-semibold text-gray-800">{new Date().toLocaleDateString('fr-FR')}</p>
          <p className="text-xs text-gray-500 mt-0.5">Document comptable de clôture</p>
        </div>
      </div>

      {/* Main KPI Flow - Equation */}
      <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-300">
        <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
          Équation Fondamentale du Résultat Net Réel
        </h2>
        <div className="grid grid-cols-5 gap-2 text-center items-center">
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-[11px] text-emerald-800 font-bold block">1. Recettes Totales</span>
            <span className="text-xs font-black text-emerald-950 mt-1 block font-mono">{formatDZD(data.totalRevenue)}</span>
          </div>
          <span className="text-lg font-black text-gray-500">−</span>
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
            <span className="text-[11px] text-red-800 font-bold block">2. Dépenses (Outcomes)</span>
            <span className="text-xs font-black text-red-950 mt-1 block font-mono">{formatDZD(data.totalOutcomes)}</span>
          </div>
          <span className="text-lg font-black text-gray-500">−</span>
          <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-200">
            <span className="text-[11px] text-orange-800 font-bold block">3. Paie Enseignants</span>
            <span className="text-xs font-black text-orange-950 mt-1 block font-mono">{formatDZD(data.totalTeacherPayroll)}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center items-center mt-3 pt-3 border-t border-gray-200">
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-[11px] text-amber-800 font-bold block">4. Paie du Personnel (Staff)</span>
            <span className="text-xs font-black text-amber-950 mt-1 block font-mono">{formatDZD(data.totalStaffPayroll)}</span>
          </div>
          <span className="text-lg font-black text-gray-500">=</span>
          <div className={`p-3 rounded-xl border-2 text-center ${isProfitable ? 'bg-emerald-100/90 border-emerald-500' : 'bg-red-100 border-red-500'}`}>
            <span className="text-xs font-black uppercase tracking-wider block text-gray-900">RÉSULTAT NET RÉEL</span>
            <span className={`text-lg font-black mt-1 block font-mono ${isProfitable ? 'text-emerald-950' : 'text-red-950'}`}>
              {formatDZD(data.realNet)}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Synthèse Détaillée du Compte de Résultat</h2>
        <table className="w-full border-collapse text-xs text-left">
          <tbody>
            <tr className="border-b border-gray-200 bg-emerald-50/50">
              <td className="p-2.5 font-bold text-emerald-950">A. RECETTES TOTALES ENCAISSÉES (Tous sièges & services)</td>
              <td className="p-2.5 text-right font-mono font-black text-emerald-900 text-sm">{formatDZD(data.totalRevenue)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-red-50/40">
              <td className="p-2.5 pl-6 text-gray-700">
                • Dépenses d&apos;exploitation courantes (Outcomes journaliers : fournitures, loyer, maintenance...)
              </td>
              <td className="p-2.5 text-right font-mono font-bold text-red-700">- {formatDZD(data.totalOutcomes)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-orange-50/40">
              <td className="p-2.5 pl-6 text-gray-700">
                • Masse salariale des enseignants (Rémunération des cours dispensés)
              </td>
              <td className="p-2.5 text-right font-mono font-bold text-orange-800">- {formatDZD(data.totalTeacherPayroll)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-amber-50/40">
              <td className="p-2.5 pl-6 text-gray-700">
                • Masse salariale du personnel administratif et support (Staff)
              </td>
              <td className="p-2.5 text-right font-mono font-bold text-amber-800">- {formatDZD(data.totalStaffPayroll)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-gray-100 font-semibold">
              <td className="p-2.5 text-gray-900">B. TOTAL DES CHARGES ET SORTIES DE FONDS</td>
              <td className="p-2.5 text-right font-mono font-black text-gray-900 text-sm">- {formatDZD(totalCharges)}</td>
            </tr>
            <tr className={`border-t-2 font-black text-base ${isProfitable ? 'bg-emerald-100/90 border-emerald-600' : 'bg-red-100 border-red-600'}`}>
              <td className="p-3 text-gray-950">C. BÉNÉFICE NET RÉEL (A − B)</td>
              <td className={`p-3 text-right font-mono text-lg ${isProfitable ? 'text-emerald-950' : 'text-red-950'}`}>
                {formatDZD(data.realNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-Branch Breakdown Table */}
      {data.branchBreakdown && data.branchBreakdown.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Performance & Marge Nette par Succursale</h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-gray-100 border border-gray-300 text-gray-700">
                <th className="p-2 border border-gray-300 font-bold">Succursale</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-emerald-900">Recettes</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-red-800">Dépenses (Outcomes)</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-orange-800">Paie Profs</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-amber-800">Paie Staff</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-gray-900">Net Réel</th>
              </tr>
            </thead>
            <tbody>
              {data.branchBreakdown.map((b) => (
                <tr key={b.branchId} className="border border-gray-200">
                  <td className="p-2 border border-gray-200 font-bold text-gray-900">{b.branchName}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-emerald-800">{formatDZD(b.revenue)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-red-700">- {formatDZD(b.outcomes)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-orange-800">- {formatDZD(b.teacherPayroll)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-amber-800">- {formatDZD(b.staffPayroll)}</td>
                  <td className={`p-2 border border-gray-200 font-mono font-bold text-right ${b.realNet >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                    {formatDZD(b.realNet)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold border border-gray-300">
                <td className="p-2 border border-gray-300">Total Établissement</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-emerald-900">{formatDZD(data.totalRevenue)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-red-800">- {formatDZD(data.totalOutcomes)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-orange-800">- {formatDZD(data.totalTeacherPayroll)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-amber-800">- {formatDZD(data.totalStaffPayroll)}</td>
                <td className={`p-2 border border-gray-300 font-mono font-black text-right ${isProfitable ? 'text-emerald-950' : 'text-red-950'}`}>
                  {formatDZD(data.realNet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Outcomes Categorization Summary */}
      {data.outcomesByCategory && data.outcomesByCategory.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Ventilation des Dépenses d&apos;Exploitation par Catégorie</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {data.outcomesByCategory.map((c, i) => (
              <div key={i} className="p-2 rounded bg-gray-50 border border-gray-200 flex justify-between items-center text-xs">
                <span className="font-medium text-gray-700 truncate">{c.category} ({c.count})</span>
                <span className="font-mono font-bold text-red-700">{formatDZD(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signature & Validation Box */}
      <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-300 text-xs">
        <div className="border border-gray-200 rounded p-4 h-24 flex flex-col justify-between">
          <p className="font-semibold text-gray-700">Comptabilité / Contrôle de Gestion :</p>
          <p className="text-gray-400 italic">Signature & Date</p>
        </div>
        <div className="border border-gray-200 rounded p-4 h-24 flex flex-col justify-between text-right">
          <p className="font-semibold text-gray-700">Direction Générale / Propriétaire :</p>
          <p className="text-gray-400 italic">Visa, Cachet & Approbation</p>
        </div>
      </div>
    </div>
  );
}
