"use client";

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { WorkshopTicket } from './printable/WorkshopTicket';
import { Workshop, WorkshopParticipant, WorkshopPayment } from "@prisma/client";
import Image from 'next/image';

type PrintButtonProps = {
    payment: WorkshopPayment & { participant: WorkshopParticipant, workshop: Workshop };
    amountOwedByParticipant: number;
};

const PrintWorkshopTicketButton = ({ payment, amountOwedByParticipant }: PrintButtonProps) => {

  const handlePrint = () => {
    const printContent = ReactDOMServer.renderToString(
      <WorkshopTicket 
        payment={payment} 
        amountOwedByParticipant={amountOwedByParticipant}
      />
    );

    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Workshop Receipt</title>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body>
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
        onClick={handlePrint} 
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300"
        title="Print Receipt"
      >
        <Image src="/print.png" alt="Print" width={14} height={14} />
      </button>
    </div>
  );
};

export default PrintWorkshopTicketButton;
