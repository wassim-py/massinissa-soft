import type { Metadata } from "next";
// 1. Replace 'Inter' with 'Tajawal' for professional Arabic typography
import { Tajawal } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const tajawal = Tajawal({ subsets: ["arabic"], weight: ["400", "500", "700"] });
export const metadata: Metadata = {
  title: "Classty - منصة إدارة المدارس",
  description: "Classty - منصة متكاملة لإدارة المدارس الحديثة",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="ar" dir="rtl">
        <body className={tajawal.className}>
          {children} <ToastContainer position="bottom-left" theme="colored" rtl/>
        </body>
      </html>
    </ClerkProvider>
  );
}
