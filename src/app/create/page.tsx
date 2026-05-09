"use client";
import { useState } from "react";
import Link from "next/link";
import { CreatePoolForm } from "@/components/CreatePoolForm";
import { RedemptionLinkList } from "@/components/RedemptionLinkList";
import { Header } from "@/components/Header";
import { CreateFloatingIcons } from "@/components/CreateFloatingIcons";

interface CreatedPayload {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: "Whitelist" | "OneCodePerTicket";
}

const MINT = "#88cfc4";

export default function CreatePoolPage() {
  const [created, setCreated] = useState<CreatedPayload | null>(null);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-12">
        {/* Hero-like atmosphere — mirror /my-tickets and the homepage Hero so
            /create reads as native to the site, not a back-office form. The
            title + description sit in a constrained left column; floating
            icons take the right + bottom strips. */}
        <section className="relative overflow-hidden px-2 pt-12 pb-20 sm:pt-16 sm:pb-28">
          <div className="bg-dots absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
          <div
            className="absolute left-1/2 top-1/2 -z-10 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, ${MINT}13 0%, transparent 70%)`,
            }}
          />
          <CreateFloatingIcons />

          <div className="relative z-10 max-w-md">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              <span
                className="pulse-soft h-1.5 w-1.5 rounded-full"
                style={{ background: MINT }}
                aria-hidden
              />
              POOL CREATOR
            </span>
            <h1 className="font-display text-5xl uppercase leading-[0.95] sm:text-6xl">
              Create a<br />private pool.
            </h1>
            <p className="mt-4 text-sm text-neutral-400 sm:text-base">
              Mint invite codes and hand them out individually. Whoever has a
              redemption link can join — codes are bearer tokens, single-use
              on chain.
            </p>
          </div>
        </section>

        {!created ? (
          <CreatePoolForm onCreated={setCreated} />
        ) : (
          <div className="flex flex-col gap-6">
            <div
              className="rounded-2xl border p-6"
              style={{
                borderColor: `${MINT}66`,
                background: `linear-gradient(135deg, ${MINT}1a, ${MINT}05 60%, transparent)`,
                boxShadow: `0 0 0 1px ${MINT}33, 0 8px 30px ${MINT}26`,
              }}
            >
              <p
                className="font-mono text-[10px] uppercase tracking-widest"
                style={{ color: MINT }}
              >
                Pool created
              </p>
              <h2
                className="mt-1 font-display text-2xl uppercase"
                style={{ color: MINT }}
              >
                You&apos;re live
              </h2>
              <p className="mt-3 text-sm text-neutral-300">
                Pool address:{" "}
                <Link
                  href={`/pool/private/${created.poolAddress}`}
                  className="font-mono hover:underline"
                  style={{ color: MINT }}
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
