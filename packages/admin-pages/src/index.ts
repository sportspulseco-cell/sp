/**
 * @sportspulse/admin-pages
 *
 * Shared detail-page components for admin surfaces. Each export is a
 * pure presentational React component — the consuming app fetches
 * data via its own server-side SDK bindings and passes it in. Both
 * sa-web and org-admin-web (and any future role-admin app) mount the
 * same components, so the UI is canonical without exposing the
 * confidential super-admin URL across apps.
 *
 * Pattern follows @sportspulse/forms-builder (BUG-043). Each detail
 * page extracted lands here one at a time.
 */
export { LeagueDetail } from "./league-detail";
