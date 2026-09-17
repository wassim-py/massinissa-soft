import { clerkMiddleware, createRouteMatcher, createClerkClient } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { routeAccessMap } from "./lib/settings";
import { NextResponse } from "next/server";

const handleI18nRouting = createIntlMiddleware(routing);

// Match both root-relative and locale-prefixed routes for each entry in routeAccessMap
const matchers = Object.keys(routeAccessMap).map((route) => ({
  matcher: createRouteMatcher([route, `/:locale${route}`]),
  allowedRoles: routeAccessMap[route],
}));

export default clerkMiddleware(async (auth, req) => {
  // If request is for an API route, static manifest, sw, or icons, do not run i18n routing
  if (
    req.nextUrl.pathname.startsWith("/api") ||
    req.nextUrl.pathname.startsWith("/trpc") ||
    req.nextUrl.pathname === "/sw.js" ||
    req.nextUrl.pathname === "/manifest.webmanifest" ||
    req.nextUrl.pathname === "/manifest.json" ||
    req.nextUrl.pathname.startsWith("/icons/")
  ) {
    return;
  }

  const { userId, sessionClaims } = await auth({ treatPendingAsSignedOut: false });

  // Resolve role and branchIds from sessionClaims (custom JWT claim)
  let role =
    (sessionClaims?.metadata as { role?: string })?.role ||
    (sessionClaims as any)?.publicMetadata?.role ||
    (sessionClaims as any)?.role;

  let branchIds: number[] | undefined =
    (sessionClaims?.metadata as { branchIds?: number[] })?.branchIds ||
    (sessionClaims as any)?.publicMetadata?.branchIds ||
    (sessionClaims as any)?.branchIds;

  // Fallback: If logged in but role or branchIds is missing from sessionClaims, fetch from Clerk API
  if (userId && (!role || branchIds === undefined)) {
    try {
      const client = createClerkClient({
        secretKey:
          process.env.CLERK_SECRET_KEY ||
          "sk_test_Kl9ipSmhibmv01RtA6iGMMBjrdfbtgUlvShsXlKRdo",
      });
      const user = await client.users.getUser(userId);
      if (!role) role = (user.publicMetadata as { role?: string })?.role;
      if (branchIds === undefined) {
        const metaBranchIds = (user.publicMetadata as { branchIds?: number[] })?.branchIds;
        branchIds = Array.isArray(metaBranchIds) ? metaBranchIds : undefined;
      }
    } catch (e: any) {
      console.error("Error fetching Clerk user role/branch in proxy:", e?.message || e);
    }
  }

  // Detect current locale or fallback to cookie / default
  const localeMatch = req.nextUrl.pathname.match(/^\/(fr|ar)(\/|$)/);
  const currentLocale =
    localeMatch?.[1] ||
    req.cookies.get("NEXT_LOCALE")?.value ||
    routing.defaultLocale;

  const getRoleDestination = (userRole?: string, loc: string = currentLocale) => {
    const baseLocale = routing.locales.includes(loc as any) ? loc : routing.defaultLocale;
    if (!userRole) return `/${baseLocale}/admin`;
    const r = userRole.toLowerCase();
    if (r === "admin" || r === "branch_admin" || r === "branch" || r === "owner") {
      return `/${baseLocale}/admin`;
    }
    if (r === "teacher") return `/${baseLocale}/teacher`;
    if (r === "student") return `/${baseLocale}/student`;
    if (r === "parent") return `/${baseLocale}/parent`;
    return `/${baseLocale}/admin`;
  };

  const destination = getRoleDestination(role, currentLocale);

  // If already authenticated and visiting root ('/' or '/fr' or '/ar'), redirect to role destination
  const isRootOrLocaleRoot =
    req.nextUrl.pathname === "/" ||
    req.nextUrl.pathname === `/${currentLocale}` ||
    req.nextUrl.pathname === `/${currentLocale}/`;

  if (isRootOrLocaleRoot && userId && role) {
    return NextResponse.redirect(new URL(destination, req.url));
  }

  // Check role-based route permissions
  for (const { matcher, allowedRoles } of matchers) {
    if (matcher(req)) {
      // If unauthenticated, redirect to sign-in page for current locale
      const isDevTest =
        process.env.NODE_ENV !== "production" &&
        req.cookies.get("x-dev-test")?.value === "true";

      if (!userId && !isDevTest) {
        return NextResponse.redirect(new URL(`/${currentLocale}`, req.url));
      }

      // If user has a resolved role and it is NOT permitted on this route, redirect to their role page
      if (
        role &&
        !allowedRoles.some((r) => r.toLowerCase() === role.toLowerCase())
      ) {
        if (req.nextUrl.pathname !== destination) {
          return NextResponse.redirect(new URL(destination, req.url));
        }
      }
    }
  }

  // Delegate remaining requests to next-intl for localization routing and rewrites
  return handleI18nRouting(req);
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
