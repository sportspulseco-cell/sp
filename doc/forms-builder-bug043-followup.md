# BUG-043 close-out plan — org-admin form-builder access

The shared package extraction is **complete** (commits f6311ba → 006f20e). The remaining work is the API-side scope relaxation that lets org_admin users actually USE the builder from their own app.

## What's done

`@sportspulse/forms-builder` exports the full form-build UI:

- Context: `FormsBuilderProvider`, `useFormsBuilderApi`, type `FormsBuilderApi`
- Primitives: `SectionHeader` (with inlined `LiveDot`)
- Chrome: `RegistrationSetupShell` + types `SectionKey` / `SectionStatus` / `SectionState`
- Tab editors: `PricingTab`, `EmailTemplatesTab`
- Section clients: `PricingClient`, `EmailTemplatesClient`, `SubmissionsClient`, `ReviewSection`, `ReviewActions`, `FormBuilder`, `FormBuilderClient`, `SeasonSectionForm`, `DivisionsClient`

Sa-web's `/forms/[id]` route mounts all of these via the package today; section-wrapper files in `apps/superadmin-web/src/app/(admin)/forms/[id]/sections/` are now thin server components that just do data-fetching + pass props down.

## What's blocking org-admin

The forms-builder clients call these API methods:

| Method | Controller | Current guard |
|---|---|---|
| `registration.getForm` / `listForms` / `updateForm` / `createFormVersion` / `publishFormVersion` / `listFormVersions` | `registration-forms.controller.ts` | **SuperAdminGuard** |
| `registration.reviewRegistration` | `admin-review.controller.ts` | **SuperAdminGuard** (org-admin variant at `/org-admin/registrations/:id/review` already exists from BUG-040) |
| `registrationV2.createPricingTier` / `updatePricingTier` / `deletePricingTier` / `listPricingTiers` | `pricing-tiers.controller.ts` | **SuperAdminGuard** |
| `registrationV2.replaceTierDivisions` / `tierDivisionsByTiers` | `pricing-tier-divisions.controller.ts` | **SuperAdminGuard** |
| `registrationV2.createEmailTemplate` / `updateEmailTemplate` / `deleteEmailTemplate` / `listEmailTemplates` | `email-templates.controller.ts` | **SuperAdminGuard** |
| `leagueMgmt.getSeason` / `listSeasons` / `updateSeason` / `updateSeasonConfig` / `createSeason` | `seasons.controller.ts` + `seasons-config.controller.ts` | AuthorizedAccessGuard (org_admin works) |
| `leagueMgmt.listDivisions` / `getLeague` | `divisions.controller.ts` / `leagues.controller.ts` | AuthorizedAccessGuard (works) |

The SuperAdminGuard endpoints are the blockers.

## Recommended approach — A: inline scope checks

Per CLAUDE.md "Superadmin is the god app — every app is just filtered-by-role", the right fix is to add **inline scope checks** to each method so org_admin scoped to the form's org can proceed.

For each method:

1. **Find the orgId** the operation touches:
   - `:id` is a form id → `SELECT org_id FROM registration_forms WHERE id = $1`
   - `:tierId` → `SELECT season_id FROM pricing_tiers; SELECT org_id FROM seasons` (via the tier's season)
   - `:templateId` → same pattern
2. **Allow** if `super_admin` OR `org_admin` scoped to that orgId.
3. **404** otherwise (no leak per ARCH §3.4).

### Pattern (mirror `OrgAdminRegistrationsController.review` from BUG-040)

Drop a helper in `apps/superadmin-api/src/shared/auth/scope.ts`:

```ts
export async function requireSuperOrOrgAdmin(
  db: Database,
  userId: string,
  orgId: string
): Promise<void> {
  const rows = await db
    .select({ code: schema.roles.code })
    .from(schema.userRoleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
    .where(
      and(
        eq(schema.userRoleAssignments.userId, userId),
        eq(schema.userRoleAssignments.scopeType, "org"),
        eq(schema.userRoleAssignments.scopeId, orgId),
        isNull(schema.userRoleAssignments.revokedAt)
      )
    );
  const ok = rows.some((r) => r.code === "super_admin" || r.code === "org_admin");
  if (!ok) throw new NotFoundException("Resource not found"); // 404 no-leak
}
```

Then per-controller:

1. Swap `@UseGuards(JwtAuthGuard, SuperAdminGuard)` → `@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)` at the class level.
2. Decorate each mutation method with `@AllowScopedWrite()` (already exists).
3. Inside each method, derive orgId and call `requireSuperOrOrgAdmin(db, user.userId, orgId)` before the handler.

### Concrete endpoint list (~25 mutation endpoints)

`registration-forms.controller.ts`:
- `POST /registration/forms` — orgId from body
- `PATCH /registration/forms/:id` — orgId looked up from form
- `POST /registration/forms/:id/versions` — orgId looked up from form
- `POST /registration/forms/:id/versions/:vid/publish` — orgId looked up from form
- `GET /registration/forms/:id` (read) + `GET /registration/forms` (read) — also need to scope reads

`pricing-tiers.controller.ts`:
- `POST /registration-v2/pricing-tiers` — orgId via seasonId in body
- `PATCH /registration-v2/pricing-tiers/:id` — orgId via tier's season
- `DELETE /registration-v2/pricing-tiers/:id` — same

`pricing-tier-divisions.controller.ts`:
- `POST /registration-v2/pricing-tier-divisions/:tierId/replace` — orgId via tier's season

`email-templates.controller.ts`:
- `POST /registration-v2/email-templates` — orgId via seasonId in body
- `PATCH /registration-v2/email-templates/:id` — orgId via template's season
- `DELETE /registration-v2/email-templates/:id` — same

`season-rollover.controller.ts`:
- `POST /registration-v2/season-rollover` — orgId via source seasonId in body

## Org-admin page surface

Once the API is unblocked, the org-admin route is straightforward:

1. `apps/org-admin-web/src/app/(app)/forms/[id]/page.tsx` — mirror sa-web's. Same fetches via the org-admin's `server-api.ts`. Same `<RegistrationSetupShell>` + section content children.
2. `apps/org-admin-web/src/app/(app)/forms/[id]/forms-builder-provider-client.tsx` — copy sa-web's. Binds org-admin's browser-api SDK to the shared context.
3. `apps/org-admin-web/src/app/(app)/forms/[id]/sections/*-section.tsx` — six thin server wrappers, mirror sa-web's `sections/`. Each ~30 lines.
4. Drop the placeholder "managed by super-admin" copy from `apps/org-admin-web/src/app/(app)/forms/page.tsx` — once edit works, the list's "Edit in super-admin" header link becomes a direct deep-link to the org-admin's own `/forms/[id]` route, no external URL exposed.

## Estimated effort

- API scope relaxation (the helper + 6 controllers): **2-3 hours**
- Org-admin route + provider + section wrappers + sa-web /forms list link tweak: **1-2 hours**
- End-to-end verification in browser (sa-web works, org-admin works, no super-admin URL exposed): **0.5 hour**

Total: **one focused session** of 4-6 hours.

## Decision: A vs B

A is the right end state (single endpoint surface, org-admin uses same routes). B (parallel /org-admin proxy controllers) is faster to land but creates the silo we're explicitly trying to avoid. **Pick A.**

Test plan per endpoint (paste into the bug log when you start):
- ✅ super_admin can hit the endpoint as before (regression check)
- ✅ org_admin on the form's org can hit it (new path)
- ✅ org_admin on a DIFFERENT org gets 404 (no-leak)
- ✅ team_admin / player can NEVER hit it (still rejected)
