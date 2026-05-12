// /creator/[address] used to be a standalone "creator's pools + reputation"
// page. That content is now a tab inside /u/[handle], so we redirect
// here and let the profile page pick the right tab from the query.

import { redirect } from "next/navigation";

export default async function CreatorRedirect({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<never> {
  const { address } = await params;
  redirect(`/u/${encodeURIComponent(address)}?tab=creator`);
}
