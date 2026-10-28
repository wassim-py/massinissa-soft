import React from 'react';
import { MASSINISSA_LOGO_BASE64 } from "@/lib/receiptAssets";
import { formatAlgiersDate, formatDZD as formatDZDLib, ALGIERS_TIMEZONE } from "@/lib/algiersDate";

export interface SchoolShareSessionItem {
  lessonId: number;
  startsAt: string | Date;
  className: string;
  branchName: string;
  presentCount: number;
  payingCount?: number;
  sessionPrice?: number;
  teacherCut?: number;
  schoolCut?: number;
  lessonAmount: number;
  lessonTuition?: number;
  isFree: boolean;
  isExtra?: boolean;
  isCatchUp?: boolean;
  isTeacherAbsent?: boolean;
}

export interface SchoolSharePrintData {
  id?: number;
  payrollRunId?: number;
  periodStart: string | Date;
  periodEnd: string | Date;
  status?: string;
  teacher?: {
    id: string;
    name: string;
    phone?: string | null;
  };
  sessionsCount: number;
  totalTuitionGross: number;
  teacherGross: number;
  schoolGross: number;
  photocopyRecovered: number;
  schoolNet: number;
  branchLines: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    tuitionAmount?: number;
    teacherAmount?: number;
    schoolAmount: number;
  }>;
  sessions?: SchoolShareSessionItem[];
  teacherSummaryList?: Array<{
    teacherId: string;
    teacherName: string;
    sessionsCount: number;
    totalTuitionGross: number;
    teacherCut: number;
    schoolCut: number;
    photocopyRecovered: number;
    netSchoolCut: number;
  }>;
}

interface SchoolShareTicketProps {
  data: SchoolSharePrintData;
  locale?: string;
}

export function SchoolShareTicket({ data }: SchoolShareTicketProps) {
  // All payroll printables are strictly in French per owner business rules
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
        hour: '2-digit',
        minute: '2-digit',
      }).format(dateObj);
    } catch {
      return String(d);
    }
  };

  const formatDZD = (num: number) => formatDZDLib(num, 'fr');

  const isIndividualTeacher = Boolean(data.teacher);
  const allSessions = data.sessions || [];

  return (
    <div style={containerStyle} className="school-share-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <img
            src={MASSINISSA_LOGO_BASE64}
            alt="Massinissa School"
            style={{ width: '64px', height: '64px', objectFit: 'contain' }}
          />
          <div>
            <h1 className="text-2xl font-black text-gray-900">Massinissa School</h1>
            <p className="text-xs text-gray-600 font-semibold">Siège principal : Constantine - Algérie</p>
            <p className="text-xs text-gray-500">Système de gestion et ventilation des recettes scolaires</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-emerald-800 text-white font-bold px-3 py-1 text-sm rounded">
            {isIndividualTeacher ? "Fiche Part École (Enseignant)" : "Bordereau Récapitulatif Part École"}
          </span>
          <p className="text-xs font-mono mt-1 text-gray-600">
            {data.id ? `N° Fiche : #P-EC-${data.id}` : data.payrollRunId ? `Cycle : #${data.payrollRunId}` : "Rapport Périodique"}
          </p>
          <p className="text-xs text-gray-500">
            Statut : {data.status === 'PAID' ? 'Validé & Décaissé (PAID)' : data.status === 'VALIDATED' ? 'Validé (VALIDATED)' : 'Brouillon (DRAFT)'}
          </p>
        </div>
      </div>

      {/* Target & Period Information */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
        <div>
          {isIndividualTeacher && data.teacher ? (
            <>
              <p className="text-gray-500 text-xs">Enseignant concerné :</p>
              <p className="text-lg font-bold text-gray-900">{data.teacher.name}</p>
              <p className="text-xs text-gray-600">ID : <span className="font-mono">{data.teacher.id}</span></p>
              {data.teacher.phone && <p className="text-xs text-gray-600">Tél : {data.teacher.phone}</p>}
            </>
          ) : (
            <>
              <p className="text-gray-500 text-xs">Objet du document :</p>
              <p className="text-base font-bold text-gray-900">Recettes et Part de l&apos;École sur l&apos;ensemble des Enseignants</p>
              <p className="text-xs text-gray-600">Tous les sièges & formations</p>
            </>
          )}
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-xs">Période comptable :</p>
          <p className="font-bold text-gray-800">
            Du {formatDate(data.periodStart)} au {formatDate(data.periodEnd)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Date d&apos;impression : {formatAlgiersDate(new Date(), 'fr-FR')}
          </p>
        </div>
      </div>

      {/* Key Financial Totals Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
          <span className="text-xs text-gray-500 font-medium block">Total Séances</span>
          <span className="text-xl font-black text-gray-900 mt-1 block">{data.sessionsCount}</span>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
          <span className="text-xs text-gray-500 font-medium block">Recettes des Cours (Tuition)</span>
          <span className="text-xl font-black text-gray-900 mt-1 block font-mono">{formatDZD(data.totalTuitionGross)}</span>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg border border-orange-200 text-center">
          <span className="text-xs text-orange-800 font-medium block">Part Enseignant(s)</span>
          <span className="text-xl font-black text-orange-900 mt-1 block font-mono">{formatDZD(data.teacherGross)}</span>
        </div>
        <div className="bg-emerald-50 p-3 rounded-lg border-2 border-emerald-400 text-center">
          <span className="text-xs text-emerald-800 font-bold block">Net Part École</span>
          <span className="text-xl font-black text-emerald-900 mt-1 block font-mono">{formatDZD(data.schoolNet)}</span>
        </div>
      </div>

      {/* Financial Breakdown Table */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Décomposition Financière de la Part École</h2>
        <table className="w-full border-collapse text-xs text-left">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="p-2.5 text-gray-700 font-medium">Recettes brutes totales des séances (Inscriptions aux cours)</td>
              <td className="p-2.5 text-right font-mono font-bold text-gray-900">{formatDZD(data.totalTuitionGross)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-orange-50/40">
              <td className="p-2.5 text-orange-900 font-medium">Moins : Rémunération des enseignants (Part enseignant)</td>
              <td className="p-2.5 text-right font-mono font-bold text-orange-800">- {formatDZD(data.teacherGross)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-blue-50/40">
              <td className="p-2.5 text-blue-900 font-bold">= Part brute de l&apos;école sur les cours</td>
              <td className="p-2.5 text-right font-mono font-bold text-blue-900">{formatDZD(data.schoolGross)}</td>
            </tr>
            <tr className="border-b border-gray-200 bg-emerald-50/30">
              <td className="p-2.5 text-emerald-900 font-medium">Plus : Frais de photocopies récupérés des enseignants</td>
              <td className="p-2.5 text-right font-mono font-bold text-emerald-700">+ {formatDZD(data.photocopyRecovered)}</td>
            </tr>
            <tr className="bg-emerald-100/70 border-t-2 border-emerald-600 font-bold text-sm">
              <td className="p-3 text-emerald-950 font-black">NET REVENANT À L&apos;ÉCOLE</td>
              <td className="p-3 text-right font-mono font-black text-emerald-900 text-base">{formatDZD(data.schoolNet)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-Branch Breakdown */}
      {data.branchLines && data.branchLines.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Ventilation par Succursale / Siège</h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-gray-100 border border-gray-300 text-gray-700">
                <th className="p-2 border border-gray-300 font-bold">Succursale</th>
                <th className="p-2 border border-gray-300 font-bold text-center">Séances</th>
                <th className="p-2 border border-gray-300 font-bold text-right">Recettes Cours</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-orange-800">Part Enseignant</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-emerald-800">Part École</th>
              </tr>
            </thead>
            <tbody>
              {data.branchLines.map((line) => (
                <tr key={line.branchId} className="border border-gray-200">
                  <td className="p-2 border border-gray-200 font-semibold">{line.branchName}</td>
                  <td className="p-2 border border-gray-200 text-center font-mono">{line.sessionsCount}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right">{formatDZD(line.tuitionAmount || 0)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-orange-800">{formatDZD(line.teacherAmount || 0)}</td>
                  <td className="p-2 border border-gray-200 font-mono font-bold text-right text-emerald-800">{formatDZD(line.schoolAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold border border-gray-300">
                <td className="p-2 border border-gray-300">Total</td>
                <td className="p-2 border border-gray-300 text-center font-mono">{data.sessionsCount}</td>
                <td className="p-2 border border-gray-300 font-mono text-right">{formatDZD(data.totalTuitionGross)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-orange-800">{formatDZD(data.teacherGross)}</td>
                <td className="p-2 border border-gray-300 font-mono font-black text-right text-emerald-900">{formatDZD(data.schoolGross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Teacher Summary List (if consolidated view) */}
      {!isIndividualTeacher && data.teacherSummaryList && data.teacherSummaryList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Détail par Enseignant</h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-gray-100 border border-gray-300 text-gray-700">
                <th className="p-2 border border-gray-300 font-bold">Enseignant</th>
                <th className="p-2 border border-gray-300 font-bold text-center">Séances</th>
                <th className="p-2 border border-gray-300 font-bold text-right">Recettes Cours</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-orange-800">Part Enseignant</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-blue-900">Part École</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-purple-900">Copies</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-emerald-900">Net École</th>
              </tr>
            </thead>
            <tbody>
              {data.teacherSummaryList.map((tItem) => (
                <tr key={tItem.teacherId} className="border border-gray-200">
                  <td className="p-2 border border-gray-200 font-bold text-gray-900">{tItem.teacherName}</td>
                  <td className="p-2 border border-gray-200 text-center font-mono">{tItem.sessionsCount}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right">{formatDZD(tItem.totalTuitionGross)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-orange-800">{formatDZD(tItem.teacherCut)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-blue-900">{formatDZD(tItem.schoolCut)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-purple-900">+{formatDZD(tItem.photocopyRecovered)}</td>
                  <td className="p-2 border border-gray-200 font-mono font-bold text-right text-emerald-900">{formatDZD(tItem.netSchoolCut)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold border border-gray-300">
                <td className="p-2 border border-gray-300">Total Général</td>
                <td className="p-2 border border-gray-300 text-center font-mono">{data.sessionsCount}</td>
                <td className="p-2 border border-gray-300 font-mono text-right">{formatDZD(data.totalTuitionGross)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-orange-800">{formatDZD(data.teacherGross)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-blue-900">{formatDZD(data.schoolGross)}</td>
                <td className="p-2 border border-gray-300 font-mono text-right text-purple-900">+{formatDZD(data.photocopyRecovered)}</td>
                <td className="p-2 border border-gray-300 font-mono font-black text-right text-emerald-900">{formatDZD(data.schoolNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Individual Session Breakdown (if individual teacher view) */}
      {isIndividualTeacher && allSessions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Détail des Séances Dispensées</h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-gray-100 border border-gray-300 text-gray-700">
                <th className="p-2 border border-gray-300 font-bold">Date & Heure</th>
                <th className="p-2 border border-gray-300 font-bold">Groupe / Classe</th>
                <th className="p-2 border border-gray-300 font-bold">Siège</th>
                <th className="p-2 border border-gray-300 font-bold text-center">Élèves Payants</th>
                <th className="p-2 border border-gray-300 font-bold text-right">Tarif Séance</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-orange-800">Part Prof</th>
                <th className="p-2 border border-gray-300 font-bold text-right text-emerald-800">Part École</th>
              </tr>
            </thead>
            <tbody>
              {allSessions.map((s) => (
                <tr key={s.lessonId} className={`border border-gray-200 ${s.isTeacherAbsent ? 'bg-red-50/50' : s.isFree ? 'bg-orange-50/40' : ''}`}>
                  <td className="p-2 border border-gray-200 font-mono">{formatDateTime(s.startsAt)}</td>
                  <td className="p-2 border border-gray-200 font-semibold">{s.className}</td>
                  <td className="p-2 border border-gray-200">{s.branchName}</td>
                  <td className="p-2 border border-gray-200 text-center font-mono">
                    {s.isTeacherAbsent ? "Absent" : `${s.payingCount ?? s.presentCount ?? 0} élève(s)`}
                  </td>
                  <td className="p-2 border border-gray-200 font-mono text-right">{formatDZD(s.sessionPrice || 0)}</td>
                  <td className="p-2 border border-gray-200 font-mono text-right text-orange-800">{formatDZD(s.lessonAmount)}</td>
                  <td className="p-2 border border-gray-200 font-mono font-bold text-right text-emerald-800">{formatDZD(s.schoolCut || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signature & Validation Box */}
      <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-300 text-xs">
        <div className="border border-gray-200 rounded p-4 h-24 flex flex-col justify-between">
          <p className="font-semibold text-gray-700">Responsable Pédagogique / Succursale :</p>
          <p className="text-gray-400 italic">Signature & Date</p>
        </div>
        <div className="border border-gray-200 rounded p-4 h-24 flex flex-col justify-between text-right">
          <p className="font-semibold text-gray-700">Direction Générale / Administration :</p>
          <p className="text-gray-400 italic">Cachet & Signature</p>
        </div>
      </div>
    </div>
  );
}
