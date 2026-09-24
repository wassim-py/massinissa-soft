import React from 'react';
import Image from 'next/image';

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
  grossAmount: number;
  advances: number;
  photocopyDeductions: number;
  netAmount: number;
  branchLines: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    amount: number;
  }>;
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

  const formatDZD = (num: number) => `${Number(num).toLocaleString('fr-FR')} DZD`;

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
            <span>Détail des séances par succursale</span>
            <span className="text-xs font-normal text-gray-500">(Transparence - paiement unique)</span>
          </h2>
          <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded">
            Total séances : {data.sessionsCount} (y compris gratuites)
          </span>
        </div>

        <table className="w-full border-collapse text-xs text-left">
          <thead>
            <tr className="bg-gray-100 border border-gray-300 text-gray-700">
              <th className="p-2 border border-gray-300 font-bold">Branche</th>
              <th className="p-2 border border-gray-300 font-bold text-center">Séances effectuées</th>
              <th className="p-2 border border-gray-300 font-bold text-right">Montant calculé</th>
            </tr>
          </thead>
          <tbody>
            {data.branchLines && data.branchLines.length > 0 ? (
              data.branchLines.map((line) => (
                <tr key={line.branchId} className="border border-gray-200">
                  <td className="p-2 border border-gray-200 font-semibold">{line.branchName}</td>
                  <td className="p-2 border border-gray-200 text-center font-mono">{line.sessionsCount}</td>
                  <td className="p-2 border border-gray-200 font-mono font-bold text-right">
                    {formatDZD(Number(line.amount))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="p-3 text-center text-gray-500 border border-gray-200">
                  Aucune séance enregistrée
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold border border-gray-300">
              <td className="p-2 border border-gray-300">Total brut des séances</td>
              <td className="p-2 border border-gray-300 text-center font-mono">{data.sessionsCount}</td>
              <td className="p-2 border border-gray-300 font-mono text-blue-900 text-right">
                {formatDZD(Number(data.grossAmount))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Section 2: Detailed Deductions (Photocopy & Advances) */}
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

      {/* Section 3: Final Consolidated Net Calculation */}
      <div className="border-2 border-gray-900 rounded-lg p-4 bg-gray-50 mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3 border-b border-gray-300 pb-1">
          Calcul du Net à Payer :
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center text-gray-800">
            <span className="font-semibold">1. Salaire brut total :</span>
            <span className="font-mono font-bold text-base">
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
