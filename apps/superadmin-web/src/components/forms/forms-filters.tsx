"use client";

import { UrlFilters } from "@sportspulse/ui";

/** /forms name search + Organization / Division / Scope filters (?q=&org=&division=&scope=). */
export function FormsFilters({
  orgs,
  divisions
}: {
  orgs: Array<{ id: string; name: string }>;
  /** Divisions that have at least one division-scoped form. */
  divisions: Array<{ id: string; name: string }>;
}) {
  return (
    <UrlFilters
      searchPlaceholder="Search forms by name"
      selects={[
        {
          param: "org",
          label: "Organization",
          allLabel: "All organizations",
          options: orgs.map((o) => ({ value: o.id, label: o.name }))
        },
        {
          param: "division",
          label: "Division",
          allLabel: "All divisions",
          options: divisions.map((d) => ({ value: d.id, label: d.name }))
        },
        {
          param: "scope",
          label: "Scope",
          allLabel: "All scopes",
          options: [
            { value: "org", label: "Org-wide" },
            { value: "league", label: "League" },
            { value: "season", label: "Season" },
            { value: "division", label: "Division" }
          ]
        }
      ]}
    />
  );
}
