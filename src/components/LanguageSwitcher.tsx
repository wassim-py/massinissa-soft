"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useTransition } from "react";

const FlagFR = () => (
  <svg
    className="w-5 h-3.5 rounded-xs shadow-xs flex-shrink-0"
    viewBox="0 0 640 480"
  >
    <g fillRule="evenodd" strokeWidth="1pt">
      <path fill="#fff" d="M0 0h640v480H0z" />
      <path fill="#00267f" d="M0 0h213.3v480H0z" />
      <path fill="#f31830" d="M426.7 0H640v480H426.7z" />
    </g>
  </svg>
);

const FlagDZ = () => (
  <svg
    className="w-5 h-3.5 rounded-xs shadow-xs flex-shrink-0"
    viewBox="0 0 640 480"
  >
    <rect width="320" height="480" fill="#006633" />
    <rect x="320" width="320" height="480" fill="#ffffff" />
    <circle cx="320" cy="240" r="110" fill="#d21034" />
    <circle cx="350" cy="240" r="88" fill="#ffffff" />
    <polygon
      points="320,195 330,225 362,225 336,244 346,274 320,255 294,274 304,244 278,225 310,225"
      fill="#d21034"
    />
  </svg>
);

const languages = [
  {
    code: "fr",
    name: "Français",
    flag: <FlagFR />,
  },
  {
    code: "ar",
    name: "العربية",
    flag: <FlagDZ />,
  },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang =
    languages.find((lang) => lang.code === locale) || languages[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchLocale = (newLocale: "fr" | "ar") => {
    if (newLocale === locale) {
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    startTransition(() => {
      const params = searchParams.toString();
      const url = params ? `${pathname}?${params}` : pathname;
      router.replace(url, { locale: newLocale });
    });
  };

  return (
    <div className="relative inline-block text-start" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 shadow-xs transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {currentLang.flag}
        <span className="font-semibold text-gray-800">{currentLang.name}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute end-0 mt-1.5 w-36 rounded-md bg-white shadow-lg ring-1 ring-black/5 z-50 py-1 divide-y divide-gray-100">
          {languages.map((lang) => {
            const isSelected = lang.code === locale;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => switchLocale(lang.code as "fr" | "ar")}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                  isSelected
                    ? "bg-blue-50 text-blue-700 font-bold"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  {lang.flag}
                  <span>{lang.name}</span>
                </div>
                {isSelected && (
                  <svg
                    className="w-3.5 h-3.5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
