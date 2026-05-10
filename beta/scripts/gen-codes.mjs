#!/usr/bin/env node
/**
 * Generates N single-use invite codes.
 *
 * Usage: node beta/scripts/gen-codes.mjs [count]
 *   count  — number of codes to generate (default: 20)
 *
 * Copy the INVITE_CODES output into your Next.js host env vars.
 * Share one code per tester via their invite link:
 *   https://your-app.com/claim/<code>
 */
import { randomBytes } from "crypto";

const count = Number(process.argv[2] ?? 20);
if (!Number.isInteger(count) || count < 1 || count > 10_000) {
  console.error("Count must be 1–10000");
  process.exit(1);
}

const codes = Array.from({ length: count }, () =>
  randomBytes(5).toString("hex").toUpperCase(),
);

console.log(`Generated ${count} invite codes:\n`);
codes.forEach((c, i) => console.log(`  ${String(i + 1).padStart(3)}. ${c}   → https://YOUR_APP/claim/${c}`));
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Add to Next.js host env (replace any existing INVITE_CODES):");
console.log(`  INVITE_CODES=${codes.join(",")}`);
