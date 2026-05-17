import { UserCircle2, Link2, Cake, Globe2 } from "lucide-react";
import Link from "next/link";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreatePersonButton } from "@/components/persons/create-person-button";

export const metadata = { title: "Persons — SportsPulse" };

export default async function PersonsPage() {
  const page = await iam.listPersons({ limit: 50 }).catch(() => ({
    items: [],
    nextCursor: null
  }));

  const total = page.items.length;
  const linked = page.items.filter((p) => p.userId).length;
  const minors = page.items.filter((p) => {
    if (!p.dobDate) return false;
    const age =
      (Date.now() - new Date(p.dobDate).getTime()) /
      (365.25 * 24 * 3600 * 1000);
    return age < 18;
  }).length;
  const countries = new Set(
    page.items.map((p) => p.countryCode).filter(Boolean)
  ).size;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="identity"
        title="Persons"
        description="Identity records for players, refs, coaches — including minors without auth accounts."
        action={<CreatePersonButton />}
      />
      <KineticStrip
        cards={[
          { label: "Total persons", value: total, icon: <UserCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Linked to account",
            value: linked,
            icon: <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: linked > 0 ? "ok" : "idle",
            hint:
              total > 0
                ? `${Math.round((linked / total) * 100)}% have auth`
                : undefined
          },
          { label: "Minors", value: minors, icon: <Cake className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "info" },
          { label: "Countries", value: countries, icon: <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" }
        ]}
      />

      {page.items.length === 0 ? (
        <EmptyState
          icon={UserCircle2}
          title="No persons yet"
          description="Persons are subject identities used for registration, roster moves, and consent signatures."
          action={<CreatePersonButton />}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>DOB</TH>
              <TH>Country</TH>
              <TH>Has account?</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((p) => {
              const display =
                p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`;
              const age = p.dobDate
                ? Math.floor(
                    (Date.now() - new Date(p.dobDate).getTime()) /
                      (365.25 * 24 * 3600 * 1000)
                  )
                : null;
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
                      <Badge tone="success">linked</Badge>
                    ) : (
                      <Badge>none</Badge>
                    )}
                  </TD>
                  <TD className="text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString("en-CA")}
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
