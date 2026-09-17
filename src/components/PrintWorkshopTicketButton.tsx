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
            <title>${isAr ? 'طباعة وصل الورشة' : 'Reçu Atelier'} ${payment.voucherDisplay ? `- ${payment.voucherDisplay}` : `#BON ${payment.id}`}</title>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="flex justify-center p-4">
            ${printContent}
          </body>
        </html>
      `);
      
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  return (
    <div>
      <button 
        type="button"
        onClick={handlePrint} 
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 cursor-pointer"
        title={isAr ? "طباعة الوصل" : "Imprimer le reçu"}
      >
        <Image src="/print.png" alt={isAr ? "طباعة" : "Imprimer"} width={14} height={14} />
      </button>
    </div>
  );
};

export default PrintWorkshopTicketButton;
