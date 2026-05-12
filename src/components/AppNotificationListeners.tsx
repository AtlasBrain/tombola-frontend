"use client";

// Render-nothing component that mounts the global cross-page listeners
// at the layout level. Keeps the layout server-component-friendly:
// it imports this client component once instead of marking the whole
// layout `"use client"`.

import { useFriendRequestNotifications } from "@/hooks/useFriendRequestNotifications";
import { usePoolInviteNotifications } from "@/hooks/usePoolInviteNotifications";
import { FirstConnectPrompt } from "@/components/FirstConnectPrompt";

export function AppNotificationListeners() {
  useFriendRequestNotifications();
  usePoolInviteNotifications();
  return <FirstConnectPrompt />;
}
