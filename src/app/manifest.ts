import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Classty - Plateforme de gestion scolaire",
    short_name: "Classty",
    description: "Classty - Plateforme intégrée de gestion d'établissements scolaires",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    orientation: "portrait",
    lang: "fr",
    dir: "auto",
    categories: ["education", "productivity", "management"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    // Web manifest localized extensions for modern chromium / W3C localized manifest draft
    ...({
      name_localized: {
        fr: "Classty - Plateforme de gestion scolaire",
        ar: "Classty - منصة إدارة المدارس",
      },
      short_name_localized: {
        fr: "Classty",
        ar: "كلاستي",
      },
      description_localized: {
        fr: "Classty - Plateforme intégrée de gestion d'établissements scolaires",
        ar: "Classty - منصة متكاملة لإدارة المدارس الحديثة",
      },
    } as any),
  };
}
