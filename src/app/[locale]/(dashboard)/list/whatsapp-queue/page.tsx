import React from "react";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import WhatsAppQueueClient from "@/components/whatsapp/WhatsAppQueueClient";

export const metadata = {
  title: "WhatsApp Outbox | Massinissa School",
};

export default async function WhatsAppQueuePage() {
  const session = await getAuthSession();

  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  return (
    <div className="p-4 sm:p-6 w-full">
      <WhatsAppQueueClient
        branches={branches}
        isOwner={session.isOwner}
        userBranchIds={session.branchIds}
      />
    </div>
  );
}
