import Link from "next/link";
import { Header } from "@/components/Header";
import { MyPoolsView } from "@/components/MyPoolsView";

export default function MyPoolsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-4xl uppercase">My private pools</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Pools you&apos;ve created from this wallet.
            </p>
          </div>
          <Link
            href="/create"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            + New pool
          </Link>
        </div>
        <div className="mt-8">
          <MyPoolsView />
        </div>
      </main>
    </>
  );
}
