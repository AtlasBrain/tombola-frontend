// Canonical `Option<T>` unwrap for decoded Anchor accounts.
//
// `@solana/kit`'s codec emits `Option` fields as either the raw value or a
// `{ __option: "Some" | "None", value }` discriminator depending on encoding
// path. Every stats / detail loader hand-rolled the same null-or-coerce
// shape; this is the single source of truth.
export function unwrapOption<T>(
  raw: unknown,
  coerce: (v: unknown) => T,
): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && raw !== null && "__option" in raw) {
    const opt = raw as { __option: "Some" | "None"; value?: unknown };
    return opt.__option === "Some" && opt.value !== undefined
      ? coerce(opt.value)
      : null;
  }
  return coerce(raw);
}
