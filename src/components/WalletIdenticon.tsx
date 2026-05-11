// Deterministic identicon avatar from a base58 wallet pubkey.
//
// No external deps: we hash the wallet to a small bit-pattern + pick two
// palette colours seeded from the same hash, then render a 5×5 SVG with
// horizontal symmetry (columns 0/4 mirror, 1/3 mirror, col 2 standalone).
// Cheap, stable, and good enough as a "no PFP set" fallback.

import bs58 from "bs58";

// Palette intentionally restricted to brand-safe accents so no profile ends
// up with an ugly colour combo.
const PALETTE = [
  "#88cfc4", // mint
  "#c9b5dc", // lavender
  "#e89999", // coral
  "#e8d89e", // sand
  "#e8a5c0", // rose
  "#d4e84a", // lime
  "#e8c969", // gold
];

interface Props {
  wallet: string;
  /** Pixel size of the rendered square. Default 64. */
  size?: number;
  /** Optional override avatar — an absolute URL (NFT or uploaded image).
   *  When set we just render an <img>; the identicon is the fallback. */
  imageUrl?: string | null;
  className?: string;
  /** When given, takes precedence over the auto-derived initials. Useful
   *  for showing a single capital letter inside a hand-picked avatar. */
  initialOverride?: string;
}

function bytesFromWallet(wallet: string): Uint8Array {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lib = bs58 as any;
    const decode = (lib.default?.decode ?? lib.decode) as (s: string) => Uint8Array;
    return decode(wallet);
  } catch {
    // Fallback for invalid/short strings — hash the chars themselves so we
    // always render *something* deterministic.
    const out = new Uint8Array(32);
    for (let i = 0; i < wallet.length; i++) {
      out[i % 32] = (out[i % 32] + wallet.charCodeAt(i)) & 0xff;
    }
    return out;
  }
}

export function WalletIdenticon({
  wallet,
  size = 64,
  imageUrl,
  className = "",
  initialOverride,
}: Props) {
  // NFT / uploaded image override — return early.
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const bytes = bytesFromWallet(wallet || "1");
  const fg = PALETTE[bytes[0] % PALETTE.length];
  const bgTint = PALETTE[(bytes[1] + 3) % PALETTE.length];

  // Build a 5x5 grid using bytes[2..16]. Only cols 0,1,2 are computed; cols 3,4
  // mirror cols 1,0 for symmetry.
  const cells: boolean[][] = Array.from({ length: 5 }, () => Array(5).fill(false));
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = (bytes[2 + row * 3 + col] ?? 0) & 1;
      cells[row][col] = bit === 1;
      // Mirror onto col 4 / 3.
      cells[row][4 - col] = bit === 1;
    }
  }

  const initial = (initialOverride ?? wallet.charAt(0) ?? "?").toUpperCase();

  // 5x5 cells in a circular clip. Use the lighter of the two palette colours
  // as the tinted background gradient, the darker as the cell fill.
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${bgTint}, ${fg})`,
      }}
      aria-hidden
      title={wallet}
    >
      <svg
        viewBox="0 0 5 5"
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0, opacity: 0.55 }}
      >
        {cells.flatMap((row, r) =>
          row.map((on, c) =>
            on ? (
              <rect
                key={`${r}-${c}`}
                x={c}
                y={r}
                width={1}
                height={1}
                fill="#0a0a0a"
              />
            ) : null,
          ),
        )}
      </svg>
      <span
        className="relative font-bold text-black"
        style={{
          fontFamily:
            'ui-sans-serif, "Space Grotesk", system-ui',
          fontSize: Math.round(size * 0.4),
          lineHeight: 1,
          mixBlendMode: "screen",
          textShadow: "0 1px 1px rgba(0,0,0,0.15)",
        }}
      >
        {initial}
      </span>
    </span>
  );
}
