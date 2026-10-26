"use client";

import { FinanceReportsPanel, type FinanceBalances } from "@sportspulse/admin-pages";
import { finance } from "@/lib/api/browser-api";

/** Binds the shared balances + CSV export panel to the org console's SDK. */
export function FinanceReports(props: { balances: FinanceBalances; filters?: { orgId?: string } }) {
  return <FinanceReportsPanel {...props} exportReport={(q) => finance.exportReport(q)} />;
}
