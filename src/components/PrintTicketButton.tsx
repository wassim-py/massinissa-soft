"use client";

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { PaymentTicket } from './printable/PaymentTicket';
import { Payment, Student, Class } from "@prisma/client";
import Image from 'next/image';

// --- UPDATED ---
// The props type now includes the calculated values.
type PrintButtonProps = {
    payment: Payment & { student: Student, class: Class };
    sessionsForThisPayment: number;
    amountOwedByStudent: number;
};

const PrintTicketButton = ({ payment, sessionsForThisPayment, amountOwedByStudent }: PrintButtonProps) => {

  const handlePrint = () => {
    // --- UPDATED ---
    // The calculated values are now passed to the PaymentTicket component.
    const printContent = ReactDOMServer.renderToString(
      <PaymentTicket 
        payment={payment} 
        sessionsForThisPayment={sessionsForThisPayment}
        amountOwedByStudent={amountOwedByStudent}
      />
    );

    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Receipt</title>
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

export default PrintTicketButton;
