// Unified create flow: v1's /create now redirects into the RaaS wizard at
// /r/tombola/create (per user decision to drop the v1 create page entirely
// and run all new raffles through the RaaS surface with a true Public mode).
//
// Existing v1 private pools remain reachable via /create/my-pools/[pubkey].
//
// Original v1 CreatePoolPage content (Header + CreatorDashboard +
// CreateFloatingIcons) preserved in git history if rollback is needed.

import { redirect } from "next/navigation";

export default function CreatePoolPage() {
  redirect("/r/tombola/create");
}
