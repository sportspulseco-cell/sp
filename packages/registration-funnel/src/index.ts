// Public surface of @sportspulse/registration-funnel.
//
// Two multi-step flows that share the same wizard look-and-feel:
//   - <RegistrationFunnel>  — anonymous public season sign-up
//   - <OnboardingFunnel>    — post-signin role profile setup
// Both render their fields via the shared <FormRenderer>.
export { RegistrationFunnel } from "./funnel";
export { OnboardingFunnel, type OnboardingApi } from "./onboarding-funnel";
export { SignUpFunnel, type SignUpFunnelApi } from "./sign-up-funnel";
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
