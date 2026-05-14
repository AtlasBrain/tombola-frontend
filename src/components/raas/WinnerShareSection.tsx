"use client";

// WinnerShareSection — post-settle share buttons.
// Renders share intent URLs for X, Telegram, and Discord pre-filled with
// the winner OG image URL. Only mounted by the pool detail page when
// pool.state === "Resolved" && pool.winner !== null.

interface Props {
  pubkey: string;
  tenantSlug: string;
  tenantDisplayName: string;
  winner: string;
  potSol: string;
}

export function WinnerShareSection({
  pubkey,
  tenantDisplayName,
  winner,
  potSol,
}: Props) {
  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://tombola.app";

  const ogUrl = `${baseUrl}/api/r/og/winner/${pubkey}`;
  const poolUrl = `${baseUrl}${typeof window !== "undefined" ? window.location.pathname : ""}`;

  const winnerShort = winner.slice(0, 6) + "..." + winner.slice(-4);
  const shareText = `${tenantDisplayName} raffle settled! ${potSol} SOL won by ${winnerShort} — verified on-chain. Play next: ${poolUrl}`;

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(ogUrl)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(poolUrl)}&text=${encodeURIComponent(shareText)}`;
  // Discord doesn't have a web share intent, so we copy the OG link to clipboard.
  function copyForDiscord() {
    const text = `${shareText}\n${ogUrl}`;
    navigator.clipboard.writeText(text).catch(() => null);
    alert("Copied to clipboard — paste into Discord!");
  }

  return (
    <div className="rounded-md border border-white/10 bg-neutral-900 p-4 space-y-3">
      <p className="text-sm font-semibold opacity-70">Share winner</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black border border-white/20 text-sm hover:bg-white/5 transition"
        >
          {/* X (Twitter) */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </a>

        <a
          href={tgHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#229ed9]/20 border border-[#229ed9]/40 text-sm hover:bg-[#229ed9]/30 transition"
        >
          {/* Telegram */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
          Telegram
        </a>

        <button
          onClick={copyForDiscord}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#5865f2]/20 border border-[#5865f2]/40 text-sm hover:bg-[#5865f2]/30 transition"
        >
          {/* Discord */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z" />
          </svg>
          Copy for Discord
        </button>
      </div>
    </div>
  );
}
