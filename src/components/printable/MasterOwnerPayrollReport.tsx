import React from 'react';
import { MASSINISSA_LOGO_BASE64 } from "@/lib/receiptAssets";
import { formatUtcPeriodDate, formatDZD as formatDZDLib, ALGIERS_TIMEZONE } from "@/lib/algiersDate";

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
  bonus?: number;
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
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '9.5pt',
    color: '#111827',
    direction: 'ltr',
    backgroundColor: '#ffffff',
  };

  const formatDate = (d: string | Date) => {
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
      <div className="avoid-break flex justify-between items-center border-b-2 border-gray-900 pb-3 mb-3.5">
        <div className="flex items-center gap-3">
          <img
            src={MASSINISSA_LOGO_BASE64}
            alt="Massinissa School"
            style={{ width: '56px', height: '56px', objectFit: 'contain' }}
          />
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Massinissa School</h1>
            <p className="text-xs text-gray-600 font-semibold">Constantine - Algérie</p>
            <p className="text-[11px] text-gray-500 font-mono">Système Financier & Contrôle de Gestion</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block bg-slate-900 text-white font-bold px-2.5 py-1 text-[11px] rounded uppercase tracking-wider">
            Rapport Financier Consolidé Global
          </span>
          <p className="text-[10px] font-mono text-red-700 font-bold mt-1">
            STRICTEMENT CONFIDENTIEL — PROPRIÉTAIRE
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Édité le : {formatDateTime(data.generatedAt || new Date())}
          </p>
        </div>
      </div>

      {/* Global Period & Overall Stats Banner */}
      <div className="avoid-break grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-xs">
        <div>
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Période du Rapport</p>
          <p className="text-xs font-bold text-gray-900 mt-0.5">
            {data.periodStart && data.periodEnd
              ? `Du ${formatDate(data.periodStart)} au ${formatDate(data.periodEnd)}`
              : "Toutes périodes confondues"}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Nombre d&apos;enseignants consolidés : <span className="font-bold text-gray-900 font-mono">{data.teachersCount}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Volume d&apos;Enseignement</p>
          <p className="text-xs font-bold text-gray-900 font-mono mt-0.5">
            {data.totalLessons} séance(s) dispensée(s)
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Total groupes cumulés : <span className="font-bold text-gray-900 font-mono">
              {data.teachers.reduce((sum, t) => sum + t.groups.length, 0)}
            </span>
          </p>
        </div>
      </div>

      {/* Master 5-Column Consolidated Table (Arabic & RTL with print-fitted column proportions) */}
      <div className="mb-4" dir="rtl">
        <h2 className="avoid-break-after text-xs font-black text-gray-900 mb-2 pb-1 border-b-2 border-gray-400 flex justify-between items-center">
          <span>جدول تفاصيل المستحقات حسب الأستاذ والفوج (الأعمدة الخمسة)</span>
          <span className="text-[11px] font-bold text-gray-500 font-sans" dir="ltr">
            5 Colonnes de Contrôle
          </span>
        </h2>

        <table className="w-full border-collapse border border-gray-400 text-[11px]">
          <colgroup>
            <col style={{ width: '17%' }} />
            <col style={{ width: '35%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '19%' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-200 text-gray-950 font-black text-[11px] tracking-wide">
              <th className="border border-gray-400 px-2 py-1.5 text-right font-black">1. الأستاذ</th>
              <th className="border border-gray-400 px-2 py-1.5 text-right font-black">2. الفوج / القسم</th>
              <th className="border border-gray-400 px-1.5 py-1.5 text-center font-black whitespace-nowrap">3. الحصص</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left font-black whitespace-nowrap">4. مستحقات الأستاذ</th>
              <th className="border border-gray-400 px-2 py-1.5 text-left font-black whitespace-nowrap">5. حصة المدرسة</th>
            </tr>
          </thead>
          {data.teachers.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-600 font-bold text-xs">
                  لا توجد كشوف رواتب مسجلة لهذه الفترة.
                </td>
              </tr>
            </tbody>
          ) : (
            data.teachers.map((teacher, tIdx) => {
              const hasAdjustments = Boolean(
                teacher.advances > 0 ||
                teacher.photocopyDeductions > 0 ||
                (teacher.bonus ?? 0) !== 0
              );
              const bonusVal = Number(teacher.bonus || 0);
              return (
                <tbody
                  key={teacher.teacherId || tIdx}
                  className={teacher.groups.length <= 12 ? "avoid-teacher-split" : undefined}
                >
                  {teacher.groups.length === 0 ? (
                    <tr className="bg-white">
                      <td className="border border-gray-400 px-2 py-1 font-black text-xs text-gray-950">
                        {teacher.teacherName}
                      </td>
                      <td colSpan={4} className="border border-gray-400 px-2 py-1 text-gray-500 font-semibold text-[11px] italic">
                        لا توجد حصص منتظمة (راتب شهري ثابت أو تسبيقات / خصومات فقط)
                      </td>
                    </tr>
                  ) : (
                    teacher.groups.map((group, gIdx) => (
                      <tr key={gIdx} className="hover:bg-gray-50/50">
                        <td className="border border-gray-400 px-2 py-1 font-black text-xs text-gray-950 leading-snug">
                          {gIdx === 0 ? teacher.teacherName : ''}
                        </td>
                        <td className="border border-gray-400 px-2 py-1 leading-snug">
                          <span className="font-bold text-[11px] text-gray-900">{group.groupName}</span>
                          {group.branchName && (
                            <span className="text-[10px] font-semibold text-gray-600 mr-1.5 bg-gray-100 px-1 py-0.5 rounded border border-gray-300 inline-block">
                              ({group.branchName})
                            </span>
                          )}
                        </td>
                        <td className="border border-gray-400 px-1.5 py-1 text-center font-mono font-black text-xs text-gray-950 whitespace-nowrap">
                          {group.payableLessons}
                        </td>
                        <td className="border border-gray-400 px-2 py-1 text-left font-mono font-black text-xs text-rose-700 whitespace-nowrap">
                          <span dir="ltr" className="inline-block whitespace-nowrap">
                            {formatDZD(group.teacherCut)}
                          </span>
                        </td>
                        <td className="border border-gray-400 px-2 py-1 text-left font-mono font-black text-xs text-emerald-800 whitespace-nowrap">
                          <span dir="ltr" className="inline-block whitespace-nowrap">
                            {formatDZD(group.schoolCut)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Teacher Subtotal Row */}
                  <tr
                    className={`bg-slate-100 font-black border-b-2 border-gray-500 text-[11px] ${
                      teacher.groups.length > 12 ? "avoid-break-before" : ""
                    }`}
                  >
                    <td colSpan={2} className="border border-gray-400 px-2 py-1 text-gray-900 font-bold leading-snug">
                      <span className="text-gray-700 font-bold">المجموع الفرعي : </span>
                      <span className="text-gray-950 font-black text-xs">{teacher.teacherName}</span>
                      {hasAdjustments && (
                        <span className="font-semibold text-gray-600 mr-2 text-[10px] inline-block">
                          [
                          {bonusVal > 0 ? `منحة: +${formatDZD(bonusVal)} | ` : ""}
                          {bonusVal < 0 ? `خصم: -${formatDZD(Math.abs(bonusVal))} | ` : ""}
                          تسبيق: -{formatDZD(teacher.advances)} | نسخ: -{formatDZD(teacher.photocopyDeductions)} | الصافي: {formatDZD(teacher.netTeacherCut)}]
                        </span>
                      )}
                    </td>
                    <td className="border border-gray-400 px-1.5 py-1 text-center font-mono font-black text-xs text-gray-950 whitespace-nowrap">
                      {teacher.totalLessons}
                    </td>
                    <td className="border border-gray-400 px-2 py-1 text-left font-mono font-black text-xs text-rose-800 whitespace-nowrap">
                      <span dir="ltr" className="inline-block whitespace-nowrap">
                        {formatDZD(teacher.grossTeacherCut)}
                      </span>
                    </td>
                    <td className="border border-gray-400 px-2 py-1 text-left font-mono font-black text-xs text-emerald-900 whitespace-nowrap">
                      <span dir="ltr" className="inline-block whitespace-nowrap">
                        {formatDZD(teacher.totalSchoolCut)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              );
            })
          )}
          {/* Grand Total in trailing tbody so it renders ONCE at the end instead of repeating per page */}
          <tbody className="avoid-break">
            <tr className="bg-gray-200 font-black text-xs border-t-2 border-gray-900">
              <td colSpan={2} className="border border-gray-400 px-2 py-1.5 text-gray-950 font-black">
                المجموع العام التراكمي ({data.teachersCount} أساتذة)
              </td>
              <td className="border border-gray-400 px-1.5 py-1.5 text-center font-mono text-xs font-black text-gray-950 whitespace-nowrap">
                {data.totalLessons}
              </td>
              <td className="border border-gray-400 px-2 py-1.5 text-left font-mono text-xs font-black text-rose-800 whitespace-nowrap">
                <span dir="ltr" className="inline-block whitespace-nowrap">
                  {formatDZD(data.totalTeacherGross)}
                </span>
              </td>
              <td className="border border-gray-400 px-2 py-1.5 text-left font-mono text-xs font-black text-emerald-900 whitespace-nowrap">
                <span dir="ltr" className="inline-block whitespace-nowrap">
                  {formatDZD(data.totalSchoolGross)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Master Financial Recap Cards & Signature Block kept intact together across page breaks */}
      <div className="avoid-break">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Payout Summary */}
          <div className="bg-rose-50/50 border border-rose-200 rounded-lg p-3 text-[11px]">
            <p className="font-bold text-rose-950 uppercase mb-1.5 pb-1 border-b border-rose-200">
              Synthèse Masse Salariale Enseignants
            </p>
            <div className="space-y-1 font-mono">
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-600 font-sans">Masse Salariale Brute :</span>
                <span className="font-bold text-gray-900 whitespace-nowrap shrink-0">{formatDZD(data.totalTeacherGross)}</span>
              </div>
              {data.totalAdvances > 0 && (
                <div className="flex justify-between items-center gap-2 text-red-600">
                  <span className="font-sans">Total Avances Déduites :</span>
                  <span className="whitespace-nowrap shrink-0">- {formatDZD(data.totalAdvances)}</span>
                </div>
              )}
              {data.totalPhotocopy > 0 && (
                <div className="flex justify-between items-center gap-2 text-amber-700">
                  <span className="font-sans">Total Photocopies Déduites :</span>
                  <span className="whitespace-nowrap shrink-0">- {formatDZD(data.totalPhotocopy)}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-2 border-t border-rose-200 pt-1.5 text-xs font-black text-rose-900">
                <span className="font-sans">Masse Salariale Nette Décaissée :</span>
                <span className="whitespace-nowrap shrink-0">{formatDZD(data.totalTeacherNet)}</span>
              </div>
            </div>
          </div>

          {/* School Financial Return Summary */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 text-[11px]">
            <p className="font-bold text-emerald-950 uppercase mb-1.5 pb-1 border-b border-emerald-200">
              Synthèse Rendement École
            </p>
            <div className="space-y-1 font-mono">
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-600 font-sans">Part Brute École :</span>
                <span className="font-bold text-gray-900 whitespace-nowrap shrink-0">{formatDZD(data.totalSchoolGross)}</span>
              </div>
              {data.totalPhotocopy > 0 && (
                <div className="flex justify-between items-center gap-2 text-emerald-700">
                  <span className="font-sans">Photocopies Récupérées :</span>
                  <span className="whitespace-nowrap shrink-0">+ {formatDZD(data.totalPhotocopy)}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-2 border-t border-emerald-200 pt-1.5 text-xs font-black text-emerald-900">
                <span className="font-sans">Part Nette Totale École :</span>
                <span className="whitespace-nowrap shrink-0">{formatDZD(data.totalSchoolNet)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Signature and Confidentiality Footer */}
        <div className="border-t border-gray-300 pt-3 flex justify-between items-end text-xs text-gray-600">
          <div>
            <p className="font-bold text-gray-800">Avis de Confidentialité et Rapprochement :</p>
            <p className="text-[10px] text-gray-500 max-w-sm">
              Ce document récapitulatif regroupe l&apos;ensemble des fiches de paie générées pour la période.
              Document strictement réservé au Propriétaire / Direction Générale.
            </p>
          </div>
          <div className="text-center min-w-[180px]">
            <p className="text-xs font-semibold mb-6 text-gray-700">Signature & Cachet de la Direction</p>
            <div className="border-b border-gray-400 w-36 mx-auto"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
