"use client";

import React from "react";
import DiscrepancyActions from "./DiscrepancyActions";

interface MissingMoneyActionsProps {
  id: number;
  status: string;
  amount?: number;
  reason?: string | null;
  date?: string | Date | null;
  branchId?: number;
  branches?: Array<{ id: number; name: string }>;
}

export default function MissingMoneyActions(props: MissingMoneyActionsProps) {
  return <DiscrepancyActions type="MISSING" {...props} />;
}
