// Public surface of @sportspulse/registration-funnel.
// One client component (the multi-step funnel), one factory for the
// anonymous public API, and the shape types both apps need.
export { RegistrationFunnel } from "./funnel";
export { FormRenderer } from "./form-renderer";
export {
  createPublicRegistration,
  type PublicRegistrationApi
} from "./public-api";
export type {
  PublicSeasonContext,
  PricingTier,
  SubmissionType,
  WaiverDoc
} from "./types";
