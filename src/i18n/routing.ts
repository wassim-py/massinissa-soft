import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'ar'],
  defaultLocale: 'fr',
  localePrefix: 'always',
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 365 * 24 * 60 * 60, // 1 year persistence
    sameSite: 'lax',
    path: '/',
  },
});

export type Locale = (typeof routing.locales)[number];
