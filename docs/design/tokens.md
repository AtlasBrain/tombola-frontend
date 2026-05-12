# Design Tokens — Lock Reference

> Locked 2026-05-12 by the UI audit (`docs/ui-audit-2026-05-12.md`).
> If you need a new size/color/radius, add it here first, then use it.

The audit found 18 files redeclaring brand hex, 4 different label sizes
for the same role, 6 different border-radii on cards, and 4 different
close-button patterns. Below is the canonical scale — use only these.

---

## Color

Source of truth: `src/lib/colors.ts` (exports raw hex) + `src/app/globals.css`
(declares CSS vars + Tailwind utility tokens via `@theme`).

| Token              | Hex       | Usage                                          |
| ------------------ | --------- | ---------------------------------------------- |
| `MINT` / `--mint`  | `#88cfc4` | Brand primary — CTAs, info, "open" status      |
| `LAVENDER`         | `#c9b5dc` | Public-pool secondary — alt CTAs, accent       |
| `CORAL`            | `#e89999` | Danger / destructive — revoke, errors          |
| `SAND`             | `#e8d89e` | Warning / pending — sent invites, "needs you"  |
| `ROSE`             | `#e8a5c0` | Soft accent — rare; reserve for empty/charm    |

**Never** redeclare brand hex inline. Import:
```ts
import { MINT, LAVENDER, CORAL, SAND, ROSE } from "@/lib/colors";
```

In Tailwind classes the same names work as utilities:
`text-mint`, `bg-mint`, `border-mint`, `text-lavender`, etc.

The legacy `lime` alias was dropped 2026-05-12 — it rendered as
lavender and confused new contributors. Use `lavender` directly.

---

## Typography

Locked sizes for mono labels:

| Class             | Use                                                       |
| ----------------- | --------------------------------------------------------- |
| `text-[10px]`     | Smallest body label (uppercase tracking-widest section).  |
| `text-[11px]`     | Drawer / panel headers.                                   |
| `text-[12px]`     | Inline list row mono.                                     |
| `text-[13px]`     | Inline list row body (pseudo, primary identity).          |
| `text-xs` (12px)  | Default body small.                                       |
| `text-sm` (14px)  | Default body.                                             |
| `text-base` (16px)| Default body large.                                       |

**Banned:**
- `text-[9px]` on body labels. Reserved for purely visual indicators
  (kbd hints, notification dots) — never for labels someone needs to read.
- Combining small mono labels (≤ 11px) with `text-neutral-600` or
  `text-neutral-700`. WCAG AA fails. Minimum for small labels is
  `text-neutral-400`.

Color hierarchy for labels:
- Primary mono label: `text-neutral-300`
- Subdued mono label: `text-neutral-400`
- Neutral-500 only for input placeholder text or visual filler.
- Neutral-600/700 reserved for ellipsis / dash / arrow visual filler,
  not labels.

---

## Border Radius

| Class           | Use                                                     |
| --------------- | ------------------------------------------------------- |
| `rounded-full`  | Pills, chips, status indicators, avatars, close buttons |
| `rounded-2xl`   | Top-level cards (PoolCard, ProfileCard, modal panels)   |
| `rounded-xl`    | Mid-level surfaces (alert callouts, info panels)        |
| `rounded-lg`    | Form inputs, mini icon-buttons (h-9 w-9)                |
| `rounded-md`    | Checkbox indicators only                                |

**Banned:**
- `rounded-md` on cards or chips. If it has padding + border + content,
  it's not a checkbox — use `rounded-xl`/`rounded-full`.
- Mixing `rounded-md` and `rounded-lg` inside a single card surface.

---

## Spacing on Cards

Locked padding scale for card-like surfaces (border + bg + content):

| Class       | Use                                                |
| ----------- | -------------------------------------------------- |
| `p-2`       | Compact list row / chip                            |
| `p-3`       | Standard inline panel (drawer body, picker row)    |
| `p-4`       | Default card                                       |
| `p-5`       | Highlight card (success state, "you're live")      |
| `p-6`       | Modal body                                         |
| `p-7`       | Modal top-level wrapper (e.g. CreatePoolModal)     |

Gaps inside cards: `gap-2` (tight), `gap-3` (default), `gap-4` (loose).
Don't introduce `gap-2.5` etc — stick to integers.

---

## Components You Should Reach For

Before redeclaring inline styles, check these first:

- `src/components/ui/Button.tsx` — variants: `cta` (tear-corner) /
  `primary` (mint pill) / `secondary` (mint outline) /
  `tertiary` (neutral outline) / `danger` (coral outline).
- `src/components/ui/StatusPill.tsx` — 11 status kinds with locked
  glyph + color tokens (open/drawing/resolved/sent/redeemed/etc).
- `src/components/ui/CloseButton.tsx` — unified ×-icon close
  affordance for every modal/drawer. Pair with `onClose` + esc.
- `src/components/ui/Stat.tsx` — number + label + sub stat tile.

If you find yourself rebuilding one of these inline, stop and import.

---

## Process

When a design need genuinely exceeds these tokens:
1. Add the new token to `colors.ts` / `globals.css` / this doc.
2. Justify in a PR comment why the existing scale didn't cover it.
3. Migrate at least one existing inline use to the new token in the
   same PR — don't leave orphan tokens nobody else uses.
