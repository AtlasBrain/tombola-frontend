#!/usr/bin/env node
/**
 * Generates a fresh treasury keypair.
 * Run once, then copy the output to your environment variables.
 *
 * Usage: node beta/scripts/gen-treasury.mjs
 */
import { Keypair } from "@solana/web3.js";

const kp = Keypair.generate();
const secretArray = JSON.stringify(Array.from(kp.secretKey));

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Treasury keypair generated. Store these values securely.\n");
console.log("Public key (add to Railway validator env):");
console.log(`  TREASURY_ADDRESS=${kp.publicKey.toBase58()}\n`);
console.log("Secret key (add to Next.js host env — keep secret!):");
console.log(`  TREASURY_KEYPAIR='${secretArray}'`);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Also set VALIDATOR_RPC_URL on Next.js host once Railway is deployed.");
