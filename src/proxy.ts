import { clerkMiddleware, createRouteMatcher, createClerkClient } from "@clerk/nextjs/server";
import { routeAccessMap } from "./lib/settings";
import { NextResponse } from "next/server";

const matchers = Object.keys(routeAccessMap).map((route) => ({
  matcher: createRouteMatcher([route]),
  allowedRoles: routeAccessMap[route],
}));

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth({ treatPendingAsSignedOut: false });

  // Try to resolve role from sessionClaims (custom JWT claim)
  let role = (sessionClaims?.metadata as { role?: string })?.role
    || (sessionClaims as any)?.publicMetadata?.role
    || (sessionClaims as any)?.role;

  // Fallback: If logged in but role is missing from sessionClaims, fetch from Clerk API
  if (userId && !role) {
    try {
      const client = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY || "sk_test_Kl9ipSmhibmv01RtA6iGMMBjrdfbtgUlvShsXlKRdo",
      });
      const user = await client.users.getUser(userId);
      role = (user.publicMetadata as { role?: string })?.role;
    } catch (e: any) {
      console.error("Error fetching Clerk user role in proxy:", e?.message || e);
    }
  }

  console.log("PROXY DEBUG:", { path: req.nextUrl.pathname, userId, role, metadata: (sessionClaims as any)?.metadata });

  // If already authenticated and visiting root '/', redirect to the role dashboard
  if (req.nextUrl.pathname === "/" && userId && role) {
    return NextResponse.redirect(new URL(`/${role}`, req.url));
  }

  // Match protected routes
  for (const { matcher, allowedRoles } of matchers) {
    if (matcher(req)) {
      // If unauthenticated, redirect to sign-in page
      if (!userId) {
        return NextResponse.redirect(new URL("/", req.url));
      }

      // If user has a resolved role and it is NOT permitted on this route, redirect to their own role page
      if (role && !allowedRoles.includes(role)) {
        const destination = `/${role}`;
        if (req.nextUrl.pathname !== destination) {
          return NextResponse.redirect(new URL(destination, req.url));
        }
      }
    }
  }
}, {
  secretKey: process.env.CLERK_SECRET_KEY || "sk_test_Kl9ipSmhibmv01RtA6iGMMBjrdfbtgUlvShsXlKRdo",
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_cmVhbC1idWZmYWxvLTgwOTIuY2xlcmsuYWNjb3VudHMuZGV2JA",
  debug: true,
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
