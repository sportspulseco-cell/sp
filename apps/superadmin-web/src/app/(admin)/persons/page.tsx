import { fetchAll, load } from "@sportspulse/api-client";
import { LoadError, LocalDate, EmptyState, Badge, PageHeader, TBody, TD, TH, THead, TR, Table } from "@sportspulse/ui";
import { UserCircle2 } from "lucide-react";
import Link from "next/link";
import { iam } from "@/lib/api/server-api";
import { PersonsFilters } from "@/components/persons/persons-filters";
import { CreatePersonButton } from "@/components/persons/create-person-button";

export const metadata = { title: "Persons · Super Admin" };

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const ageOf = (dob: string | null) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / YEAR_MS) : null);

export default async function PersonsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; account?: string; age?: string; country?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const personsResult = await load(
    fetchAll((cursor) => iam.listPersons({ limit: 100, cursor }))
  );
  if (!personsResult.ok) {
    console.error("[persons] listPersons failed", personsResult.status, personsResult.message);
  }
  const page = personsResult.ok
    ? personsResult.data
    : { items: [], nextCursor: null };

  const countryOptions = [...new Set(page.items.map((p) => p.countryCode).filter((c): c is string => !!c))].sort();
  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((p) => {
    if (q && !`${p.preferredName ?? ""} ${p.legalFirstName} ${p.legalLastName}`.toLowerCase().includes(q)) return false;
    if (sp.account === "linked" && !p.userId) return false;
    if (sp.account === "none" && p.userId) return false;
    const age = ageOf(p.dobDate);
    if (sp.age === "minor" && !(age !== null && age < 18)) return false;
    if (sp.age === "adult" && !(age !== null && age >= 18)) return false;
    if (sp.age === "unknown" && age !== null) return false;
    if (sp.country && (p.countryCode ?? "none") !== sp.country) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="People"
        description="Everyone the league knows about: players, coaches, officials, and minors without their own login."
        action={<CreatePersonButton />}
      />
      <PersonsFilters countries={countryOptions} />
      <p className="text-[13px] text-fg-muted">
        {shown.length === page.items.length ? `${page.items.length} people` : `${shown.length} of ${page.items.length} people`}
      </p>

      {!personsResult.ok ? (
        <LoadError
          what="persons"
          status={personsResult.status}
          message={personsResult.message}
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={UserCircle2}
          title="No persons yet"
          description="Add a person, or they appear when someone registers."
          action={<CreatePersonButton />}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={UserCircle2} title="No one matches these filters" description="Clear the search or pick another filter." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Date of birth</TH>
              <TH>Country</TH>
              <TH>Account</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((p) => {
              const display =
                p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`;
              const age = ageOf(p.dobDate);
              return (
                <TR key={p.id}>
                  <TD className="font-medium">
                    <Link
                      href={`/persons/${p.id}`}
                      className="block hover:underline"
                    >
                      {display}
                      {p.preferredName ? (
                        <span className="block text-xs text-muted-foreground">
                          {p.legalFirstName} {p.legalLastName}
                        </span>
                      ) : null}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">
                    {p.dobDate ? `${p.dobDate} (age ${age})` : "—"}
                  </TD>
                  <TD className="text-muted-foreground">
                    {p.countryCode ?? "—"}
                  </TD>
                  <TD>
                    {p.userId ? (
                      <Badge tone="success">Has account</Badge>
                    ) : (
                      <Badge>None</Badge>
                    )}
                  </TD>
                  <TD className="text-muted-foreground">
                    <LocalDate iso={p.createdAt} format="date" />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
