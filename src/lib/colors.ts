// Single source of truth for brand accent hex values. Components used
// to re-declare these as local `const MINT = "#88cfc4"` constants in
// 18 different files, with casing and naming drift (e.g. some files
// used `PINK` for the coral color while CSS `--pink` is a different
// pink). Importing from this module keeps everyone aligned.
//
// For CSS-property-only contexts prefer Tailwind utilities (`text-mint`,
// `bg-mint`, `border-mint`) generated from the `--color-*` tokens in
// globals.css's @theme block. Use these JS constants only when you
// need the raw hex — typically because you're appending an alpha suffix
// (`${MINT}26` for ~15% alpha) which CSS variables can't do directly.

export const MINT = "#88cfc4";
export const LAVENDER = "#c9b5dc";
/** Warm pink — historically called "pink" or "PINK" inline. */
export const CORAL = "#e89999";
/** Yellow-cream — historically called "yellow" or "sand". */
export const SAND = "#e8d89e";
/** Pastel pink — the actual `--pink` CSS var. */
export const ROSE = "#e8a5c0";
