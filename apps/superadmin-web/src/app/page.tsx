import { redirect } from "next/navigation";

export default function RootPage() {
  // Middleware enforces auth; if we got here authed, send to dashboard.
  redirect("/dashboard");
}
