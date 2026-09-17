import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-tajawal)",
          "var(--font-inter)",
          "Tajawal",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        // === SEMANTIC DESIGN SYSTEM PALETTE ===
        // Primary Brand (Sky / Blue)
        primary: {
          DEFAULT: "#0284c7", // sky-600
          hover: "#0369a1", // sky-700
          light: "#EDF9FD", // light background tint
          soft: "#C3EBFA", // soft pill / badge / accent (previously wsmSky)
          foreground: "#FFFFFF",
        },
        // Secondary Brand (Purple / Lavender)
        secondary: {
          DEFAULT: "#6366F1", // indigo-500
          hover: "#4F46E5", // indigo-600
          light: "#F1F0FF", // light background tint
          soft: "#CFCEFF", // soft pill / badge (previously wsmPurple)
          foreground: "#FFFFFF",
        },
        // Accent (Amber / Warm Yellow)
        accent: {
          DEFAULT: "#F59E0B", // amber-500
          hover: "#D97706", // amber-600
          light: "#FEFCE8", // light background tint
          soft: "#FAE27C", // soft pill / badge (previously wsmYellow)
          foreground: "#1F2937",
        },
        // Status & Feedback Colors
        success: {
          DEFAULT: "#10B981", // emerald-500
          hover: "#059669",
          light: "#ECFDF5",
          soft: "#D1FAE5",
          text: "#065F46",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#F59E0B", // amber-500
          hover: "#D97706",
          light: "#FFFBEB",
          soft: "#FEF3C7",
          text: "#92400E",
          foreground: "#FFFFFF",
        },
        danger: {
          DEFAULT: "#EF4444", // red-500
          hover: "#DC2626",
          light: "#FEF2F2",
          soft: "#FEE2E2",
          text: "#991B1B",
          foreground: "#FFFFFF",
        },
        // Surfaces & Backgrounds
        surface: "#FFFFFF",
        "surface-muted": "#F9FAFB",
        "surface-subtle": "#F3F4F6",
        background: "#F7F8FA",
        "background-subtle": "#F3F4F6",

        // Borders & Dividers
        border: "#E5E7EB",
        "border-light": "#F3F4F6",
        "border-subtle": "#F0F2F5",
        "border-focus": "#0284c7",
        // Text & Typography colors
        muted: {
          DEFAULT: "#6B7280", // gray-500
          light: "#9CA3AF", // gray-400
          dark: "#374151", // gray-700
          foreground: "#4B5563", // gray-600
        },

        // === BACKWARD COMPATIBILITY ALIASES (Legacy Lama / WSM names) ===
        wsmSky: "#C3EBFA",
        wsmSkyLight: "#EDF9FD",
        wsmPurple: "#CFCEFF",
        wsmPurpleLight: "#F1F0FF",
        wsmYellow: "#FAE27C",
        wsmYellowLight: "#FEFCE8",
        lamaSky: "#C3EBFA",
        lamaSkyLight: "#EDF9FD",
        lamaPurple: "#CFCEFF",
        lamaPurpleLight: "#F1F0FF",
        lamaYellow: "#FAE27C",
        lamaYellowLight: "#FEFCE8",
      },
      fontSize: {
        // === SEMANTIC TYPOGRAPHY SCALE ===
        "page-title": ["1.75rem", { lineHeight: "2.25rem", fontWeight: "700" }], // 28px
        "section-title": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }], // 20px
        "card-title": ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }], // 16px
        "table-header": ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "600" }], // 13px
        "table-body": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }], // 14px
        "form-label": ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "500" }], // 13px
        "form-helper": ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }], // 12px
        badge: ["0.75rem", { lineHeight: "1rem", fontWeight: "500" }], // 12px
      },
    },
  },
  plugins: [],
};
export default config;
