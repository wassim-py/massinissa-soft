import { auth as clerkAuth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";

/**
 * Custom auth() helper that defaults treatPendingAsSignedOut to false,
 * allowing users whose sessions are in 'pending' status (e.g., created
 * in Clerk Dashboard without verified email) to access protected pages.
 */
export async function auth(opts?: Parameters<typeof clerkAuth>[0]) {
  return clerkAuth({ treatPendingAsSignedOut: false, ...opts });
}

/**
 * Custom currentUser() helper that defaults treatPendingAsSignedOut to false.
 */
export async function currentUser(opts?: Parameters<typeof clerkCurrentUser>[0]) {
  return clerkCurrentUser({ treatPendingAsSignedOut: false, ...opts });
}
