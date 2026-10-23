"use client";

import { UrlFilters } from "@/components/ui/url-filters";

/**
 * /users search + Status / Type / Region / Country filters
 * (?q=&status=&type=&region=&country=). Country is a profile field
 * (always USA for PPHL); Region is the structural tier a user reaches
 * through roles and rosters, which is what PPHL filters by.
 */
export function UsersFilters({
  types,
  regions,
  countries
}: {
  types: Array<{ code: string; name: string }>;
  regions: string[];
  countries: string[];
}) {
  return (
    <UrlFilters
      searchPlaceholder="Search by name or email"
      selects={[
        {
          param: "status",
          label: "Status",
          allLabel: "All statuses",
          options: [
            { value: "active", label: "Active" },
            { value: "pending", label: "Pending" },
            { value: "suspended", label: "Suspended" }
          ]
        },
        {
          param: "type",
          label: "Type",
          allLabel: "All types",
          options: [
            ...types.map((t) => ({ value: t.code, label: t.name })),
            { value: "none", label: "No role" }
          ]
        },
        {
          param: "region",
          label: "Region",
          allLabel: "All regions",
          options: [
            ...regions.map((r) => ({ value: r, label: r })),
            { value: "none", label: "No region" }
          ]
        },
        {
          param: "country",
          label: "Country",
          allLabel: "All countries",
          options: [
            ...countries.map((c) => ({ value: c, label: c })),
            { value: "none", label: "Not set" }
          ]
        }
      ]}
    />
  );
}
