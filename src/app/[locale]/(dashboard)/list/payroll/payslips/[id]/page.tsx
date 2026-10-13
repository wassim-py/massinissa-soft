import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PayrollPayslipRedirect(props: PageProps) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (typeof v === "string") query.set(k, v);
  }
  const qs = query.toString();
  redirect(`/list/finance/payslips/${params.id}${qs ? `?${qs}` : ""}`);
}
