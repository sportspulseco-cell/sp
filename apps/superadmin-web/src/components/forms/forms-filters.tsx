"use client";

import { UrlFilters } from "@/components/ui/url-filters";

/** /forms name search + Organisation / Scope filters (?q=&org=&scope=). */
export function FormsFilters({ orgs }: { orgs: Array<{ id: string; name: string }> }) {
  return (
    <UrlFilters
      searchPlaceholder="Search forms by name"
      selects={[
        {
          param: "org",
          label: "Organisation",
          allLabel: "All organisations",
          options: orgs.map((o) => ({ value: o.id, label: o.name }))
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
