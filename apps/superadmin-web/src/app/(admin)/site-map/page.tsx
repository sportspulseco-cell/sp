import { PageHeader, SiteMap } from "@sportspulse/ui";
import { createClient } from "@/lib/supabase/server";
import { navGroups } from "@/components/layout/nav-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site map · Super Admin" };

/**
 * Site map (FR-3.12.2): every page this person can open, grouped as in
 * the sidebar and built from the same list, so a scoped admin sees the
 * same role-filtered set as their sidebar.
 */
export default async function SiteMapPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single()
    : { data: null };
  const groups = navGroups(!!profile?.is_super_admin);
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Help" title="Site map" description="Every page you can open, grouped as in the sidebar." />
      <SiteMap groups={groups} />
    </div>
  );
}
