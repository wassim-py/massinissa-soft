"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu as MenuIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAnnouncementNotification } from "./announcements/AnnouncementNotificationProvider";

interface MobileNavProps {
  children: React.ReactNode;
}

export default function MobileNav({ children }: MobileNavProps) {
  const t = useTranslations("common");
  const { unreadCount } = useAnnouncementNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer whenever the route / pathname changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* HAMBURGER TRIGGER BUTTON (visible only below lg breakpoint) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative lg:hidden p-2 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none shrink-0"
        aria-label={t("openMenu")}
        title={t("openMenu")}
      >
        <MenuIcon className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 rtl:right-auto rtl:left-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-80" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600 border border-white shadow-xs" />
          </span>
        )}
      </button>

      {/* PORTAL DRAWER INTO DOCUMENT BODY */}
      {mounted &&
        isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* BACKDROP OVERLAY */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
              onClick={() => setIsOpen(false)}
              aria-hidden="true"
            />

            {/* SOLID OPAQUE SLIDE-OVER DRAWER */}
            <aside
              aria-label="Mobile Navigation"
              className="fixed inset-y-0 start-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col border-e border-gray-200"
              style={{ backgroundColor: "#ffffff" }}
            >
              {/* DRAWER HEADER */}
              <div
                className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shrink-0"
                style={{ backgroundColor: "#ffffff" }}
              >
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <Image
                    src="/logo.png"
                    alt="Classty Logo"
                    width={32}
                    height={32}
                  />
                  <span className="font-bold text-xl text-gray-800 tracking-tight">
                    Classty
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer"
                  aria-label={t("closeMenu")}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* DRAWER SCROLLABLE MENU */}
              <div
                className="flex-1 overflow-y-auto p-4 bg-white"
                style={{ backgroundColor: "#ffffff" }}
                onClick={(e) => {
                  // Auto close drawer if a link was clicked
                  if ((e.target as HTMLElement).closest("a")) {
                    setIsOpen(false);
                  }
                }}
              >
                {children}
              </div>
            </aside>
          </div>,
          document.body
        )}
    </>
  );
}
