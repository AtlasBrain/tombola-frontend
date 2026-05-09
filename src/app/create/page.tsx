"use client";
import { useState } from "react";
import { CreatePoolForm } from "@/components/CreatePoolForm";
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
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-display text-4xl uppercase">Create a private pool</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Mint invite codes you can hand out individually. Whoever has a redemption link can join.
        </p>
        {!created ? (
          <div className="mt-8">
            <CreatePoolForm onCreated={setCreated} />
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-6">
            <h2 className="font-display text-xl uppercase text-emerald-400">
              Pool created
            </h2>
            <p className="mt-2 text-sm text-neutral-300">
              Address:{" "}
              <code className="rounded bg-neutral-800 px-2 py-0.5 text-xs">
                {created.poolAddress}
              </code>
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              {created.codes.length} codes generated. The redemption-link UI lands in
              the next task; for now, see <code>/pool/private/{created.poolAddress}</code>.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
