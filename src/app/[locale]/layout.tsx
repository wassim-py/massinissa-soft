import type { Metadata, Viewport } from "next";
import { Tajawal, Inter } from "next/font/google";
import "../globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { routing } from "@/i18n/routing";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isArabic = locale === "ar";
  return {
    title: isArabic
      ? "Classty - منصة إدارة المدارس"
      : "Classty - Plateforme de gestion scolaire",
    description: isArabic
      ? "Classty - منصة متكاملة لإدارة المدارس الحديثة"
      : "Classty - Plateforme intégrée de gestion d'établissements scolaires",
    applicationName: "Classty",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: isArabic ? "كلاستي" : "Classty",
      startupImage: [
        {
          url: "/icons/apple-splash.png",
        },
      ],
    },
    icons: {
      icon: [
        { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}

import AnnouncementNotificationProvider from "@/components/announcements/AnnouncementNotificationProvider";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();
  const isRtl = locale === "ar";
  const fontClass = isRtl ? tajawal.className : inter.className;

  const heads = await headers();
  const host = heads.get("x-forwarded-host") || heads.get("host") || "localhost:3000";
  const proto = heads.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const proxyUrl = `${proto}://${host}/__clerk`;
  const clerkJSUrl = `${proxyUrl}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;

  return (
    <ClerkProvider proxyUrl={proxyUrl} clerkJSUrl={clerkJSUrl}>
      <html lang={locale} dir={isRtl ? "rtl" : "ltr"}>
        <head>
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          <link rel="apple-touch-startup-image" href="/icons/apple-splash.png" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content={isRtl ? "كلاستي" : "Classty"} />
        </head>
        <body className={`${fontClass} ${tajawal.variable} ${inter.variable}`}>
          <NextIntlClientProvider messages={messages}>
            <AnnouncementNotificationProvider>
              {children}
            </AnnouncementNotificationProvider>
            <ServiceWorkerRegister />
            <ToastContainer
              position={isRtl ? "bottom-left" : "bottom-right"}
              theme="colored"
              rtl={isRtl}
            />
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
