import { redirect } from "next/navigation";

/**
 * A season's scheduling home. The breadcrumb links here from every
 * scheduling sub-page; the season's entry point is the generate page, the
 * same one the scheduling list opens.
 */
export default async function SeasonSchedulingPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  redirect(`/scheduling/${seasonId}/generate`);
}
