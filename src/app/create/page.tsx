import { Header } from "@/components/Header";
import { CreatorDashboard } from "@/components/CreatorDashboard";
import { CreateFloatingIcons } from "@/components/CreateFloatingIcons";

export const dynamic = "force-dynamic";

const MINT = "#88cfc4";

export default function CreatePoolPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-12">
        {/* Hero-like atmosphere — same pattern as /my-tickets so the creator
            hub feels native to the site. Title + description sit in a
            constrained left column; floating icons take the right + bottom
            strips. */}
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
              Private<br />pools.
            </h1>
            <p className="mt-4 text-sm text-neutral-400 sm:text-base">
              Mint invite codes and hand them out individually. Codes are
              bearer tokens, single-use on chain. Track every pool you&apos;ve
              created — live, resolved, and earnings.
            </p>
          </div>
        </section>

        <CreatorDashboard />
      </main>
    </>
  );
}
