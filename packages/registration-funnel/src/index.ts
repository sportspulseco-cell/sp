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
// Signature card shared by the funnel and player-web /compliance (COMP-4).
export { WaiverCard } from "./waiver-card";
export {
  RoleProfileEditor,
  RoleProfileFields,
  loadRoleProfile,
  useRoleProfile,
  type LoadedRoleProfile,
  type RoleProfileState,
  type RoleProfileTransport
} from "./role-profile-editor";
export {
  createPublicRegistration,
  type PublicRegistrationApi,
  type RegistrationQuote
} from "./public-api";
export type {
  PublicSeasonContext,
  PricingTier,
  SubmissionType,
  WaiverDoc
} from "./types";
