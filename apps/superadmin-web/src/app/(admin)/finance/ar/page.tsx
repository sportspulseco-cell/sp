import { redirect } from "next/navigation";

// Old address of the invoices list. Keeps the filters in the query string.
export default async function ARRedirect({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== undefined) params.append(key, v);
    }
  }
  const qs = params.toString();
  redirect(qs ? `/finance?${qs}` : "/finance");
}
