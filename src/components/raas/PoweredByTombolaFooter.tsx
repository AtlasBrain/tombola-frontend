import Link from "next/link";

export function PoweredByTombolaFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-3 text-center text-xs opacity-60">
      Powered by{" "}
      <Link href="/" className="underline hover:opacity-100">
        Tombola
      </Link>
    </footer>
  );
}
