/**
 * @sportspulse/forms-builder
 *
 * Canonical form-builder surface. Consumed by sa-web's /forms/[id] route
 * today; org-admin-web will mount the same shell once we expose org-admin
 * mutation endpoints (BUG-043 follow-up).
 *
 * Migration in progress — see doc/forms-builder-migration.md:
 *   - context + section-header live here (this commit)
 *   - setup-shell, thin section wrappers, then the section clients land
 *     in follow-up PRs
 */
export { FormsBuilderProvider, useFormsBuilderApi } from "./context";
export type { FormsBuilderApi } from "./context";
export { SectionHeader } from "./section-header";
export { PricingTab } from "./pricing-tab";
export { EmailTemplatesTab } from "./email-templates-tab";
