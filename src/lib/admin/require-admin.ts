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

export type AdminGate =
  | { ok: true; wallet: string; session: AdminSessionPayload }
  | { ok: false; response: NextResponse };

export async function requireAdmin(req: NextRequest): Promise<AdminGate> {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) {
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
    // as fully revoked.
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — wallet not on admin allow-list." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, wallet: session.wallet, session };
}
