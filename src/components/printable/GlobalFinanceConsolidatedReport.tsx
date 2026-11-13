import React from "react";
import { MASSINISSA_LOGO_BASE64 } from "@/lib/receiptAssets";
import { formatAlgiersDate, formatDZD as formatDZDLib, ALGIERS_TIMEZONE } from "@/lib/algiersDate";
import { GlobalFinanceReportData } from "@/lib/financeActions";

export interface GlobalFinanceConsolidatedReportProps {
  data: GlobalFinanceReportData;
  selections: {
    includeFormationIncomes: boolean;
    includeInscriptionFees: boolean;
    includeCaisseNoire: boolean;
    includePhotocopyDeductions: boolean;
    includeFormationBooks: boolean;
  };
  locale?: string;
}

export function GlobalFinanceConsolidatedReport({
  data,
  selections,
  locale = "fr",
}: GlobalFinanceConsolidatedReportProps) {
  const isAr = locale === "ar";
  const formatDZD = (num: number) => formatDZDLib(num, locale);

  const formatDate = (d: string | Date) => {
    try {
      return (
        formatAlgiersDate(d, isAr ? "ar-DZ" : "fr-FR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }) || String(d)
      );
    } catch {
      return String(d);
    }
  };

  const formatDateTime = (d: string | Date) => {
    try {
      const dateObj = typeof d === "string" ? new Date(d) : d;
      return new Intl.DateTimeFormat(isAr ? "ar-DZ" : "fr-FR", {
        timeZone: ALGIERS_TIMEZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(dateObj);
    } catch {
      return String(d);
    }
  };

  // Grand total of selected revenue categories
  let selectedGrandTotal = 0;
  if (selections.includeFormationIncomes) selectedGrandTotal += data.formationIncomes.total;
  if (selections.includeInscriptionFees) selectedGrandTotal += data.inscriptionFees.total;
  if (selections.includePhotocopyDeductions) selectedGrandTotal += data.photocopyDeductions.totalAmount;
  if (selections.includeFormationBooks) selectedGrandTotal += data.formationBooks.totalAmount;

  const containerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "210mm",
    margin: "0 auto",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "10pt",
    color: "#111827",
    direction: isAr ? "rtl" : "ltr",
    backgroundColor: "#ffffff",
  };

  return (
    <div style={containerStyle} className="global-finance-report-container">
      {/* Header */}
      <div className="flex justify-between items-center border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <img
            src={MASSINISSA_LOGO_BASE64}
            alt="Massinissa School"
            style={{ width: "64px", height: "64px", objectFit: "contain" }}
          />
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Massinissa School</h1>
            <p className="text-xs text-gray-600 font-semibold">Constantine - Algérie</p>
            <p className="text-[11px] text-gray-500 font-mono">
              {isAr ? "تقرير التدفقات المالية الشامل — الإدارة العامة" : "Rapport Financier Global Consolidé — Direction"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-bold px-3 py-1 text-xs rounded uppercase tracking-wider">
            {isAr ? "تقرير مالي شامل" : "Rapport Financier Global"}
          </span>
          <p className="text-[11px] font-mono text-red-700 font-bold mt-1">
            STRICTEMENT CONFIDENTIEL — DIRECTION
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Édité le : {formatDateTime(data.generatedAt)}
          </p>
        </div>
      </div>

      {/* Scope and Date Metadata */}
      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
        <div>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            {isAr ? "المجال والمقر" : "Établissement & Branche"}
          </p>
          <p className="text-base font-bold text-gray-900">{data.branchName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
            {isAr ? "الفترة المعنية" : "Période concernée"}
          </p>
          <p className="text-sm font-bold text-gray-900">
            Du {formatDate(data.periodStart)} au {formatDate(data.periodEnd)}
          </p>
        </div>
      </div>

      {/* 1. FORMATION INCOMES */}
      {selections.includeFormationIncomes && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-rose-200">
            <h2 className="text-sm font-bold text-rose-950 uppercase tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
              {isAr ? "1. مداخيل التكوينات والورشات (Formations & Dawarat)" : "1. Revenus des Formations & Dawarat"}
            </h2>
            <span className="text-xs font-mono font-bold text-rose-700">
              Total : {formatDZD(data.formationIncomes.total)}
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-rose-50 text-rose-950 uppercase font-bold text-[10px]">
                <th className="border border-gray-300 p-2 text-left">Intitulé de la Formation</th>
                <th className="border border-gray-300 p-2 text-left">Branche</th>
                <th className="border border-gray-300 p-2 text-center">Inscrits / Reçus</th>
                <th className="border border-gray-300 p-2 text-right">Recette Totale</th>
              </tr>
            </thead>
            <tbody>
              {data.formationIncomes.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-gray-500 italic">
                    Aucun revenu de formation enregistré sur cette période.
                  </td>
                </tr>
              ) : (
                data.formationIncomes.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-rose-50/20">
                    <td className="border border-gray-300 p-2 font-semibold text-gray-900">
                      {item.title}
                    </td>
                    <td className="border border-gray-300 p-2 text-gray-600">
                      {item.branchName || "Siège"}
                    </td>
                    <td className="border border-gray-300 p-2 text-center font-mono font-bold">
                      {item.studentsCount}
                    </td>
                    <td className="border border-gray-300 p-2 text-right font-mono font-bold text-rose-700">
                      {formatDZD(item.totalAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-rose-100/70 font-bold border-t-2 border-rose-300">
                <td colSpan={2} className="border border-gray-300 p-2 text-gray-900 uppercase">
                  Sous-total Revenus Formations
                </td>
                <td className="border border-gray-300 p-2 text-center font-mono">
                  {data.formationIncomes.vouchersCount} reçus
                </td>
                <td className="border border-gray-300 p-2 text-right font-mono text-rose-800">
                  {formatDZD(data.formationIncomes.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 2. INSCRIPTION FEES */}
      {selections.includeInscriptionFees && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-emerald-200">
            <h2 className="text-sm font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
              {isAr ? "2. حقوق التسجيل وإعادة التسجيل" : "2. Frais d'Inscription & Réinscriptions"}
            </h2>
            <span className="text-xs font-mono font-bold text-emerald-700">
              Total : {formatDZD(data.inscriptionFees.total)}
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-emerald-50 text-emerald-950 uppercase font-bold text-[10px]">
                <th className="border border-gray-300 p-2 text-left">Branche / Établissement</th>
                <th className="border border-gray-300 p-2 text-center">Nombre d&apos;inscriptions</th>
                <th className="border border-gray-300 p-2 text-right">Montant Encaissé</th>
              </tr>
            </thead>
            <tbody>
              {data.inscriptionFees.byBranch.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-gray-500 italic">
                    Aucun encaissement d&apos;inscription sur cette période.
                  </td>
                </tr>
              ) : (
                data.inscriptionFees.byBranch.map((b, idx) => (
                  <tr key={idx} className="hover:bg-emerald-50/20">
                    <td className="border border-gray-300 p-2 font-semibold text-gray-900">
                      {b.branchName}
                    </td>
                    <td className="border border-gray-300 p-2 text-center font-mono font-bold">
                      {b.count}
                    </td>
                    <td className="border border-gray-300 p-2 text-right font-mono font-bold text-emerald-700">
                      {formatDZD(b.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-100/70 font-bold border-t-2 border-emerald-300">
                <td className="border border-gray-300 p-2 text-gray-900 uppercase">
                  Sous-total Droits d&apos;Inscription
                </td>
                <td className="border border-gray-300 p-2 text-center font-mono">
                  {data.inscriptionFees.vouchersCount} élèves
                </td>
                <td className="border border-gray-300 p-2 text-right font-mono text-emerald-800">
                  {formatDZD(data.inscriptionFees.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 3. CAISSE NOIRE */}
      {selections.includeCaisseNoire && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-300">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block"></span>
              {isAr ? "3. وضعية وحركات الصندوق الأسود (Caisse Noire)" : "3. Situation & Mouvements de la Caisse Noire"}
            </h2>
            <span className="text-xs font-mono font-bold text-slate-800">
              Solde Fin de Période : {formatDZD(data.caisseNoire.endingBalance)}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3 text-center text-xs">
            <div className="p-2 bg-slate-100 border border-slate-200 rounded">
              <span className="text-[10px] text-slate-500 block">Solde Initial</span>
              <span className="font-mono font-bold text-slate-900">{formatDZD(data.caisseNoire.initialBalance)}</span>
            </div>
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded">
              <span className="text-[10px] text-emerald-600 block">Dépôts Période</span>
              <span className="font-mono font-bold text-emerald-700">+{formatDZD(data.caisseNoire.totalDeposited)}</span>
            </div>
            <div className="p-2 bg-rose-50 border border-rose-200 rounded">
              <span className="text-[10px] text-rose-600 block">Retraits Période</span>
              <span className="font-mono font-bold text-rose-700">-{formatDZD(data.caisseNoire.totalWithdrawn)}</span>
            </div>
            <div className="p-2 bg-slate-900 text-white rounded">
              <span className="text-[10px] text-slate-300 block">Solde Clôture</span>
              <span className="font-mono font-bold text-emerald-400">{formatDZD(data.caisseNoire.endingBalance)}</span>
            </div>
          </div>

          {data.caisseNoire.transactions.length > 0 && (
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px]">
                  <th className="border border-gray-300 p-1.5 text-center w-24">Date</th>
                  <th className="border border-gray-300 p-1.5 text-center w-20">Type</th>
                  <th className="border border-gray-300 p-1.5 text-left">Description / Motif</th>
                  <th className="border border-gray-300 p-1.5 text-right w-28">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.caisseNoire.transactions.slice(0, 15).map((t, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50">
                    <td className="border border-gray-300 p-1.5 text-center font-mono">{formatDate(t.date)}</td>
                    <td className="border border-gray-300 p-1.5 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        t.type === "DEPOSIT" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}>
                        {t.type === "DEPOSIT" ? "DÉPÔT" : "RETRAIT"}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-1.5 text-gray-800">{t.description}</td>
                    <td className={`border border-gray-300 p-1.5 text-right font-mono font-bold ${
                      t.type === "DEPOSIT" ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {t.type === "DEPOSIT" ? "+" : "-"}{formatDZD(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 4. PHOTOCOPY DEDUCTIONS */}
      {selections.includePhotocopyDeductions && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-amber-200">
            <h2 className="text-sm font-bold text-amber-950 uppercase tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
              {isAr ? "4. اقتطاعات تصوير المستندات (المخصومة من الأساتذة)" : "4. Déductions Photocopies Enseignants (Récupérées)"}
            </h2>
            <span className="text-xs font-mono font-bold text-amber-800">
              Total Récupéré : {formatDZD(data.photocopyDeductions.totalAmount)}
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-amber-50 text-amber-950 uppercase font-bold text-[10px]">
                <th className="border border-gray-300 p-2 text-left">Enseignant</th>
                <th className="border border-gray-300 p-2 text-center">Nombre de Pages</th>
                <th className="border border-gray-300 p-2 text-right">Montant Déduit / Récupéré</th>
              </tr>
            </thead>
            <tbody>
              {data.photocopyDeductions.teachers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-gray-500 italic">
                    Aucune déduction de photocopie sur cette période.
                  </td>
                </tr>
              ) : (
                data.photocopyDeductions.teachers.map((t, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/20">
                    <td className="border border-gray-300 p-2 font-semibold text-gray-900">{t.teacherName}</td>
                    <td className="border border-gray-300 p-2 text-center font-mono font-bold">{t.pages}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono font-bold text-amber-800">
                      {formatDZD(t.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-amber-100/70 font-bold border-t-2 border-amber-300">
                <td className="border border-gray-300 p-2 text-gray-900 uppercase">
                  Sous-total Récupération Photocopies
                </td>
                <td className="border border-gray-300 p-2 text-center font-mono">
                  {data.photocopyDeductions.totalPages} pages
                </td>
                <td className="border border-gray-300 p-2 text-right font-mono text-amber-900">
                  {formatDZD(data.photocopyDeductions.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 5. FORMATION BOOKS */}
      {selections.includeFormationBooks && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-indigo-200">
            <h2 className="text-sm font-bold text-indigo-950 uppercase tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
              {isAr ? "5. مبيعات كتب التكوين والكتيبات" : "5. Livres de Formation & Manuels Vendus"}
            </h2>
            <span className="text-xs font-mono font-bold text-indigo-800">
              Total Encaissé : {formatDZD(data.formationBooks.totalAmount)}
            </span>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-indigo-50 text-indigo-950 uppercase font-bold text-[10px]">
                <th className="border border-gray-300 p-2 text-left">Intitulé du Livre / Manuel</th>
                <th className="border border-gray-300 p-2 text-left">Branche</th>
                <th className="border border-gray-300 p-2 text-center">Exemplaires Vendus</th>
                <th className="border border-gray-300 p-2 text-right">Recette Totale</th>
              </tr>
            </thead>
            <tbody>
              {data.formationBooks.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-gray-500 italic">
                    Aucune vente de livre de formation sur cette période.
                  </td>
                </tr>
              ) : (
                data.formationBooks.items.map((b, idx) => (
                  <tr key={idx} className="hover:bg-indigo-50/20">
                    <td className="border border-gray-300 p-2 font-semibold text-gray-900">{b.title}</td>
                    <td className="border border-gray-300 p-2 text-gray-600">{b.branchName || "Siège"}</td>
                    <td className="border border-gray-300 p-2 text-center font-mono font-bold">{b.copies}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono font-bold text-indigo-800">
                      {formatDZD(b.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-100/70 font-bold border-t-2 border-indigo-300">
                <td colSpan={2} className="border border-gray-300 p-2 text-gray-900 uppercase">
                  Sous-total Ventes de Livres
                </td>
                <td className="border border-gray-300 p-2 text-center font-mono">
                  {data.formationBooks.totalCopies} exemplaires
                </td>
                <td className="border border-gray-300 p-2 text-right font-mono text-indigo-900">
                  {formatDZD(data.formationBooks.totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Grand Consolidated Bilan Card & Signature Footer kept together */}
      <div className="avoid-break">
        <div className="bg-slate-900 text-white rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-3 pb-2 border-b border-slate-800">
            {isAr ? "الحصيلة المالية الإجمالية للعناصر المختارة" : "Bilan Consolidé des Rubriques Sélectionnées"}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-4">
            {selections.includeFormationIncomes && (
              <div className="bg-slate-800 p-2.5 rounded">
                <span className="text-[10px] text-slate-400 block">Formations & Dawarat</span>
                <span className="font-mono font-bold text-rose-400 text-sm whitespace-nowrap">+{formatDZD(data.formationIncomes.total)}</span>
              </div>
            )}
            {selections.includeInscriptionFees && (
              <div className="bg-slate-800 p-2.5 rounded">
                <span className="text-[10px] text-slate-400 block">Frais d&apos;Inscription</span>
                <span className="font-mono font-bold text-emerald-400 text-sm whitespace-nowrap">+{formatDZD(data.inscriptionFees.total)}</span>
              </div>
            )}
            {selections.includePhotocopyDeductions && (
              <div className="bg-slate-800 p-2.5 rounded">
                <span className="text-[10px] text-slate-400 block">Photocopies Récupérées</span>
                <span className="font-mono font-bold text-amber-400 text-sm whitespace-nowrap">+{formatDZD(data.photocopyDeductions.totalAmount)}</span>
              </div>
            )}
            {selections.includeFormationBooks && (
              <div className="bg-slate-800 p-2.5 rounded">
                <span className="text-[10px] text-slate-400 block">Livres de Formation</span>
                <span className="font-mono font-bold text-indigo-300 text-sm whitespace-nowrap">+{formatDZD(data.formationBooks.totalAmount)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
            <div>
              <p className="text-xs uppercase font-bold text-slate-300">
                {isAr ? "المجموع الكلي للتدفقات المختارة :" : "Total Global Consolidé (Flux Sélectionnés) :"}
              </p>
              <p className="text-2xl font-black font-mono text-emerald-400 whitespace-nowrap">
                +{formatDZD(selectedGrandTotal)}
              </p>
            </div>
            {selections.includeCaisseNoire && (
              <div className="text-right">
                <p className="text-xs text-slate-400">
                  {isAr ? "رصيد الصندوق الأسود الحالي :" : "Liquidité Caisse Noire :"}
                </p>
                <p className="text-base font-bold font-mono text-slate-200 whitespace-nowrap">
                  {formatDZD(data.caisseNoire.endingBalance)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Signature & Direction Footer */}
        <div className="border-t border-gray-300 pt-4 flex justify-between items-end text-xs text-gray-600">
          <div>
            <p className="font-bold text-gray-800">Avis de Confidentialité :</p>
            <p className="text-[10px] text-gray-500 max-w-sm">
              Ce document financier est strictement réservé à la direction générale et au propriétaire de Massinissa School.
              Toute diffusion ou reproduction externe est strictement interdite.
            </p>
          </div>
          <div className="text-center min-w-[200px]">
            <p className="text-xs font-semibold mb-6 text-gray-700">Signature & Cachet de la Direction</p>
            <div className="border-b border-gray-400 w-44 mx-auto"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
