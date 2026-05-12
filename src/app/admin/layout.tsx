// Admin route gate.
//
// Server-component layout that fires on every request to /admin/*:
//   1. Read the admin session cookie.
//   2. Verify HMAC + expiry (stateless — no Redis call).
//   3. Check the verified wallet is still on the ADMIN_WALLETS list
//      (allows revocation without changing the secret).
//   4. On success: render children with a thin header showing the
//      authed wallet + a "session ends in N min" hint.
//   5. On failure: render <AdminLogin /> client component that walks
//      the wallet through sign-to-enter.
//
// The gate is the single source of truth for "who can see /admin/*".
// Individual API routes ALSO call requireAdmin() so the data layer
// can't be hit by guessing curl URLs.

import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifySession,
} from "@/lib/admin/session";
import { adminConfigured, isAdminWallet } from "@/lib/admin/access";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tombola · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!adminConfigured()) {
    return <AdminMisconfigured />;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifySession(token);

  if (!session) {
    return <AdminLogin reason="signed-out" />;
  }
  if (!isAdminWallet(session.wallet)) {
    return <AdminLogin reason="revoked" />;
  }

  return (
    <AdminShell wallet={session.wallet} expSec={session.exp}>
      {children}
    </AdminShell>
  );
}

function AdminMisconfigured() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-neutral-300">
      <h1 className="font-display text-3xl uppercase text-rose-400">
        Admin not configured
      </h1>
      <p className="mt-3 text-neutral-400">
        <code className="rounded bg-neutral-900 px-1.5 py-0.5">
          ADMIN_WALLETS
        </code>{" "}
        env var is empty or unset. Add at least one base58 wallet pubkey
        (comma-separated for multiple) and redeploy.
      </p>
      <p className="mt-3 text-neutral-500">
        Also confirm{" "}
        <code className="rounded bg-neutral-900 px-1.5 py-0.5">
          ADMIN_SESSION_SECRET
        </code>{" "}
        is set to a random string ≥ 32 chars.
      </p>
    </main>
  );
}
