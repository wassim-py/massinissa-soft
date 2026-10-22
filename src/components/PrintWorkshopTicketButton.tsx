"use client";

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { useLocale } from 'next-intl';
import { WorkshopTicket, WorkshopTicketPayment } from './printable/WorkshopTicket';
import Image from 'next/image';

type PrintButtonProps = {
    payment: WorkshopTicketPayment;
    amountOwedByParticipant: number;
};

const PrintWorkshopTicketButton = ({ payment, amountOwedByParticipant }: PrintButtonProps) => {
  const locale = useLocale();
  const isAr = locale === "ar";

  const handlePrint = () => {
    const printContent = ReactDOMServer.renderToString(
      <WorkshopTicket 
        payment={payment} 
        amountOwedByParticipant={amountOwedByParticipant}
        locale={locale}
      />
    );

    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${locale}">
          <head>
            <meta charset="utf-8">
            <base href="${window.location.origin}/">
            <title>${isAr ? 'طباعة وصل الورشة' : 'Reçu Atelier'} ${payment.voucherDisplay ? `- ${payment.voucherDisplay}` : `#BON ${payment.id}`}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              img {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                display: inline-block !important;
              }
            </style>
          </head>
          <body class="flex justify-center p-1 m-0">
            ${printContent}
            <script>
              function triggerPrint() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                  setTimeout(function() { window.close(); }, 500);
                }, 300);
              }
              if (document.readyState === 'complete') {
                triggerPrint();
              } else {
                window.addEventListener('load', triggerPrint);
              }
            </script>
          </body>
        </html>
      `);
      
      printWindow.document.close();
    }
  };

  return (
    <div>
      <button 
        type="button"
        onClick={handlePrint} 
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition-colors cursor-pointer"
        title={isAr ? "طباعة الوصل" : "Imprimer le reçu"}
      >
        <Image src="/print.png" alt={isAr ? "طباعة" : "Imprimer"} width={14} height={14} />
      </button>
    </div>
  );
};

export default PrintWorkshopTicketButton;
