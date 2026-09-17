import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PayrollRedirectPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const params = new URLSearchParams();
  params.set("section", "payroll");

  for (const [key, val] of Object.entries(searchParams)) {
    if (val && typeof val === "string" && key !== "section") {
      params.set(key, val);
    }
  }

  redirect(`/list/finance?${params.toString()}`);
}
