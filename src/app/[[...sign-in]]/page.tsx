"use client";

import * as Clerk from "@clerk/elements/common";
import * as SignIn from "@clerk/elements/sign-in";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const LoginPage = () => {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const role = user.publicMetadata?.role;
      if (role && typeof role === "string") {
        router.replace(`/${role}`);
      }
    }
  }, [isLoaded, isSignedIn, user, router]);

  if (isLoaded && isSignedIn) {
    const role = user?.publicMetadata?.role;
    return (
      <div className="h-screen flex items-center justify-center bg-wsmSkyLight">
        <div className="bg-white p-10 rounded-md shadow-2xl flex flex-col items-center gap-4 text-center">
          <Image src="/logo.png" alt="" width={50} height={50} />
          <h1 className="text-2xl font-bold">Classty</h1>
          {role ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500">جاري توجيهك إلى لوحة التحكم...</p>
            </div>
          ) : (
            <p className="text-red-500 text-sm max-w-xs">
              تم تسجيل الدخول بنجاح، ولكن لم يتم تعيين دور (role) لحسابك في Clerk بعد. يرجى إضافة <code>{`{ "role": "admin" }`}</code> إلى بيانات المستخدم العامة (publicMetadata).
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-wsmSkyLight">
      <SignIn.Root>
        <SignIn.Step
          name="start"
          className="bg-white p-12 rounded-md shadow-2xl flex flex-col gap-2"
        >
          <h1 className="text-3xl font-bold flex items-center gap-2 mb-4">
            <Image src="/logo.png" alt="" width={50} height={50} />
            Classty
          </h1>
          <h2 className="text-gray-400">قم بتسجيل الدخول إلى حسابك.</h2>
          <Clerk.GlobalError className="text-sm text-red-400" />
          <Clerk.Field name="identifier" className="flex flex-col gap-2">
            <Clerk.Label className="text-xs text-gray-500">
              اسم المستخدم
            </Clerk.Label>
            <Clerk.Input
              type="text"
              required
              className="p-2 rounded-md ring-1 ring-gray-300"
            />
            <Clerk.FieldError className="text-xs text-red-400" />
          </Clerk.Field>
          <Clerk.Field name="password" className="flex flex-col gap-2">
            <Clerk.Label className="text-xs text-gray-500">
              كلمة المرور
            </Clerk.Label>
            <Clerk.Input
              type="password"
              required
              className="p-2 rounded-md ring-1 ring-gray-300"
            />
            <Clerk.FieldError className="text-xs text-red-400" />
          </Clerk.Field>
          <SignIn.Action
            submit
            className="text-xl font-semibold bg-blue-500 text-white my-1 rounded-md text-sm p-[10px] mt-5"
          >
            تسجيل الدخول
          </SignIn.Action>
        </SignIn.Step>
      </SignIn.Root>
    </div>
  );
};

export default LoginPage;
