"use client";

import { UrlFilters } from "@sportspulse/ui";

/**
 * /persons search + Account / Age / Country filters
 * (?q=&account=&age=&country=), the same control as /users (PPHL,
 * 28 Oct 2026: "filters and a search bar like Users").
 */
export function PersonsFilters({ countries }: { countries: string[] }) {
  return (
    <UrlFilters
      searchPlaceholder="Search by name"
      selects={[
        {
          param: "account",
          label: "Account",
          allLabel: "With or without an account",
          options: [
            { value: "linked", label: "Has an account" },
            { value: "none", label: "No account" }
          ]
        },
        {
          param: "age",
          label: "Age",
          allLabel: "All ages",
          options: [
            { value: "minor", label: "Under 18" },
            { value: "adult", label: "18 and over" },
            { value: "unknown", label: "No date of birth" }
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
