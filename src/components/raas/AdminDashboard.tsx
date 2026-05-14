"use client";

import { useState } from "react";
import type { Tenant } from "@/types/raas";
import { AdminOverview } from "./AdminOverview";
import { AdminRaffles } from "./AdminRaffles";
import { SchedulesTab } from "./SchedulesTab";
import { AdminAudience } from "./AdminAudience";
import { AdminSettings } from "./AdminSettings";
import { AdminFriends } from "./AdminFriends";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "raffles", label: "Raffles" },
  { id: "schedules", label: "Schedules" },
  { id: "audience", label: "Audience" },
  { id: "friends", label: "Friends" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  tenant: Tenant;
  poolPubkeys: string[];
}

export function AdminDashboard({ tenant, poolPubkeys }: Props) {
  const [active, setActive] = useState<TabId>("overview");

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-white/10 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 text-sm border-b-2 transition whitespace-nowrap ${
              active === t.id
                ? "border-current"
                : "border-transparent opacity-60 hover:opacity-100"
            }`}
            style={active === t.id ? { color: tenant.branding.primary_color } : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {active === "overview" && (
          <AdminOverview tenant={tenant} poolPubkeys={poolPubkeys} />
        )}
        {active === "raffles" && (
          <AdminRaffles tenant={tenant} poolPubkeys={poolPubkeys} />
        )}
        {active === "schedules" && (
          <SchedulesTab
            tenantSlug={tenant.slug}
            tenantPrimaryColor={tenant.branding.primary_color}
          />
        )}
        {active === "audience" && (
          <AdminAudience tenant={tenant} poolPubkeys={poolPubkeys} />
        )}
        {active === "friends" && <AdminFriends tenant={tenant} />}
        {active === "settings" && <AdminSettings tenant={tenant} />}
      </div>
    </div>
  );
}
