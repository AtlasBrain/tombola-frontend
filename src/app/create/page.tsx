"use client";
import { useState } from "react";
import Link from "next/link";
import { CreatePoolForm } from "@/components/CreatePoolForm";
import { RedemptionLinkList } from "@/components/RedemptionLinkList";
import { Header } from "@/components/Header";

interface CreatedPayload {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: "Whitelist" | "OneCodePerTicket";
}

export default function CreatePoolPage() {
  const [created, setCreated] = useState<CreatedPayload | null>(null);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-4xl uppercase">Create a private pool</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Mint invite codes and hand them out individually. Whoever has a
          redemption link can join — codes are bearer tokens, single-use on chain.
        </p>
        {!created ? (
          <div className="mt-8">
            <CreatePoolForm onCreated={setCreated} />
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-6">
              <h2 className="font-display text-xl uppercase text-emerald-400">
                Pool created
              </h2>
              <p className="mt-2 text-sm text-neutral-300">
                Pool address:{" "}
                <Link
                  href={`/pool/private/${created.poolAddress}`}
                  className="font-mono text-emerald-300 hover:underline"
                >
                  {created.poolAddress}
                </Link>
              </p>
            </div>
            <RedemptionLinkList
              poolAddress={created.poolAddress}
              codes={created.codes}
              proofs={created.proofs}
              mode={created.mode}
            />
          </div>
        )}
      </main>
    </>
  );
}
