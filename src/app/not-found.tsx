import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
        404
      </p>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">
        Nothing here.
      </h1>
      <p className="mb-6 text-sm text-neutral-400">
        The route you tried doesn&apos;t exist on this dapp.
      </p>
      <Link
        href="/"
        style={{ background: "#c9b5dc" }}
        className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:brightness-110"
      >
        Back to pools
      </Link>
    </div>
  );
}
