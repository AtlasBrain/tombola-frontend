// src/components/raas/TenantContext.tsx — Client-side tenant access.
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Tenant } from "@/types/raas";

const TenantCtx = createContext<Tenant | null>(null);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: Tenant;
  children: ReactNode;
}) {
  return <TenantCtx.Provider value={tenant}>{children}</TenantCtx.Provider>;
}

export function useTenant(): Tenant {
  const v = useContext(TenantCtx);
  if (!v) throw new Error("useTenant() must be used inside <TenantProvider>");
  return v;
}
