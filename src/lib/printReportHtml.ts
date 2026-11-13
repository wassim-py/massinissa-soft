export interface PrintableReportHtmlOptions {
  title: string;
  contentHtml: string;
  isAr: boolean;
  locale: string;
  origin: string;
  toolbarTitle?: string;
  toolbarBadge?: string;
  includeToolbar?: boolean;
  includeDownloadButton?: boolean;
  downloadFilename?: string;
  autoPrint?: boolean;
  closeAfterPrint?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shared A4 portrait stylesheet injected into standalone print windows,
 * preview modal iframes, and downloadable .html report exports.
 */
export const A4_PRINT_BASE_CSS = `
  *, *::before, *::after {
    box-sizing: border-box;
  }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important;
    font-variant-numeric: tabular-nums;
  }
  [dir="rtl"],
  [dir="rtl"] .font-mono {
    font-family: 'Tajawal', system-ui, -apple-system, sans-serif !important;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    font-family: system-ui, -apple-system, sans-serif;
    background-color: #ffffff;
    color: #000000;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .print-sheet-wrapper {
    width: 100%;
    padding: 18px;
  }
  .avoid-teacher-split {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .avoid-break {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .avoid-break-before {
    break-before: avoid;
    page-break-before: avoid;
  }
  .avoid-break-after {
    break-after: avoid;
    page-break-after: avoid;
  }
  @media print {
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    html, body {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background-color: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .no-print {
      display: none !important;
    }
    .print-sheet-wrapper {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .master-owner-payroll-container,
    .owner-teacher-consolidation-container,
    .payslip-container,
    .global-finance-report-container,
    .real-net-container,
    .school-share-container,
    .staff-payslip-container {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-row-group;
    }
    tr,
    .avoid-break,
    .avoid-teacher-split {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .avoid-break-before {
      break-before: avoid;
      page-break-before: avoid;
    }
    .avoid-break-after {
      break-after: avoid;
      page-break-after: avoid;
    }
    h1, h2, h3, p {
      orphans: 3;
      widows: 3;
    }
  }
  /* Essential layout fallbacks if Tailwind CDN is slow or offline */
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #9ca3af; padding: 5px 8px; }
  th { background-color: #e5e7eb; }
  .flex { display: flex; }
  .justify-between { justify-content: space-between; }
  .items-center { align-items: center; }
  .items-end { align-items: flex-end; }
  .grid { display: grid; }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gap-3 { gap: 0.75rem; }
  .gap-4 { gap: 1rem; }
`;

/**
 * Builds a complete standalone A4-ready HTML document for report popups,
 * modal preview iframes, and offline .html downloads.
 */
export function buildPrintableReportHtml(options: PrintableReportHtmlOptions): string {
  const {
    title,
    contentHtml,
    isAr,
    locale,
    origin,
    toolbarTitle = title,
    toolbarBadge,
    includeToolbar = true,
    includeDownloadButton = false,
    downloadFilename = "rapport-financier.html",
    autoPrint = true,
    closeAfterPrint = false,
  } = options;

  const safeTitle = escapeHtml(title);
  const safeOrigin = escapeHtml(origin || "");
  const safeToolbarTitle = escapeHtml(toolbarTitle);
  const safeToolbarBadge = toolbarBadge ? escapeHtml(toolbarBadge) : "";
  const safeFilename = downloadFilename.replace(/[^0-9A-Za-z._-]/g, "");

  return `<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8">
    ${safeOrigin ? `<base href="${safeOrigin}/">` : ""}
    <title>${safeTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>${A4_PRINT_BASE_CSS}</style>
  </head>
  <body>
    ${includeToolbar ? `<div class="no-print" style="position: sticky; top: 0; z-index: 9999; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 700; font-size: 14px; letter-spacing: 0.3px;">${safeToolbarTitle}</span>
        ${safeToolbarBadge ? `<span style="font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.16); padding: 2px 8px; border-radius: 9999px;">${safeToolbarBadge}</span>` : ""}
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        ${includeDownloadButton ? `<button onclick="downloadReport()" style="background: #2563eb; color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 8px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          ⬇️ ${isAr ? "تحميل التقرير (HTML)" : "Télécharger (.html)"}
        </button>` : ""}
        <button onclick="window.print()" style="background: #059669; color: #ffffff; border: none; font-weight: 700; font-size: 13px; padding: 8px 18px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
          🖨️ ${isAr ? "طباعة / حفظ كـ PDF" : "Imprimer / Enregistrer en PDF"}
        </button>
        <button onclick="window.close()" style="background: rgba(255,255,255,0.12); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 8px; cursor: pointer;">
          ✕ ${isAr ? "إغلاق" : "Fermer"}
        </button>
      </div>
    </div>` : ""}

    <div class="print-sheet-wrapper">
      ${contentHtml}
    </div>

    <script data-report-script>
      ${includeDownloadButton ? `function downloadReport() {
        try {
          var clone = document.documentElement.cloneNode(true);
          var scripts = clone.querySelectorAll('script[data-report-script]');
          for (var i = 0; i < scripts.length; i++) scripts[i].remove();
          var blob = new Blob(['<!DOCTYPE html>' + clone.outerHTML], { type: 'text/html;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '${safeFilename}';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        } catch (e) {
          console.error("Download error:", e);
        }
      }` : ""}
      ${autoPrint ? `
      function triggerPrint() {
        if (window.__reportPrinted) return;
        window.__reportPrinted = true;
        var waitFonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        waitFonts.then(function() {
          setTimeout(function() {
            try {
              window.focus();
              window.print();
              ${closeAfterPrint ? "window.close();" : ""}
            } catch (e) {
              console.error("Auto-print error:", e);
            }
          }, 450);
        });
      }
      if (document.readyState === 'complete') {
        triggerPrint();
      } else {
        window.addEventListener('load', triggerPrint);
      }` : ""}
    </script>
  </body>
</html>`;
}
