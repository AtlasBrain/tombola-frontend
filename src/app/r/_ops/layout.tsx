// src/app/r/_ops/layout.tsx — Wraps all /r/_ops/* routes with the operator gate.

import { OperatorGate } from "@/components/raas/OperatorGate";

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <OperatorGate>{children}</OperatorGate>;
}
