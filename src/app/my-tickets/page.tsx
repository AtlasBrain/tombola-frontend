import { Header } from "@/components/Header";
import { BuyerDashboard } from "@/components/BuyerDashboard";
import { MyTicketsFloatingIcons } from "@/components/MyTicketsFloatingIcons";

export const dynamic = "force-dynamic";

export default function MyTicketsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-12">
        {/* Header banner — mirrors Hero's atmosphere (dot-grid mask + radial
            accent + floating icons) so /my-tickets feels native to the site,
            not a back-office screen. */}
        <section className="relative overflow-hidden px-2 pt-12 pb-8 sm:pt-16 sm:pb-12">
          <div className="bg-dots absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
          <div className="absolute left-1/2 top-1/2 -z-10 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(136,207,196,0.07)_0%,transparent_70%)]" />
          <MyTicketsFloatingIcons />

          <div className="relative z-10">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-300">
              <span className="pulse-soft h-1.5 w-1.5 rounded-full bg-[#88cfc4]" aria-hidden />
              YOUR SCOREBOARD
            </span>
            <h1 className="font-display text-5xl uppercase leading-[0.95] sm:text-6xl">
              My tickets.
            </h1>
            <p className="mt-4 max-w-md text-sm text-neutral-400 sm:text-base">
              Every pool you&apos;ve bought into. Wins are credited directly to
              your wallet at settle — this page is the scoreboard.
            </p>
          </div>
        </section>

        <BuyerDashboard />
      </main>
    </>
  );
}
