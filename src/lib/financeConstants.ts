export const FINANCE_SECTIONS = [
  { id: "PHOTOCOPY_DEDUCTIONS", labelFr: "Déductions Photocopies Enseignants", labelAr: "اقتطاعات تصوير الأساتذة" },
  { id: "FORMATION_INCOMES", labelFr: "Revenus Formations & Dawarat", labelAr: "مداخيل الدورات والتكوينات" },
  { id: "INSCRIPTION_FEES", labelFr: "Frais d'Inscription", labelAr: "حقوق التسجيل" },
  { id: "FORMATION_BOOKS", labelFr: "Livres de Formation / Manuels", labelAr: "كتب التكوين والكتيبات" },
  { id: "CAISSE_NOIRE", labelFr: "Caisse Noire", labelAr: "الصندوق الأسود / صندوق الطوارئ" },
  { id: "GENERAL_TREASURY", labelFr: "Trésorerie Générale / Caisse Principale", labelAr: "الخزينة العامة / الصندوق الرئيسي" },
];

export const OUTCOME_FUNDING_SOURCES = [
  "SCHOOL_MONTH_BENEFICE",
  "INSCRIPTION_FEES",
  "CAISSE_NOIRE",
] as const;

export type OutcomeFundingSource = (typeof OUTCOME_FUNDING_SOURCES)[number];

export function normalizeOutcomeFundingSource(value?: string | null): OutcomeFundingSource {
  if (
    value === "INSCRIPTION_FEES" ||
    value === "CAISSE_NOIRE" ||
    value === "SCHOOL_MONTH_BENEFICE"
  ) {
    return value;
  }
  return "SCHOOL_MONTH_BENEFICE";
}

export function getOutcomeFundingSourceMeta(source?: string | null, locale: string = "fr") {
  const normalized = normalizeOutcomeFundingSource(source);
  const isAr = locale === "ar";
  switch (normalized) {
    case "INSCRIPTION_FEES":
      return {
        value: normalized,
        label: isAr ? "رسوم التسجيل" : "Frais d'inscription",
        shortLabel: isAr ? "التسجيل" : "Inscription",
        badgeVariant: "success" as const,
        pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    case "CAISSE_NOIRE":
      return {
        value: normalized,
        label: isAr ? "الصندوق الأسود (Caisse Noire)" : "Caisse Noire",
        shortLabel: isAr ? "الصندوق الأسود" : "Caisse Noire",
        badgeVariant: "secondary" as const,
        pillClass: "bg-amber-50 text-amber-800 border-amber-200",
      };
    case "SCHOOL_MONTH_BENEFICE":
    default:
      return {
        value: "SCHOOL_MONTH_BENEFICE" as const,
        label: isAr ? "أرباح الشهر للمدرسة" : "Bénéfice mensuel de l'école",
        shortLabel: isAr ? "أرباح الشهر" : "Bénéfice du mois",
        badgeVariant: "primary" as const,
        pillClass: "bg-blue-50 text-blue-700 border-blue-200",
      };
  }
}
