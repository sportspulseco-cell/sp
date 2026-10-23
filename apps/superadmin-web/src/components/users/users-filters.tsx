"use client";

import { UrlFilters } from "@/components/ui/url-filters";

/** /users search + Status / Type / Country-Region filters (?q=&status=&type=&country=). */
export function UsersFilters({
  types,
  countries
}: {
  types: Array<{ code: string; name: string }>;
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
          param: "country",
          label: "Country / Region",
          allLabel: "All countries / regions",
          options: [
            ...countries.map((c) => ({ value: c, label: c })),
            { value: "none", label: "Not set" }
          ]
        }
      ]}
    />
  );
}
