import { Header } from "@/components/Header";
import { BuyerDashboard } from "@/components/BuyerDashboard";

export const dynamic = "force-dynamic";

export default function MyTicketsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div>
          <h1 className="font-display text-4xl uppercase">My tickets</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Every pool you&apos;ve bought into, public and private. Wins are
            credited directly to your wallet at settle — this page is the
            scoreboard.
          </p>
        </div>
        <div className="mt-8">
          <BuyerDashboard />
        </div>
      </main>
    </>
  );
}
