"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignIn from "@clerk/elements/sign-in";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const getDashboardUrl = (role?: string) => {
  if (!role) return "/admin";
  const r = role.toLowerCase();
  if (r === "admin" || r === "branch_admin" || r === "branch" || r === "owner") {
    return "/admin";
  }
  return `/${role}`;
};

const LoginPage = () => {
  const t = useTranslations("auth");
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isLoaded && isSignedIn && user && !hasRedirected.current) {
      const role = user.publicMetadata?.role;
      hasRedirected.current = true;
      const targetUrl = getDashboardUrl(typeof role === "string" ? role : undefined);
      router.push(targetUrl);
    }
  }, [isLoaded, isSignedIn, user, router]);

  if (isLoaded && isSignedIn) {
    const role = user?.publicMetadata?.role as string | undefined;
    const targetUrl = getDashboardUrl(role);
    return (
      <div className="h-screen flex items-center justify-center bg-wsmSkyLight relative p-4">
        <div className="absolute top-4 end-4">
          <LanguageSwitcher />
        </div>
        <div className="bg-white p-10 rounded-md shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm w-full">
          <Image src="/logo.png" alt="" width={50} height={50} />
          <h1 className="text-2xl font-bold">Classty</h1>
          {role ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500">{t("redirecting")}</p>
              <button
                onClick={() => router.push(targetUrl)}
                className="text-sm text-blue-600 underline font-medium hover:text-blue-800 cursor-pointer"
              >
                {t("clickHere")}
              </button>
            </div>
          ) : (
            <p className="text-red-500 text-sm max-w-xs">
              {t("missingRole")}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-wsmSkyLight relative p-4">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <SignIn.Root>
        <SignIn.Step
          name="start"
          className="bg-white p-8 md:p-12 rounded-md shadow-2xl flex flex-col gap-2 max-w-md w-full"
        >
          <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
            <Image src="/logo.png" alt="" width={40} height={40} />
            Classty
          </h1>
          <h2 className="text-gray-400 text-sm mb-4">{t("loginSubtitle")}</h2>
          <Clerk.GlobalError className="text-sm text-red-500" />
          <Clerk.Field name="identifier" className="flex flex-col gap-2">
            <Clerk.Label className="text-xs text-gray-500">
              {t("username")}
            </Clerk.Label>
            <Clerk.Input
              type="text"
              required
              className="p-2 rounded-md ring-1 ring-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <Clerk.FieldError className="text-xs text-red-500" />
          </Clerk.Field>
          <Clerk.Field name="password" className="flex flex-col gap-2 mt-2">
            <Clerk.Label className="text-xs text-gray-500">
              {t("password")}
            </Clerk.Label>
            <Clerk.Input
              type="password"
              required
              className="p-2 rounded-md ring-1 ring-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <Clerk.FieldError className="text-xs text-red-500" />
          </Clerk.Field>
          <SignIn.Action
            submit
            className="text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md p-2.5 mt-5 transition-colors"
          >
            {t("signIn")}
          </SignIn.Action>
        </SignIn.Step>
      </SignIn.Root>
    </div>
  );
};

export default LoginPage;
