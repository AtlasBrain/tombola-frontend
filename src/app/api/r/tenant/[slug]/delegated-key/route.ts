import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { getTenant } from "@/lib/raas/tenant";
import { storeDelegatedKey, getOrProvisionSignerKey } from "@/lib/raas/delegated-key";
import { verifySignedAction } from "@/lib/raas/signed-action";

const redis = Redis.fromEnv();
const TENANT_KEY = (slug: string) => `raas:tenant:${slug}`;
const DELEGATED_KEY_PRIVATE = (slug: string) =>
  `raas:tenant:${slug}:delegated_private`;

// POST /api/r/tenant/[slug]/delegated-key
// Verifies wrap signature, encrypts + stores the delegated private key,
// and marks the tenant record with the delegated signer metadata.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as {
    delegated_pubkey?: string;
    private_key_b64?: string;
    wrap_signature?: string;
    main_wallet?: string;
  } | null;

  if (
    !body?.delegated_pubkey ||
    !body.private_key_b64 ||
    !body.wrap_signature ||
    !body.main_wallet
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const tenant = await getTenant(slug);
  if (!tenant)
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
  if (tenant.owner_wallet !== body.main_wallet) {
    return NextResponse.json({ error: "wallet_mismatch" }, { status: 403 });
  }

  // Verify the wrap signature: main wallet signed
  // "tombola:delegate_key:{slug}:{delegated_pubkey}"
  const wrapMsg = new TextEncoder().encode(
    `tombola:delegate_key:${slug}:${body.delegated_pubkey}`,
  );
  let wrapSig: Uint8Array;
  let mainPubkey: Uint8Array;
  try {
    wrapSig = bs58.decode(body.wrap_signature);
    mainPubkey = bs58.decode(body.main_wallet);
  } catch {
    return NextResponse.json({ error: "bad_encoding" }, { status: 400 });
  }

  const ok = nacl.sign.detached.verify(wrapMsg, wrapSig, mainPubkey);
  if (!ok) {
    return NextResponse.json({ error: "bad_signature" }, { status: 403 });
  }

  // Lazily provision a dedicated signer_key — separate from code_key so that
  // a Redis compromise of invite-code material does not also expose the signing key.
  const signerKey = await getOrProvisionSignerKey(slug);

  // Encrypt + store the private key (never stored plaintext).
  const privBytes = new Uint8Array(Buffer.from(body.private_key_b64, "base64"));
  await storeDelegatedKey(slug, privBytes, signerKey);

  // Update tenant record with delegated signer metadata.
  tenant.delegated_signer = {
    pubkey: body.delegated_pubkey,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  await redis.set(TENANT_KEY(slug), tenant);

  return NextResponse.json({ ok: true });
}

// DELETE /api/r/tenant/[slug]/delegated-key
// Revokes the delegated key: clears the encrypted private key and marks
// tenant.delegated_signer.revoked_at. Requires signed_proof from tenant owner.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const nonce = url.searchParams.get("nonce");
  const signature = url.searchParams.get("signature");

  if (!nonce || !signature) {
    return NextResponse.json(
      { error: "missing_query_params" },
      { status: 400 },
    );
  }

  const tenant = await getTenant(slug);
  if (!tenant)
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const verified = await verifySignedAction({
    wallet: tenant.owner_wallet,
    nonce,
    signature,
    context: `revoke_delegated_key:${slug}`,
  });
  if (!verified)
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  // Clear the encrypted private key from KV.
  await redis.del(DELEGATED_KEY_PRIVATE(slug));

  // Mark the tenant record as revoked.
  if (tenant.delegated_signer) {
    tenant.delegated_signer.revoked_at = new Date().toISOString();
    await redis.set(TENANT_KEY(slug), tenant);
  }

  return NextResponse.json({ ok: true });
}
