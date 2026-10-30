import { safeNextPath } from "@sportspulse/kernel";
import { SignUpClient } from "./sign-up-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up · Player" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // ?next= is where the player was going, e.g. the captain's team link
  // (/invite/<token>). Same-site paths only.
  const { next } = await searchParams;
  return <SignUpClient next={next ? safeNextPath(next, "/") : null} />;
}
