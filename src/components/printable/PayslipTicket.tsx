import React from 'react';
import { MASSINISSA_LOGO_BASE64 } from "@/lib/receiptAssets";
import { formatAlgiersDate, formatUtcPeriodDate, formatDZD as formatDZDLib, formatNumber, ALGIERS_TIMEZONE } from "@/lib/algiersDate";

export interface PayslipSalaryGrowthPoint {
  year: number;
  month: number;
  monthKey: string;
  label: string;
  shortLabel: string;
  sessionsCount: number;
  grossAmount: number;
  netAmount: number;
  growthRate: number | null;
  growthDelta: number | null;
  isCurrentPeriod?: boolean;
}

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
  isRetroactive?: boolean;
  retroactiveNote?: string;
  isFormation?: boolean;
}

export interface PayslipGroupLine {
  className: string;
  branchName?: string;
  courseSessionsCount?: number;
  payableLessonsCount?: number;
  paidSessionsCount?: number;
  freeSessionsCount: number;
  totalSessionsCount: number;
  amount: number;
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
  paidSessionsCount?: number;
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
    branchId?: number;
    branchName?: string;
  }>;
  advances: number;
  advanceDetails?: Array<{
    id?: number;
    amount: number;
    date: string | Date;
    remarque?: string | null;
  }>;
  photocopyDeductions: number;
  netAmount: number;
  branchLines: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    freeSessionsCount?: number;
    amount: number;
  }>;
  groupLines?: PayslipGroupLine[];
  sessions?: PayslipSessionItem[];
  retroactiveLessonsCount?: number;
  retroactiveAmount?: number;
  photocopyDetails?: Array<{
    branchName: string;
    pages: number;
    costAmount: number;
    date: string | Date;
  }>;
  salaryHistory?: PayslipSalaryGrowthPoint[];
  displayOptions?: {
    includeRegularLessons?: boolean;
    includeFormationCourses?: boolean;
    includeBooks?: boolean;
    includeAdvances?: boolean;
    includePhotocopy?: boolean;
    showSalaryGrowth?: boolean;
    showGroupBreakdown?: boolean;
    showBranchBreakdown?: boolean;
    showSessionDetails?: boolean;
    showFreeSessions?: boolean;
    showTeacherAbsences?: boolean;
  };
}

function computeNiceAxisMax(maxVal: number): number {
  if (maxVal <= 0) return 10000;
  const target = maxVal * 1.25;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / mag;
  const candidates = [1.2, 1.6, 2, 2.4, 3.2, 4, 4.8, 6, 8, 10, 12];
  const chosen = candidates.find((c) => c >= norm) ?? 12;
  return Math.round(chosen * mag);
}

function formatAxisTick(value: number): string {
  if (value <= 0) return '0';
  if (value >= 1000) {
    const k = value / 1000;
    if (Math.abs(k - Math.round(k)) < 0.001) {
      return `${formatNumber(Math.round(k))}k`;
    }
    return `${k.toFixed(1).replace('.', ',')}k`;
  }
  return formatNumber(Math.round(value));
}

function formatGrowthPct(rate: number): string {
  const absVal = Math.abs(rate);
  const str = absVal % 1 === 0 ? absVal.toFixed(0) : absVal.toFixed(1).replace('.', ',');
  const sign = rate > 0 ? '+' : rate < 0 ? '-' : '';
  return `${sign}${str}%`;
}

function buildRoundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const radius = Math.min(r, w / 2, h);
  return [
    `M ${x},${y + h}`,
    `L ${x},${y + radius}`,
    `Q ${x},${y} ${x + radius},${y}`,
    `L ${x + w - radius},${y}`,
    `Q ${x + w},${y} ${x + w},${y + radius}`,
    `L ${x + w},${y + h}`,
    'Z',
  ].join(' ');
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
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '10pt',
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
      });
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

  // Selective display flags (all default to true for backwards compatibility)
  const opts = data.displayOptions;
  const includeRegular = opts?.includeRegularLessons !== false;
  const includeFormation = opts?.includeFormationCourses !== false;
  const includeBooks = opts?.includeBooks !== false;
  const includeAdvances = opts?.includeAdvances !== false;
  const includePhotocopy = opts?.includePhotocopy !== false;
  const showSalaryGrowth = opts?.showSalaryGrowth !== false;
  const showGroupBreakdown = opts?.showGroupBreakdown !== false;
  const showBranchBreakdown = opts?.showBranchBreakdown !== false;
  const showSessionDetails = opts?.showSessionDetails !== false;
  const showFreeSessions = opts?.showFreeSessions !== false;
  const showTeacherAbsences = opts?.showTeacherAbsences !== false;
  const hasCoursesSelected = includeRegular || includeFormation;
  const effectiveBookRevenue = includeBooks ? Number(data.bookRevenue || 0) : 0;
  const effectiveCoursesGross = Math.max(0, Number(data.grossAmount) - effectiveBookRevenue);

  const allSessions = React.useMemo(() => data.sessions || [], [data.sessions]);
  const absentLessons = allSessions.filter((s) => s.isTeacherAbsent);
  const freeLessons = allSessions.filter((s) => s.isFree && !s.isTeacherAbsent && !s.isRetroactive);
  const paidLessons = allSessions.filter((s) => !s.isFree && !s.isTeacherAbsent && !s.isRetroactive);
  const retroactiveLessons = React.useMemo(
    () => allSessions.filter((s) => s.isRetroactive),
    [allSessions]
  );
  const totalRetroactiveLessons = Math.round(
    (data.retroactiveLessonsCount ??
      retroactiveLessons.reduce((sum, s) => sum + Number(s.payingCount ?? 1), 0)) * 100
  ) / 100;
  const totalRetroactiveAmount = Math.round(
    (data.retroactiveAmount ??
      retroactiveLessons.reduce((sum, s) => sum + Number(s.lessonAmount || 0), 0)) * 100
  ) / 100;
  const paidLessonsAmount = paidLessons.reduce((sum, l) => sum + Number(l.lessonAmount || 0), 0);
  const totalFreeSessions = data.freeSessionsCount ?? freeLessons.length;
  const totalPaidSessions = data.paidSessionsCount ?? (
    allSessions.length > 0
      ? paidLessons.length
      : Math.max(0, data.sessionsCount - totalFreeSessions)
  );

  // Group breakdown aggregation
  const groupLines: PayslipGroupLine[] = React.useMemo(() => {
    if (data.groupLines && data.groupLines.length > 0) {
      return data.groupLines.map((g) => ({
        ...g,
        courseSessionsCount: g.courseSessionsCount ?? Math.max(0, g.totalSessionsCount - g.freeSessionsCount),
        payableLessonsCount: g.payableLessonsCount ?? g.paidSessionsCount ?? 0,
      }));
    }
    if (!allSessions || allSessions.length === 0) return [];
    const map = new Map<string, PayslipGroupLine>();
    for (const s of allSessions) {
      if (s.isTeacherAbsent) continue;
      const key = `${s.className || "Sans groupe"}___${s.branchName || ""}`;
      const entry = map.get(key) || {
        className: s.className || "Sans groupe",
        branchName: s.branchName || "-",
        courseSessionsCount: 0,
        payableLessonsCount: 0,
        paidSessionsCount: 0,
        freeSessionsCount: 0,
        totalSessionsCount: 0,
        amount: 0,
      };
      if (s.isRetroactive) {
        const count = Number(s.payingCount ?? 1);
        entry.payableLessonsCount = (entry.payableLessonsCount || 0) + count;
        entry.paidSessionsCount = entry.payableLessonsCount;
        entry.amount += Number(s.lessonAmount || 0);
      } else {
        entry.totalSessionsCount += 1;
        if (s.isFree) {
          entry.freeSessionsCount += 1;
        } else {
          entry.courseSessionsCount = (entry.courseSessionsCount || 0) + 1;
          const count = Number(s.payingCount ?? s.presentCount ?? 1);
          entry.payableLessonsCount = (entry.payableLessonsCount || 0) + count;
          entry.paidSessionsCount = entry.payableLessonsCount;
          entry.amount += Number(s.lessonAmount || 0);
        }
      }
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className));
  }, [allSessions, data.groupLines]);

  const totalCourseSessions = groupLines.reduce((sum, g) => sum + (g.courseSessionsCount ?? 0), 0);
  const totalPayableLessons = groupLines.reduce((sum, g) => sum + (g.payableLessonsCount ?? g.paidSessionsCount ?? 0), 0);

  return (
    <div style={containerStyle} className="payslip-container">
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
            Du {formatPeriodDate(data.periodStart)} au {formatPeriodDate(data.periodEnd)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Date d&apos;impression : {formatAlgiersDate(new Date(), 'fr-FR')}
          </p>
        </div>
      </div>

      {/* Key Metrics Banner: Total Payable Lessons, Late Regulated (if any), Course Sessions, Gross, Net */}
      {!hasCoursesSelected && includeBooks ? (
        <div className="grid grid-cols-3 gap-2.5 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-6 text-center">
          <div className="bg-purple-50 border-2 border-purple-400 p-2.5 rounded-md">
            <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wide block">
              Ventes de Livres
            </span>
            <span className="text-2xl font-black text-purple-950 font-mono block mt-0.5">
              {data.bookRevenueDetails?.length || 0}
            </span>
            <span className="text-[10px] text-purple-700 font-semibold block">
              exemplaire{(data.bookRevenueDetails?.length || 0) > 1 ? "s" : ""} payé{(data.bookRevenueDetails?.length || 0) > 1 ? "s" : ""}
            </span>
          </div>

          <div className="bg-white border border-gray-200 p-2.5 rounded-md">
            <span className="text-[11px] font-semibold text-gray-600 block">
              Total Livres (100%)
            </span>
            <span className="text-base font-bold text-purple-900 font-mono block mt-1">
              {formatDZD(effectiveBookRevenue)}
            </span>
            <span className="text-[10px] text-gray-500 block">
              part enseignant
            </span>
          </div>

          <div className="bg-blue-900 text-white p-2.5 rounded-md border border-blue-950">
            <span className="text-[11px] font-bold text-blue-100 uppercase tracking-wider block">
              Net à Payer
            </span>
            <span className="text-base font-black text-white font-mono block mt-1">
              {formatDZD(Number(data.netAmount))}
            </span>
            <span className="text-[10px] text-blue-200 block">
              net de déductions
            </span>
          </div>
        </div>
      ) : (
        <div className={`grid ${totalRetroactiveLessons > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-2.5 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-6 text-center`}>
          <div className="bg-blue-50 border-2 border-blue-400 p-2.5 rounded-md">
            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide block">
              Séances Payables
            </span>
            <span className="text-2xl font-black text-blue-950 font-mono block mt-0.5">
              {totalPayableLessons > 0 ? totalPayableLessons : totalPaidSessions}
            </span>
            <span className="text-[10px] text-blue-700 font-semibold block">
              {totalRetroactiveLessons > 0
                ? `dont ${totalRetroactiveLessons} régul. mois passé`
                : "présences + absences"}
            </span>
          </div>

          {totalRetroactiveLessons > 0 && (
            <div className="bg-purple-50 border-2 border-purple-400 p-2.5 rounded-md">
              <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wide block">
                Régul. Mois Passé
              </span>
              <span className="text-2xl font-black text-purple-950 font-mono block mt-0.5">
                {totalRetroactiveLessons}
              </span>
              <span className="text-[10px] text-purple-700 font-semibold block">
                séances payables
              </span>
            </div>
          )}

          <div className="bg-white border border-gray-200 p-2.5 rounded-md">
            <span className="text-[11px] font-semibold text-gray-600 block">
              Séances de Cours
            </span>
            <span className="text-2xl font-bold text-gray-900 font-mono block mt-0.5">
              {totalCourseSessions > 0 ? totalCourseSessions : totalPaidSessions}
            </span>
            <span className="text-[10px] text-gray-500 block">
              {totalFreeSessions > 0
                ? `dont ${totalFreeSessions} gratuite${totalFreeSessions > 1 ? "s" : ""}`
                : "dispensées"}
            </span>
          </div>

          <div className="bg-white border border-gray-200 p-2.5 rounded-md">
            <span className="text-[11px] font-semibold text-gray-600 block">
              Rémunération Cours
            </span>
            <span className="text-base font-bold text-gray-900 font-mono block mt-1">
              {formatDZD(effectiveCoursesGross)}
            </span>
            <span className="text-[10px] text-gray-500 block">
              brut des séances
            </span>
          </div>

          <div className="bg-blue-900 text-white p-2.5 rounded-md border border-blue-950">
            <span className="text-[11px] font-bold text-blue-100 uppercase tracking-wider block">
              Net à Payer
            </span>
            <span className="text-base font-black text-white font-mono block mt-1">
              {formatDZD(Number(data.netAmount))}
            </span>
            <span className="text-[10px] text-blue-200 block">
              net de déductions
            </span>
          </div>
        </div>
      )}

      {/* Three-Month Salary Growth Column Graph */}
      {showSalaryGrowth && data.salaryHistory && data.salaryHistory.length > 0 && (() => {
        const history = data.salaryHistory.slice(-3);
        const maxGross = Math.max(...history.map((m) => Number(m.grossAmount || 0)), 0);
        const niceMax = computeNiceAxisMax(maxGross);

        const firstPt = history[0];
        const secondPt = history.length > 1 ? history[1] : null;
        const lastPt = history[history.length - 1];

        let overallBadgeText = '0 DZD sur 3 mois';
        let overallBadgeStyle: React.CSSProperties = {
          backgroundColor: '#f1f5f9',
          color: '#475569',
          border: '1px solid #cbd5e1',
        };

        if (history.length >= 2) {
          const basePt = firstPt.grossAmount > 0 ? firstPt : secondPt && secondPt.grossAmount > 0 ? secondPt : null;
          const periodTag = basePt === firstPt && history.length === 3 ? 'sur 3 mois' : 'vs mois préc.';
          if (basePt && basePt !== lastPt && basePt.grossAmount > 0) {
            const diff = Math.round((lastPt.grossAmount - basePt.grossAmount) * 100) / 100;
            const pct = Math.round(((lastPt.grossAmount - basePt.grossAmount) / basePt.grossAmount) * 1000) / 10;
            if (diff > 0) {
              overallBadgeText = `▲ ${formatGrowthPct(pct)} (${diff > 0 ? '+' : ''}${formatDZD(diff)} ${periodTag})`;
              overallBadgeStyle = {
                backgroundColor: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #6ee7b7',
              };
            } else if (diff < 0) {
              overallBadgeText = `▼ ${formatGrowthPct(pct)} (${formatDZD(diff)} ${periodTag})`;
              overallBadgeStyle = {
                backgroundColor: '#fff1f2',
                color: '#9f1239',
                border: '1px solid #fda4af',
              };
            } else {
              overallBadgeText = `= Stable 0% (${periodTag})`;
            }
          } else if (lastPt.grossAmount > 0) {
            overallBadgeText = '1er mois rémunéré';
            overallBadgeStyle = {
              backgroundColor: '#eff6ff',
              color: '#1e40af',
              border: '1px solid #93c5fd',
            };
          }
        }

        const svgWidth = 680;
        const svgHeight = 182;
        const plotLeft = 76;
        const plotRight = 656;
        const plotWidth = plotRight - plotLeft;
        const plotTop = 28;
        const plotBottom = 150;
        const plotHeight = plotBottom - plotTop;
        const slotWidth = plotWidth / Math.max(1, history.length);
        const barWidth = 76;
        const tickRatios = [0, 0.25, 0.5, 0.75, 1];

        const barPalette = [
          { fill: '#94a3b8', stroke: '#64748b', text: '#334155' },
          { fill: '#3b82f6', stroke: '#2563eb', text: '#1d4ed8' },
          { fill: '#1e3a8a', stroke: '#172554', text: '#1e3a8a' },
        ];

        return (
          <div
            className="avoid-break mb-6 rounded-lg border border-gray-300 bg-white overflow-hidden"
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              marginBottom: '24px',
              overflow: 'hidden',
            }}
          >
            {/* Graph Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '12.5px',
                    fontWeight: 800,
                    color: '#111827',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Évolution Salariale sur les 3 Derniers Mois
                </h2>
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '10.5px',
                    color: '#6b7280',
                  }}
                >
                  Comparaison mensuelle de la rémunération brute et taux de croissance
                </p>
              </div>
              <span
                className="font-mono"
                style={{
                  ...overallBadgeStyle,
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '3px 9px',
                  borderRadius: '9999px',
                  whiteSpace: 'nowrap',
                }}
              >
                {overallBadgeText}
              </span>
            </div>

            {/* Crisp Vector SVG Column Chart */}
            <div style={{ padding: '8px 12px 4px 12px', backgroundColor: '#ffffff' }}>
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width="100%"
                height={svgHeight}
                role="img"
                aria-label="Graphique en colonnes de la croissance salariale sur les trois derniers mois"
                style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '188px' }}
              >
                {/* Y-axis unit caption */}
                <text
                  x={plotLeft - 8}
                  y={14}
                  textAnchor="end"
                  fontSize="9"
                  fontWeight="700"
                  fill="#64748b"
                >
                  DZD
                </text>

                {/* Horizontal Gridlines & Y-Axis Ticks */}
                {tickRatios.map((ratio, tIdx) => {
                  const y = plotBottom - ratio * plotHeight;
                  const val = niceMax * ratio;
                  const isZero = ratio === 0;
                  return (
                    <g key={tIdx}>
                      <line
                        x1={plotLeft}
                        y1={y}
                        x2={plotRight}
                        y2={y}
                        stroke={isZero ? '#9ca3af' : '#e5e7eb'}
                        strokeWidth={isZero ? '1.25' : '1'}
                        strokeDasharray={isZero ? undefined : '4 3'}
                      />
                      <text
                        x={plotLeft - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize="9.5"
                        fontWeight="600"
                        fill="#6b7280"
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                      >
                        {formatAxisTick(val)}
                      </text>
                    </g>
                  );
                })}

                {/* Columns, Value Labels & Growth Pills */}
                {history.map((pt, idx) => {
                  const paletteIdx = history.length === 3 ? idx : Math.min(2, idx + (3 - history.length));
                  const colors = barPalette[paletteIdx];
                  const cx = plotLeft + slotWidth * idx + slotWidth / 2;
                  const barX = cx - barWidth / 2;
                  const gross = Math.max(0, Number(pt.grossAmount || 0));
                  const rawH = niceMax > 0 ? (gross / niceMax) * plotHeight : 0;
                  const barH = gross > 0 ? Math.max(4, rawH) : 0;
                  const barY = plotBottom - barH;
                  const anchorTopY = gross > 0 ? barY : plotBottom - 3;
                  const valY = anchorTopY - 7;

                  // Determine MoM growth pill for columns after the first
                  let pillLabel: string | null = null;
                  let pillBg = '#f1f5f9';
                  let pillBorder = '#cbd5e1';
                  let pillText = '#475569';

                  if (idx > 0) {
                    if (pt.growthRate !== null) {
                      if (pt.growthRate > 0) {
                        pillLabel = `▲ ${formatGrowthPct(pt.growthRate)}`;
                        pillBg = '#ecfdf5';
                        pillBorder = '#6ee7b7';
                        pillText = '#065f46';
                      } else if (pt.growthRate < 0) {
                        pillLabel = `▼ ${formatGrowthPct(pt.growthRate)}`;
                        pillBg = '#fff1f2';
                        pillBorder = '#fda4af';
                        pillText = '#9f1239';
                      } else {
                        pillLabel = '= 0%';
                      }
                    } else if (gross > 0) {
                      pillLabel = 'Nouveau';
                      pillBg = '#eff6ff';
                      pillBorder = '#93c5fd';
                      pillText = '#1e40af';
                    }
                  }

                  const pillWidth = 68;
                  const pillHeight = 15;
                  const pillY = valY - 26;

                  return (
                    <g key={pt.monthKey || idx}>
                      {gross > 0 ? (
                        <path
                          d={buildRoundedTopBarPath(barX, barY, barWidth, barH, 5)}
                          fill={colors.fill}
                          stroke={colors.stroke}
                          strokeWidth="1"
                        />
                      ) : (
                        <rect
                          x={barX}
                          y={plotBottom - 3}
                          width={barWidth}
                          height={3}
                          rx={1.5}
                          fill="#cbd5e1"
                        />
                      )}

                      {/* Growth badge above bar */}
                      {pillLabel && (
                        <g>
                          <rect
                            x={cx - pillWidth / 2}
                            y={pillY}
                            width={pillWidth}
                            height={pillHeight}
                            rx={7.5}
                            fill={pillBg}
                            stroke={pillBorder}
                            strokeWidth="1"
                          />
                          <text
                            x={cx}
                            y={pillY + 10.5}
                            textAnchor="middle"
                            fontSize="9"
                            fontWeight="800"
                            fill={pillText}
                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                          >
                            {pillLabel}
                          </text>
                        </g>
                      )}

                      {/* Exact Gross Amount above column */}
                      <text
                        x={cx}
                        y={valY}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="800"
                        fill={colors.text}
                        stroke="#ffffff"
                        strokeWidth="3"
                        paintOrder="stroke"
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
                      >
                        {formatDZD(gross)}
                      </text>

                      {/* Month X-Axis Label */}
                      <text
                        x={cx}
                        y={plotBottom + 18}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight={pt.isCurrentPeriod ? '800' : '600'}
                        fill={pt.isCurrentPeriod ? '#1e3a8a' : '#374151'}
                      >
                        {pt.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 3-Column Monthly Breakdown Footer Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${history.length}, minmax(0, 1fr))`,
                borderTop: '1px solid #e5e7eb',
                backgroundColor: '#f8fafc',
                fontSize: '10.5px',
              }}
            >
              {history.map((pt, idx) => {
                const prevPt = idx > 0 ? history[idx - 1] : null;
                const delta = pt.growthDelta ?? (prevPt ? pt.grossAmount - prevPt.grossAmount : null);
                return (
                  <div
                    key={`summary_${pt.monthKey || idx}`}
                    style={{
                      padding: '7px 10px',
                      borderLeft: idx > 0 ? '1px solid #e5e7eb' : undefined,
                      backgroundColor: pt.isCurrentPeriod ? '#eff6ff' : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '2px',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color: pt.isCurrentPeriod ? '#1e3a8a' : '#1f2937',
                        }}
                      >
                        {pt.shortLabel}
                      </span>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 600,
                          color: pt.isCurrentPeriod ? '#1d4ed8' : '#6b7280',
                        }}
                      >
                        {pt.sessionsCount} séance{pt.sessionsCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '10px',
                        color: '#4b5563',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '4px',
                      }}
                    >
                      <span>Net : {formatDZD(Number(pt.netAmount || 0))}</span>
                      {idx === 0 ? (
                        <span style={{ color: '#6b7280', fontFamily: 'system-ui, sans-serif' }}>Base</span>
                      ) : delta !== null && delta !== 0 ? (
                        <span
                          style={{
                            fontWeight: 700,
                            color: delta > 0 ? '#047857' : '#be123c',
                          }}
                        >
                          {delta > 0 ? '+' : ''}
                          {formatDZD(delta)}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>0 DZD</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Section 1a: Per-Group Breakdown (Classes / Groupes) */}
      {showGroupBreakdown && groupLines.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <span>Répartition des séances par groupe / classe</span>
              <span className="text-xs font-normal text-gray-500">(Détail par groupe pédagogique)</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-800 font-bold bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                Total séances payables : {totalPayableLessons}
              </span>
              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 font-semibold">
                {groupLines.length} groupe{groupLines.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-gray-100 border border-gray-300 text-gray-700">
                <th className="p-2 border border-gray-300 font-bold">Groupe / Classe</th>
                <th className="p-2 border border-gray-300 font-bold">Succursale</th>
                <th className="p-2 border border-gray-300 font-bold text-center">
                  Séances de cours
                </th>
                <th className="p-2 border border-gray-300 font-bold text-center bg-blue-50/70 text-blue-950">
                  Séances payables
                </th>
                <th className="p-2 border border-gray-300 font-bold text-center text-orange-900 bg-orange-50/50">
                  Séances gratuites
                </th>
                <th className="p-2 border border-gray-300 font-bold text-right">Montant brut</th>
              </tr>
            </thead>
            <tbody>
              {groupLines.map((g, idx) => {
                const courseCount = g.courseSessionsCount ?? Math.max(0, g.totalSessionsCount - g.freeSessionsCount);
                const payableCount = g.payableLessonsCount ?? g.paidSessionsCount ?? 0;
                return (
                  <tr key={`${g.className}_${idx}`} className="border border-gray-200 hover:bg-gray-50/50">
                    <td className="p-2 border border-gray-200 font-bold text-gray-900">{g.className}</td>
                    <td className="p-2 border border-gray-200 text-gray-600">{g.branchName || "-"}</td>
                    <td className="p-2 border border-gray-200 text-center font-mono font-semibold text-gray-800">
                      {courseCount}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-mono font-bold text-blue-900 bg-blue-50/30 text-sm">
                      {payableCount}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-mono bg-orange-50/20">
                      {g.freeSessionsCount > 0 ? (
                        <span className="inline-block bg-orange-100 text-orange-800 font-bold px-1.5 py-0.5 rounded text-[11px] border border-orange-200">
                          {g.freeSessionsCount}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="p-2 border border-gray-200 font-mono font-bold text-right text-emerald-800">
                      {formatDZD(Number(g.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold border border-gray-300">
                <td colSpan={2} className="p-2 border border-gray-300">
                  Total tous groupes
                </td>
                <td className="p-2 border border-gray-300 text-center font-mono text-gray-900 font-bold">
                  {totalCourseSessions}
                </td>
                <td className="p-2 border border-gray-300 text-center font-mono text-blue-950 font-black text-sm bg-blue-50/70">
                  {totalPayableLessons}
                </td>
                <td className="p-2 border border-gray-300 text-center font-mono text-orange-900 bg-orange-50/50 font-black">
                  {totalFreeSessions}
                </td>
                <td className="p-2 border border-gray-300 font-mono text-emerald-900 text-right font-black">
                  {formatDZD(effectiveCoursesGross)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Section 1: Per-Branch Breakdown */}
      {showBranchBreakdown && (
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
      )}

      {/* Section 2: Detailed Paid Lessons Breakdown */}
      {showSessionDetails && paidLessons.length > 0 && (
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
                    ) : l.isFormation ? (
                      <span className="bg-teal-50 text-teal-800 text-[10px] font-medium px-1.5 py-0.5 rounded">Formation</span>
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
                  {formatDZD(paidLessonsAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Section 2b: Séances payables régularisées (Mois précédent) - Dans une case sans détails */}
      {showSessionDetails && totalRetroactiveLessons > 0 && (
        <div className="mb-6 border-2 border-purple-400 bg-purple-50/40 rounded-lg p-3.5 shadow-2xs">
          <div className="flex justify-between items-center bg-purple-900 text-white font-bold px-3 py-2 rounded-md shadow-xs">
            <span className="text-xs font-black uppercase tracking-wider">
              Séances payables régularisées (Mois précédent)
            </span>
            <span className="bg-white text-purple-950 font-black px-2.5 py-0.5 text-xs rounded-full font-mono shadow-2xs">
              {totalRetroactiveLessons} séance{totalRetroactiveLessons > 1 ? "s" : ""} payable{totalRetroactiveLessons > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-purple-950 px-3 py-2.5 font-semibold bg-white rounded border border-purple-200 mt-2">
            <span>Total des séances payables du mois passé :</span>
            <div className="text-right">
              <span className="font-mono font-black text-sm text-purple-900">
                {totalRetroactiveLessons} séance{totalRetroactiveLessons > 1 ? "s" : ""} payable{totalRetroactiveLessons > 1 ? "s" : ""}
              </span>
              {totalRetroactiveAmount > 0 && (
                <span className="ml-2 font-mono font-bold text-emerald-800 text-xs">
                  ({formatDZD(totalRetroactiveAmount)})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section 3: SEPARATED FREE LESSONS (Highlighted in ORANGE) */}
      {showFreeSessions && hasCoursesSelected && (
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
      )}

      {/* Section 3b: Teacher Absence Sessions */}
      {showTeacherAbsences && (absentLessons.length > 0 || (data.teacherAbsencesCount ?? 0) > 0) && (
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
      {includePhotocopy && data.photocopyDetails && data.photocopyDetails.length > 0 && (
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
      {includeBooks && data.bookRevenueDetails && data.bookRevenueDetails.length > 0 && (
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

      {/* Section 4c: Salary Advances Details */}
      {includeAdvances && data.advanceDetails && data.advanceDetails.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold text-gray-700 mb-2">
            Détail des avances sur salaire déduites :
          </h2>
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-red-50 border border-red-200 text-red-900">
                <th className="p-1.5 border border-red-200 text-center w-28">Date</th>
                <th className="p-1.5 border border-red-200">Remarque / Motif</th>
                <th className="p-1.5 border border-red-200 text-right w-36">Montant déduit</th>
              </tr>
            </thead>
            <tbody>
              {data.advanceDetails.map((adv, idx) => (
                <tr key={idx} className="border border-gray-200">
                  <td className="p-1.5 border border-gray-200 text-center font-mono">{formatDate(adv.date)}</td>
                  <td className="p-1.5 border border-gray-200 text-gray-800">
                    {adv.remarque ? (
                      <span className="font-medium text-gray-900">{adv.remarque}</span>
                    ) : (
                      <span className="text-gray-400 italic">Avance sur salaire</span>
                    )}
                  </td>
                  <td className="p-1.5 border border-gray-200 font-mono text-red-700 text-right font-bold">
                    - {formatDZD(Number(adv.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-red-100 font-bold text-red-950">
                <td colSpan={2} className="p-1.5 border border-red-200">
                  Total des avances sur salaire déduites
                </td>
                <td className="p-1.5 border border-red-200 text-right font-mono font-black text-red-700">
                  - {formatDZD(Number(data.advances))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Section 5: Final Consolidated Net Calculation & Signatures kept intact across page breaks */}
      <div className="avoid-break">
        <div className="border-2 border-gray-900 rounded-lg p-4 bg-gray-50 mb-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 border-b border-gray-300 pb-1">
            Calcul du Net à Payer :
          </h2>
          {(() => {
            let stepIndex = 0;
            const showCoursesRow = hasCoursesSelected || effectiveCoursesGross > 0;
            const showBooksRow = includeBooks && effectiveBookRevenue > 0;
            return (
              <div className="space-y-2 text-sm">
                {showCoursesRow && (
                  <div className="flex justify-between items-center gap-2 text-gray-800">
                    <span className="font-semibold">{++stepIndex}. Rémunération des cours :</span>
                    <span className="font-mono font-bold text-base whitespace-nowrap shrink-0">
                      {formatDZD(effectiveCoursesGross)}
                    </span>
                  </div>
                )}

                {showBooksRow && (
                  <div className="flex justify-between items-center gap-2 text-purple-900 font-semibold">
                    <span>
                      {showCoursesRow
                        ? "+ Vente de livres (100% Enseignant) :"
                        : `${++stepIndex}. Vente de livres (100% Enseignant) :`}
                    </span>
                    <span className="font-mono font-bold text-purple-900 whitespace-nowrap shrink-0">
                      {showCoursesRow ? "+ " : ""}{formatDZD(effectiveBookRevenue)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center gap-2 text-gray-900 border-t border-gray-200 pt-1 font-bold">
                  <span>Total Brut :</span>
                  <span className="font-mono font-bold whitespace-nowrap shrink-0">
                    {formatDZD(Number(data.grossAmount))}
                  </span>
                </div>

                {includeAdvances && (
                  <div className="flex justify-between items-center gap-2 text-red-700">
                    <div>
                      <span>{++stepIndex}. Déduction des avances sur salaire :</span>
                      {data.advanceDetails && data.advanceDetails.length === 1 && data.advanceDetails[0].remarque && (
                        <span className="text-xs text-gray-600 ml-2 italic">({data.advanceDetails[0].remarque})</span>
                      )}
                    </div>
                    <span className="font-mono font-semibold whitespace-nowrap shrink-0">
                      - {formatDZD(Number(data.advances))}
                    </span>
                  </div>
                )}

                {includePhotocopy && (
                  <div className="flex justify-between items-center gap-2 text-amber-800">
                    <span>{++stepIndex}. Déduction des frais de photocopie :</span>
                    <span className="font-mono font-semibold whitespace-nowrap shrink-0">
                      - {formatDZD(Number(data.photocopyDeductions))}
                    </span>
                  </div>
                )}

                <div className="border-t-2 border-dashed border-gray-900 pt-2 mt-2 flex justify-between items-center gap-2 text-lg font-black text-gray-900 bg-white p-3 rounded border">
                  <span>Net à payer :</span>
                  <span className="font-mono text-blue-900 text-xl whitespace-nowrap shrink-0">
                    {formatDZD(Number(data.netAmount))}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 pt-5 border-t border-gray-300 text-center text-xs">
          <div>
            <p className="font-bold text-gray-700 mb-10">Signature de l&apos;enseignant(e)</p>
            <p className="text-gray-400">...................................................</p>
          </div>
          <div>
            <p className="font-bold text-gray-700 mb-10">Cachet et signature de l&apos;administration</p>
            <p className="text-gray-400">...................................................</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PayslipTicket;
