import React from 'react';
import Image from 'next/image';

export interface PayslipSessionItem {
  lessonId: number;
  startsAt: string | Date;
  className: string;
  branchName: string;
  presentCount: number;
  payingCount?: number;
  sessionPrice?: number;
  teacherCut?: number;
  lessonAmount: number;
  isFree: boolean;
  isExtra?: boolean;
  isCatchUp?: boolean;
  isTeacherAbsent?: boolean;
}

export interface PayslipPrintData {
  id: number;
  periodStart: string | Date;
  periodEnd: string | Date;
  status: string;
  teacher: {
    id: string;
    name: string;
    phone?: string | null;
  };
  sessionsCount: number;
  freeSessionsCount?: number;
  teacherAbsencesCount?: number;
  grossAmount: number;
  bookRevenue?: number;
  bookRevenueDetails?: Array<{
    voucherId: number;
    bookTitle?: string;
    studentName?: string;
    amount: number;
    date: string | Date;
    branchName?: string;
  }>;
  advances: number;
  photocopyDeductions: number;
  netAmount: number;
  branchLines: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    freeSessionsCount?: number;
    amount: number;
  }>;
  sessions?: PayslipSessionItem[];
  photocopyDetails?: Array<{
    branchName: string;
    pages: number;
    costAmount: number;
    date: string | Date;
  }>;
}

interface PayslipTicketProps {
  data: PayslipPrintData;
  locale?: string;
}

export function PayslipTicket({ data }: PayslipTicketProps) {
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
      return new Date(d).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(d);
    }
  };

  const formatDateTime = (d: string | Date) => {
    try {
      const dateObj = new Date(d);
      return `${dateObj.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })} ${dateObj.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return String(d);
    }
  };

  const formatDZD = (num: number) => `${Number(num).toLocaleString('fr-FR')} DZD`;

  const allSessions = data.sessions || [];
  const absentLessons = allSessions.filter((s) => s.isTeacherAbsent);
  const freeLessons = allSessions.filter((s) => s.isFree && !s.isTeacherAbsent);
  const paidLessons = allSessions.filter((s) => !s.isFree && !s.isTeacherAbsent);
  const totalFreeSessions = data.freeSessionsCount ?? freeLessons.length;
  const totalPaidSessions = Math.max(0, data.sessionsCount - totalFreeSessions);

  return (
    <div style={containerStyle} className="payslip-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="logo" width={60} height={60} className="object-contain" />
          <div>
            <h1 className="text-2xl font-black text-gray-900">École Massinissa</h1>
            <p className="text-xs text-gray-600 font-semibold">Siège principal : Constantine - Algérie</p>
            <p className="text-xs text-gray-500">Système de paie consolidée et gestion multi-branches</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-blue-900 text-white font-bold px-3 py-1 text-sm rounded">
            Bulletin de Paie Consolidé
          </span>
          <p className="text-xs font-mono mt-1 text-gray-600">N° Bulletin : #{data.id}</p>
          <p className="text-xs text-gray-500">
            Statut : {data.status === 'PAID' ? 'Payé (PAID)' : data.status === 'VALIDATED' ? 'Validé (VALIDATED)' : 'Brouillon (DRAFT)'}
          </p>
        </div>
      </div>

      {/* Teacher & Period Information */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Informations Enseignant(e) :</p>
          <p className="text-lg font-bold text-gray-900">{data.teacher.name}</p>
          <p className="text-xs text-gray-600">ID : <span className="font-mono">{data.teacher.id}</span></p>
          {data.teacher.phone && <p className="text-xs text-gray-600">Tél : {data.teacher.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-xs">Période comptable :</p>
          <p className="font-bold text-gray-800">
            Du {formatDate(data.periodStart)} au {formatDate(data.periodEnd)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Date d&apos;impression : {new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
      </div>

      {/* Section 1: Per-Branch Breakdown */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1">
            <span>Synthèse des séances par succursale</span>
            <span className="text-xs font-normal text-gray-500">(Transparence - paiement unique)</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Total séances : {data.sessionsCount}
            </span>
            {totalFreeSessions > 0 && (
              <span className="text-xs text-orange-800 font-bold bg-orange-100 px-2 py-0.5 rounded border border-orange-300">
                Dont {totalFreeSessions} séance{totalFreeSessions > 1 ? 's' : ''} gratuite{totalFreeSessions > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-gray-100 border border-gray-300 text-gray-700">
              <th className="p-2 border border-gray-300 font-bold">Branche</th>
              <th className="p-2 border border-gray-300 font-bold text-center">Séances rémunérées</th>
              <th className="p-2 border border-gray-300 font-bold text-center text-orange-900 bg-orange-50/70">Séances gratuites</th>
              <th className="p-2 border border-gray-300 font-bold text-center">Total séances</th>
              <th className="p-2 border border-gray-300 font-bold text-right">Montant calculé</th>
            </tr>
          </thead>
          <tbody>
            {data.branchLines && data.branchLines.length > 0 ? (
              data.branchLines.map((line) => {
                const branchFree = line.freeSessionsCount ?? 0;
                const branchPaid = Math.max(0, line.sessionsCount - branchFree);
                return (
                  <tr key={line.branchId} className="border border-gray-200">
                    <td className="p-2 border border-gray-200 font-semibold">{line.branchName}</td>
                    <td className="p-2 border border-gray-200 text-center font-mono">{branchPaid}</td>
                    <td className="p-2 border border-gray-200 text-center font-mono bg-orange-50/30">
                      {branchFree > 0 ? (
                        <span className="inline-block bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded text-[11px] border border-orange-200">
                          {branchFree}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-mono font-bold">{line.sessionsCount}</td>
                    <td className="p-2 border border-gray-200 font-mono font-bold text-right">
                      {formatDZD(Number(line.amount))}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="p-3 text-center text-gray-500 border border-gray-200">
                  Aucune séance enregistrée
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold border border-gray-300">
              <td className="p-2 border border-gray-300">Total général</td>
              <td className="p-2 border border-gray-300 text-center font-mono">{totalPaidSessions}</td>
              <td className="p-2 border border-gray-300 text-center font-mono text-orange-900 bg-orange-50/70 font-black">
                {totalFreeSessions}
              </td>
              <td className="p-2 border border-gray-300 text-center font-mono">{data.sessionsCount}</td>
              <td className="p-2 border border-gray-300 font-mono text-blue-900 text-right">
                {formatDZD(Number(data.grossAmount))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Section 2: Detailed Paid Lessons Breakdown */}
      {paidLessons.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <span>Détail des séances d&apos;enseignement rémunérées</span>
            </h2>
            <span className="text-xs text-gray-600 font-semibold bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
              {paidLessons.length} séance{paidLessons.length > 1 ? 's' : ''} payante{paidLessons.length > 1 ? 's' : ''}
            </span>
          </div>

          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-gray-100 border border-gray-300 text-gray-700">
                <th className="p-2 border border-gray-300 font-bold">Date & Heure</th>
                <th className="p-2 border border-gray-300 font-bold">Classe / Groupe</th>
                <th className="p-2 border border-gray-300 font-bold">Branche</th>
                <th className="p-2 border border-gray-300 font-bold text-center">Type</th>
                <th className="p-2 border border-gray-300 font-bold text-center">Présents</th>
                <th className="p-2 border border-gray-300 font-bold text-right">Part ens.</th>
                <th className="p-2 border border-gray-300 font-bold text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {paidLessons.map((l, idx) => (
                <tr key={l.lessonId || idx} className="border border-gray-200 hover:bg-gray-50/50">
                  <td className="p-1.5 border border-gray-200 font-mono text-[11px] text-gray-800">
                    {formatDateTime(l.startsAt)}
                  </td>
                  <td className="p-1.5 border border-gray-200 font-semibold text-gray-900">{l.className}</td>
                  <td className="p-1.5 border border-gray-200 text-gray-600">{l.branchName}</td>
                  <td className="p-1.5 border border-gray-200 text-center">
                    {l.isExtra ? (
                      <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-1.5 py-0.5 rounded">Supplémentaire</span>
                    ) : l.isCatchUp ? (
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded">Rattrapage</span>
                    ) : (
                      <span className="bg-blue-50 text-blue-800 text-[10px] font-medium px-1.5 py-0.5 rounded">Normale</span>
                    )}
                  </td>
                  <td className="p-1.5 border border-gray-200 text-center font-mono font-bold text-blue-900">
                    {l.presentCount}
                  </td>
                  <td className="p-1.5 border border-gray-200 text-right font-mono text-gray-600">
                    {formatDZD(Number(l.teacherCut || 0))}
                  </td>
                  <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-emerald-800">
                    {formatDZD(Number(l.lessonAmount || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold border border-gray-300">
                <td colSpan={4} className="p-2 border border-gray-300">Total séances payantes</td>
                <td className="p-2 border border-gray-300 text-center font-mono">{paidLessons.length}</td>
                <td className="p-2 border border-gray-300 text-right font-mono">-</td>
                <td className="p-2 border border-gray-300 text-right font-mono text-blue-900 font-bold">
                  {formatDZD(Number(data.grossAmount))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Section 3: SEPARATED FREE LESSONS (Highlighted in ORANGE) */}
      <div className="mb-6 border-2 border-orange-400 bg-orange-50/40 rounded-lg p-3.5 shadow-2xs">
        <div className="flex justify-between items-center bg-orange-500 text-white font-bold px-3 py-2 rounded-md mb-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider">
              Séances gratuites dispensées (Non facturées aux élèves)
            </span>
          </div>
          <span className="bg-white text-orange-950 font-black px-2.5 py-0.5 text-xs rounded-full shadow-2xs">
            {totalFreeSessions} séance{totalFreeSessions > 1 ? 's' : ''} gratuite{totalFreeSessions > 1 ? 's' : ''}
          </span>
        </div>

        <p className="text-[11px] text-orange-900 mb-2.5 font-medium">
          Note explicative : Ces séances ont été dispensées à titre gratuit. Elles sont présentées séparément des séances régulières payantes et ne débitent aucun crédit d&apos;heures sur les fiches des élèves.
        </p>

        {freeLessons.length > 0 ? (
          <table className="w-full border-collapse text-xs text-left bg-white rounded border border-orange-300 overflow-hidden">
            <thead>
              <tr className="bg-orange-100 border-b border-orange-300 text-orange-950 font-bold">
                <th className="p-2 border-r border-orange-300">Date & Heure</th>
                <th className="p-2 border-r border-orange-300">Classe / Groupe</th>
                <th className="p-2 border-r border-orange-300">Branche</th>
                <th className="p-2 border-r border-orange-300 text-center">Type de séance</th>
                <th className="p-2 border-r border-orange-300 text-center">Élèves présents</th>
                <th className="p-2 text-right">Impact comptable élève</th>
              </tr>
            </thead>
            <tbody>
              {freeLessons.map((fl, idx) => (
                <tr key={fl.lessonId || idx} className="border-b border-orange-200 bg-orange-50/50 hover:bg-orange-100/50">
                  <td className="p-2 border-r border-orange-200 font-mono text-[11px] text-gray-800">
                    {formatDateTime(fl.startsAt)}
                  </td>
                  <td className="p-2 border-r border-orange-200 font-bold text-gray-900">
                    {fl.className}
                  </td>
                  <td className="p-2 border-r border-orange-200 text-gray-700">
                    {fl.branchName}
                  </td>
                  <td className="p-2 border-r border-orange-200 text-center">
                    <span className="inline-block bg-orange-600 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow-2xs">
                      Séance Gratuite
                    </span>
                  </td>
                  <td className="p-2 border-r border-orange-200 text-center font-mono font-bold text-orange-950">
                    {fl.presentCount} présent{fl.presentCount > 1 ? 's' : ''}
                  </td>
                  <td className="p-2 text-right font-semibold text-orange-800 text-[11px]">
                    0 crédit débité (Gratuit)
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-orange-100/90 font-bold border-t border-orange-300 text-orange-950">
                <td colSpan={4} className="p-2 border-r border-orange-300">
                  Total des séances gratuites effectuées
                </td>
                <td className="p-2 text-center font-mono font-black text-orange-900">
                  {freeLessons.length}
                </td>
                <td className="p-2 text-right text-orange-900 font-semibold">
                  Non facturé aux élèves
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="bg-orange-100/60 border border-orange-300 text-orange-900 p-2.5 rounded text-center text-xs font-semibold">
            {totalFreeSessions > 0
              ? `${totalFreeSessions} séance(s) gratuite(s) enregistrée(s) pour cette période comptable.`
              : "Aucune séance gratuite dispensée durant cette période comptable."}
          </div>
        )}
      </div>

      {/* Section 3b: Teacher Absence Sessions */}
      {(absentLessons.length > 0 || (data.teacherAbsencesCount ?? 0) > 0) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-gray-700">
              Séances d&apos;absence de l&apos;enseignant (Non rémunérées) :
            </h2>
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
              {absentLessons.length} séance(s) manquée(s)
            </span>
          </div>

          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-rose-50 border border-rose-200 text-rose-900">
                <th className="p-1.5 border border-rose-200">Date & Heure</th>
                <th className="p-1.5 border border-rose-200">Groupe / Classe</th>
                <th className="p-1.5 border border-rose-200">Branche</th>
                <th className="p-1.5 border border-rose-200 text-center">Statut</th>
                <th className="p-1.5 border border-rose-200 text-right">Rémunération</th>
              </tr>
            </thead>
            <tbody>
              {absentLessons.map((al, idx) => (
                <tr key={al.lessonId || idx} className="border border-gray-200">
                  <td className="p-1.5 border border-gray-200 font-mono text-[11px] text-gray-800">
                    {formatDateTime(al.startsAt)}
                  </td>
                  <td className="p-1.5 border border-gray-200 font-semibold text-gray-900">{al.className}</td>
                  <td className="p-1.5 border border-gray-200 text-gray-600">{al.branchName}</td>
                  <td className="p-1.5 border border-gray-200 text-center">
                    <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      Enseignant Absent
                    </span>
                  </td>
                  <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-rose-700">
                    0 DZD (Non rémunéré)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 4: Detailed Deductions (Photocopy & Advances) */}
      {data.photocopyDetails && data.photocopyDetails.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-700 mb-2">
            Détail des frais de photocopie déduits (Photocopies) :
          </h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-orange-50 border border-orange-200 text-orange-900">
                <th className="p-1.5 border border-orange-200">Branche</th>
                <th className="p-1.5 border border-orange-200 text-center">Pages</th>
                <th className="p-1.5 border border-orange-200 text-center">Date</th>
                <th className="p-1.5 border border-orange-200 text-right">Coût déduit</th>
              </tr>
            </thead>
            <tbody>
              {data.photocopyDetails.map((pc, idx) => (
                <tr key={idx} className="border border-gray-200">
                  <td className="p-1.5 border border-gray-200">{pc.branchName}</td>
                  <td className="p-1.5 border border-gray-200 text-center font-mono">{pc.pages} pages</td>
                  <td className="p-1.5 border border-gray-200 text-center font-mono">{formatDate(pc.date)}</td>
                  <td className="p-1.5 border border-gray-200 font-mono text-red-700 text-right">
                    - {formatDZD(Number(pc.costAmount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section 4b: Book Revenue Details (100% Enseignant) */}
      {data.bookRevenueDetails && data.bookRevenueDetails.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-700 mb-2">
            Détail des ventes de livres (100% Enseignant) :
          </h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-purple-50 border border-purple-200 text-purple-900">
                <th className="p-1.5 border border-purple-200">Date</th>
                <th className="p-1.5 border border-purple-200">Livre</th>
                <th className="p-1.5 border border-purple-200">Élève</th>
                <th className="p-1.5 border border-purple-200">Siège</th>
                <th className="p-1.5 border border-purple-200 text-right">Montant (100%)</th>
              </tr>
            </thead>
            <tbody>
              {data.bookRevenueDetails.map((b, idx) => (
                <tr key={idx} className="border border-gray-200">
                  <td className="p-1.5 border border-gray-200 font-mono">{formatDate(b.date)}</td>
                  <td className="p-1.5 border border-gray-200 font-bold">{b.bookTitle || "Livre"}</td>
                  <td className="p-1.5 border border-gray-200">{b.studentName || "Élève"}</td>
                  <td className="p-1.5 border border-gray-200">{b.branchName || "-"}</td>
                  <td className="p-1.5 border border-gray-200 font-mono text-purple-800 text-right font-bold">
                    {formatDZD(Number(b.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-purple-100 font-bold text-purple-950">
                <td colSpan={4} className="p-1.5 border border-purple-200">
                  Total des ventes de livres (100% Enseignant)
                </td>
                <td className="p-1.5 border border-purple-200 text-right font-mono font-black">
                  {formatDZD(Number(data.bookRevenue || 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Section 5: Final Consolidated Net Calculation */}
      <div className="border-2 border-gray-900 rounded-lg p-4 bg-gray-50 mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3 border-b border-gray-300 pb-1">
          Calcul du Net à Payer :
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center text-gray-800">
            <span className="font-semibold">1. Rémunération des cours :</span>
            <span className="font-mono font-bold text-base">
              {formatDZD(Number(data.grossAmount) - Number(data.bookRevenue || 0))}
            </span>
          </div>

          {(data.bookRevenue ?? 0) > 0 && (
            <div className="flex justify-between items-center text-purple-900 font-semibold">
              <span>+ Vente de livres (100% Enseignant) :</span>
              <span className="font-mono font-bold text-purple-900">
                + {formatDZD(Number(data.bookRevenue))}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center text-gray-900 border-t border-gray-200 pt-1 font-bold">
            <span>Total Brut :</span>
            <span className="font-mono font-bold">
              {formatDZD(Number(data.grossAmount))}
            </span>
          </div>

          <div className="flex justify-between items-center text-red-700">
            <span>2. Déduction des avances sur salaire :</span>
            <span className="font-mono font-semibold">
              - {formatDZD(Number(data.advances))}
            </span>
          </div>

          <div className="flex justify-between items-center text-amber-800">
            <span>3. Déduction des frais de photocopie :</span>
            <span className="font-mono font-semibold">
              - {formatDZD(Number(data.photocopyDeductions))}
            </span>
          </div>

          <div className="border-t-2 border-dashed border-gray-900 pt-2 mt-2 flex justify-between items-center text-lg font-black text-gray-900 bg-white p-3 rounded border">
            <span>Net à payer :</span>
            <span className="font-mono text-blue-900 text-xl">
              {formatDZD(Number(data.netAmount))}
            </span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-8 pt-6 border-t border-gray-300 text-center text-xs">
        <div>
          <p className="font-bold text-gray-700 mb-12">Signature de l&apos;enseignant(e)</p>
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

export default PayslipTicket;
