// @sportspulse/api-client — typed SDK for the superadmin-api.
//
// Each web app brings its own auth-bound fetcher (SSR cookies vs
// browser JWT) and feeds it into `createApi(fetcher)` — the SDK
// itself is auth-agnostic. Keep this in sync with the API surface
// in `apps/superadmin-api`.
export * from "./types";
export * from "./sdk";
