# BUG-043 follow-up — close the org-admin form builder

The shared `@sportspulse/forms-builder` package now contains the
entire canonical form-build UI (~2800 LOC moved across 8 commits,
`f6311ba`..`006f20e`). The package is consumed by:

- **sa-web** — `/forms/[id]` route, fully working with super_admin.
- **org-admin-web** — `/forms/[id]` route SKELETON in place (this
  commit). Mounts `<FormsBuilderProviderClient>` with org-admin's
  browser-api bindings of `registration` / `registrationV2` /
  `leagueMgmt`. But every mutation hits a super_admin-only API
  endpoint, so the route renders a placeholder until the work in
  this checklist ships.

## The checklist

The forms-builder context invokes the following SDK methods. Each
needs either a `/org-admin/*` proxy or a guard relaxation that lets
org_admin through when the resource's `orgId` matches the caller's
org_admin scope.

### Reads (must succeed for the page to even load)

| SDK method | Current endpoint | Current guard | Action |
|---|---|---|---|
| `registration.getForm(id)` | `GET /registration/forms/:id` | `SuperAdminGuard` | Add scope-checked read access for org_admin |
| `registration.listFormVersions(id)` | `GET /registration/forms/:id/versions` | `SuperAdminGuard` | Same |
| `registration.listRegistrations({ orgId })` | `GET /registration/registrations` | `SuperAdminGuard` | Already filterable by orgId — add scope check |
| `registrationV2.listPricingTiers({ seasonId })` | `GET /registrationV2/seasons/:id/pricing-tiers` | `SuperAdminGuard` | Same — verify season's orgId ∈ caller's orgs |
| `registrationV2.listEmailTemplates({ seasonId })` | `GET /registrationV2/seasons/:id/email-templates` | `SuperAdminGuard` | Same |
| `registrationV2.tierDivisionsByTiers(ids)` | `GET /registrationV2/tier-divisions/by-tiers` | `SuperAdminGuard` | Same |
| `leagueMgmt.listSeasons({ orgId })` | `GET /league/seasons` | `AuthorizedAccessGuard` (✅ already works for org_admin reads) | none |
| `leagueMgmt.listDivisions({ seasonId })` | `GET /league/divisions` | `AuthorizedAccessGuard` (✅) | none |
| `leagueMgmt.getSeason(id)` | `GET /league/seasons/:id` | `AuthorizedAccessGuard` (✅) | none |
| `orgs.get(id)` | `GET /orgs/:id` | `AuthorizedAccessGuard` (✅) | none |

### Mutations (needed for editing — the actual BUG-043 close)

| SDK method | Current endpoint | Action |
|---|---|---|
| `registration.updateForm(id, patch)` | `PATCH /registration/forms/:id` | New proxy `PATCH /org-admin/forms/:id` with inline scope check on `form.orgId` |
| `registration.createFormVersion(id, body)` | `POST /registration/forms/:id/versions` | Proxy `POST /org-admin/forms/:id/versions` |
| `registration.publishFormVersion(id, vid)` | `POST /registration/forms/:id/versions/:vid/publish` | Proxy `POST /org-admin/forms/:id/versions/:vid/publish` |
| `registration.reviewRegistration(id, body)` | `POST /registration/registrations/:id/review` | Already proxied as `POST /org-admin/registrations/:id/review` ✅ (BUG-040) |
| `registrationV2.createPricingTier(body)` | `POST /registrationV2/pricing-tiers` | Proxy `POST /org-admin/pricing-tiers` |
| `registrationV2.updatePricingTier(id, patch)` | `PATCH /registrationV2/pricing-tiers/:id` | Proxy `PATCH /org-admin/pricing-tiers/:id` |
| `registrationV2.deletePricingTier(id)` | `DELETE /registrationV2/pricing-tiers/:id` | Proxy `DELETE /org-admin/pricing-tiers/:id` |
| `registrationV2.createEmailTemplate(body)` | `POST /registrationV2/email-templates` | Proxy `POST /org-admin/email-templates` |
| `registrationV2.updateEmailTemplate(id, patch)` | `PATCH /registrationV2/email-templates/:id` | Proxy `PATCH /org-admin/email-templates/:id` |
| `registrationV2.deleteEmailTemplate(id)` | `DELETE /registrationV2/email-templates/:id` | Proxy `DELETE /org-admin/email-templates/:id` |
| `registrationV2.replaceTierDivisions(tierId, ids)` | `POST /registrationV2/pricing-tiers/:id/divisions` | Proxy `POST /org-admin/pricing-tiers/:id/divisions` |
| `leagueMgmt.updateSeason(id, patch)` | `PATCH /league/seasons/:id` | Already accepts org_admin via @AllowScopedWrite on AuthorizedAccessGuard ✅ |
| `leagueMgmt.updateSeasonConfig(id, patch)` | `PATCH /league/seasons/:id/config` | Same ✅ |
| `leagueMgmt.createSeason(body)` | `POST /league/seasons` | Already proxied as `POST /org-admin/seasons` ✅ (this commit family) |

### Approach (pick one)

**A — One controller, many proxies.** Add `OrgAdminFormBuilderController` with all the new mutation endpoints listed above. Each method does the same recipe:
  1. Fetch the resource (form / tier / template / etc.)
  2. Verify caller has super_admin OR active `org_admin` on the resource's `orgId`
  3. Delegate to the existing handler (the SUPER_ADMIN gate is on the controller, not the handler — handlers are scope-agnostic)

Pattern matches `OrgAdminRegistrationsController.review` (BUG-040 fix) — ~15 lines per endpoint. Total: ~250 lines for 11 new endpoints.

**B — Guard relaxation.** Switch the affected super-admin controllers (`registration-forms`, `pricing-tiers`, `email-templates`, `pricing-tier-divisions`, `admin-review`) from `SuperAdminGuard` to `AuthorizedAccessGuard` + per-handler `@AllowScopedWrite()` + inline scope check that verifies the resource belongs to the caller's org. Smaller line count but riskier — touches super-admin-protected code.

**Recommendation:** **A** for safety. The proxy controller is additive — existing sa-web paths are untouched.

### Org-admin SDK shape

Once the proxy endpoints land, extend the SDK with an `orgAdminFormBuilder` namespace OR (cleaner) just have the existing `registration` / `registrationV2` namespaces route to the proxy URLs when accessed from org-admin's `createApi(apiFetch)` call. The route can be path-prefixed via a custom `apiFetch` wrapper in org-admin's `browser-api.ts`:

```ts
async function apiFetch<T>(path: string, init?: RequestInit) {
  // Rewrite super-admin-only mutation paths to their org-admin proxies.
  // Reads stay on their existing URLs (those go through scope-checked
  // GETs after the read relaxation in this checklist).
  const proxied = path
    .replace(/^\/registration\/forms\//, "/org-admin/forms/")
    .replace(/^\/registrationV2\/pricing-tiers/, "/org-admin/pricing-tiers")
    .replace(/^\/registrationV2\/email-templates/, "/org-admin/email-templates");
  return originalApiFetch<T>(proxied, init);
}
```

That keeps the shared package unchanged. Both apps use the same SDK method names; org-admin's session rewrites to the proxy paths transparently.

### After this lands

Update `apps/org-admin-web/src/app/(app)/forms/[id]/page.tsx` to mirror `apps/superadmin-web/src/app/(admin)/forms/[id]/page.tsx`:
  1. Fetch form + season + tiers + templates + divisions + versions server-side
  2. Wrap in `<FormsBuilderProviderClient>`
  3. Mount `<RegistrationSetupShell>` + the appropriate section component

Delete the "wired up but not yet enabled" placeholder. BUG-043 closed end-to-end. Org-admin can build forms without ever touching sp-superadmin.

Then `apps/org-admin-web/src/app/(app)/forms/page.tsx` can drop its
"Edit in super-admin" external link entirely — the inline list rows
deep-link to the org-admin's own `/forms/[id]` route.
