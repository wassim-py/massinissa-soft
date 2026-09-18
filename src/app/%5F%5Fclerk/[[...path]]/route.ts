import { NextRequest, NextResponse } from "next/server";

const CLERK_FAPI_HOST = "https://frontend-api.clerk.dev";
const PROD_PROXY_URL = "https://classty-massinissa-school.vercel.app/__clerk";
const PROD_ORIGIN = "https://classty-massinissa-school.vercel.app";

async function handler(req: NextRequest) {
  const subpath = req.nextUrl.pathname.replace(/^\/__clerk/, "");
  const targetUrl = new URL(subpath + req.nextUrl.search, CLERK_FAPI_HOST);

  const forwardHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") continue;
    forwardHeaders.set(key, value);
  }

  // Set Clerk proxy required headers
  forwardHeaders.set("Clerk-Proxy-Url", PROD_PROXY_URL);
  forwardHeaders.set(
    "Clerk-Secret-Key",
    process.env.CLERK_SECRET_KEY || ""
  );
  forwardHeaders.set("Origin", PROD_ORIGIN);

  const clientIp =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";
  forwardHeaders.set("X-Forwarded-For", clientIp);
  forwardHeaders.set("X-Forwarded-Proto", "https");

  let body: BodyInit | undefined = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const buffer = await req.arrayBuffer();
    if (buffer.byteLength > 0) {
      body = buffer;
    }
  }

  try {
    const clerkResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body,
      redirect: "manual",
    });

    const resHeaders = new Headers();
    const clientOrigin = req.nextUrl.origin;

    for (const [key, value] of clerkResponse.headers.entries()) {
      const lower = key.toLowerCase();
      if (
        lower === "content-encoding" ||
        lower === "content-length" ||
        lower === "transfer-encoding" ||
        lower === "connection"
      ) {
        continue;
      }
      resHeaders.set(key, value);
    }

    // Handle redirects
    const location = clerkResponse.headers.get("location");
    if (location) {
      let newLocation = location
        .replace(PROD_PROXY_URL, `${clientOrigin}/__clerk`)
        .replace(CLERK_FAPI_HOST, `${clientOrigin}/__clerk`);
      if (newLocation.startsWith("/")) {
        newLocation = `${clientOrigin}/__clerk${newLocation}`;
      }
      resHeaders.set("location", newLocation);
    }

    // Handle Set-Cookie
    const isHttp = req.nextUrl.protocol === "http:";
    const rawCookies = clerkResponse.headers.getSetCookie?.() || [];
    for (const rawCookie of rawCookies) {
      let cleaned = rawCookie.replace(/Domain=[^;]+;?\s*/gi, "");
      if (isHttp) {
        cleaned = cleaned.replace(/Secure;?\s*/gi, "");
      }
      resHeaders.append("set-cookie", cleaned.trim());
    }

    resHeaders.set("Access-Control-Allow-Origin", clientOrigin);
    resHeaders.set("Access-Control-Allow-Credentials", "true");

    const responseBody = await clerkResponse.arrayBuffer();
    return new NextResponse(responseBody, {
      status: clerkResponse.status,
      statusText: clerkResponse.statusText,
      headers: resHeaders,
    });
  } catch (error: any) {
    console.error("Clerk proxy error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Clerk proxy error", details: error?.message }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const clientOrigin = req.nextUrl.origin;
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": clientOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With, Clerk-Proxy-Url, Clerk-Secret-Key",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
