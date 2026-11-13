"use client";

import React from "react";
import DiscrepancyActions from "./DiscrepancyActions";

interface SurplusMoneyActionsProps {
  id: number;
  status: string;
  amount?: number;
  reason?: string | null;
  date?: string | Date | null;
  branchId?: number;
  branches?: Array<{ id: number; name: string }>;
}

export default function SurplusMoneyActions(props: SurplusMoneyActionsProps) {
  return <DiscrepancyActions type="SURPLUS" {...props} />;
}
