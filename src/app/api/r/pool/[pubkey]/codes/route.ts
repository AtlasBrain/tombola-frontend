import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";
import { encryptCodes, decryptCodes, type EncryptedCodeSet } from "@/lib/raas/code-storage";
import { getTenant, setActiveWhitelistedPool } from "@/lib/raas/tenant";
import { verifySignedAction } from "@/lib/raas/signed-action";

const redis = Redis.fromEnv();
const POOL_CODES_KEY = (pubkey: string) => `raas:pool:${pubkey}:codes`;
const TENANT_CODE_KEY = (slug: string) => `raas:tenant:${slug}:code_key`;

// POST: store codes for a pool (creator only, called once at create time)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;
  const body = (await req.json().catch(() => null)) as {
    tenant_slug?: string;
    codes?: string[];
    signed_proof?: { signature: string; nonce: string };
  } | null;

  if (!body?.tenant_slug || !Array.isArray(body.codes) || !body.signed_proof) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const tenant = await getTenant(body.tenant_slug);
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const verified = await verifySignedAction({
    wallet: tenant.owner_wallet,
    nonce: body.signed_proof.nonce,
    signature: body.signed_proof.signature,
    context: `store_codes:${pubkey}`,
  });
  if (!verified) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  // Lazily provision the tenant's code key on first use.
  let keyB64 = await redis.get<string>(TENANT_CODE_KEY(body.tenant_slug));
  if (!keyB64) {
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    keyB64 = Buffer.from(fresh).toString("base64");
    await redis.set(TENANT_CODE_KEY(body.tenant_slug), keyB64);
  }
  const keyBytes = new Uint8Array(Buffer.from(keyB64, "base64"));

  const encrypted = await encryptCodes(body.codes, keyBytes);
  await redis.set(POOL_CODES_KEY(pubkey), {
    ciphertext: Buffer.from(encrypted.ciphertext).toString("base64"),
    iv: Buffer.from(encrypted.iv).toString("base64"),
    count: encrypted.count,
  });

  // Set this pool as the tenant's active Whitelisted pool so invite links
  // can resolve the pool from just the code. Folded here because storing
  // codes for a Whitelisted pool == this pool is active. Separate endpoint
  // would add round trips with no benefit.
  await setActiveWhitelistedPool(body.tenant_slug, pubkey);

  return NextResponse.json({ ok: true, count: encrypted.count }, { status: 201 });
}

// GET: retrieve decrypted codes (creator only, signed nonce required)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey } = await params;
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  const nonce = url.searchParams.get("nonce");
  const signature = url.searchParams.get("signature");

  if (!tenantSlug || !nonce || !signature) {
    return NextResponse.json({ error: "missing_query_params" }, { status: 400 });
  }
  const tenant = await getTenant(tenantSlug);
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const verified = await verifySignedAction({
    wallet: tenant.owner_wallet,
    nonce,
    signature,
    context: `read_codes:${pubkey}`,
  });
  if (!verified) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const stored = await redis.get<{ ciphertext: string; iv: string; count: number }>(
    POOL_CODES_KEY(pubkey),
  );
  if (!stored) return NextResponse.json({ error: "no_codes" }, { status: 404 });
  const keyB64 = await redis.get<string>(TENANT_CODE_KEY(tenantSlug));
  if (!keyB64) return NextResponse.json({ error: "no_key" }, { status: 500 });

  const payload: EncryptedCodeSet = {
    ciphertext: new Uint8Array(Buffer.from(stored.ciphertext, "base64")),
    iv: new Uint8Array(Buffer.from(stored.iv, "base64")),
    count: stored.count,
  };
  const keyBytes = new Uint8Array(Buffer.from(keyB64, "base64"));
  const codes = await decryptCodes(payload, keyBytes);
  return NextResponse.json({ codes });
}
