// Shared gate for every /api/admin/* route.
//
// Returns either:
//   { ok: true, wallet } — the request carries a valid admin session
//     cookie AND the wallet is in the ADMIN_WALLETS allow-list.
//   { ok: false, response } — a pre-built NextResponse (401 / 403).
//     The caller just returns it.
//
// Pattern (every admin route):
//
//   const gate = await requireAdmin(req);
//   if (!gate.ok) return gate.response;
//   const { wallet } = gate;
//   // ... do admin work, log audit, return data ...
//
// Never call into Redis from this gate — verification is stateless on
// the session cookie. Keeping the gate cheap means even high-frequency
// admin polling stays fast.

import { NextRequest, NextResponse } from "next/server";
import { isAdminWallet } from "./access";
import {
  ADMIN_SESSION_COOKIE,
  verifySession,
  type AdminSessionPayload,
} from "./session";
import { recordAuditEvent } from "./audit-store";

export type AdminGate =
  | { ok: true; wallet: string; session: AdminSessionPayload }
  | { ok: false; response: NextResponse };

export async function requireAdmin(req: NextRequest): Promise<AdminGate> {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifySession(token);
  const path = pathOf(req);
  if (!session) {
    // 401s aren't logged — they're typically anonymous probes with no
    // wallet to attribute. We'd just be writing noise.
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized — admin session missing or expired." },
        { status: 401 },
      ),
    };
  }
  if (!isAdminWallet(session.wallet)) {
    // Session cookie is structurally valid but the wallet has been
    // removed from the allow-list since the cookie was minted — treat
    // as fully revoked. Log the rejection so the founder can spot
    // attempts from stale cookies after a rotation.
    void recordAuditEvent({
      wallet: session.wallet,
      method: req.method,
      path,
      status: 403,
    }).catch(() => {});
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — wallet not on admin allow-list." },
        { status: 403 },
      ),
    };
  }
  // Successful access — log "who hit what when" before the route runs.
  // We never block on this; if Redis is down, the route still proceeds.
  void recordAuditEvent({
    wallet: session.wallet,
    method: req.method,
    path,
    status: 200,
  }).catch(() => {});
  return { ok: true, wallet: session.wallet, session };
}

/** Pull just the pathname from the request — strips query strings so
 *  audit rows are easy to group. */
function pathOf(req: NextRequest): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "";
  }
}
