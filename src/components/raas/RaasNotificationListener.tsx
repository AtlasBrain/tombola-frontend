"use client";

// Render-nothing component that mounts the RaaS notification poller.
// Mirrors AppNotificationListeners.tsx (v1) but scoped to raas_* kinds.
//
// Mounted inside /src/app/r/[tenant]/layout.tsx so it runs on every page
// under /r/[tenant]/… while remaining a client component that doesn't
// force the layout to be a client component.

import { useRaasInviteNotifications } from "@/hooks/useRaasInviteNotifications";

export function RaasNotificationListener() {
  useRaasInviteNotifications();
  return null;
}
