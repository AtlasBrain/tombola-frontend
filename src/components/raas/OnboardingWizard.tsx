// src/components/raas/OnboardingWizard.tsx
"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { slugify, isValidSlug } from "@/lib/raas/slug";

type Step = "wallet" | "brand" | "style" | "review";

const FONT_PAIRS = [
  { id: "space-grotesk", label: "Space Grotesk (default)" },
  { id: "inter", label: "Inter" },
  { id: "archivo", label: "Archivo" },
  { id: "jetbrains-mono", label: "JetBrains Mono" },
] as const;

export function OnboardingWizard() {
  const { publicKey, connected } = useWallet();
  const router = useRouter();

  const [step, setStep] = useState<Step>("wallet");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#88cfc4");
  const [accentColor, setAccentColor] = useState("#c9b5dc");
  const [fontPair, setFontPair] = useState<typeof FONT_PAIRS[number]["id"]>(
    "space-grotesk",
  );
  const [tosAccepted, setTosAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function nextFromWallet() {
    if (!connected || !publicKey) return;
    setStep("brand");
  }

  function nextFromBrand() {
    setError(null);
    if (displayName.trim().length < 3) {
      setError("Name must be at least 3 characters");
      return;
    }
    const finalSlug = slug || slugify(displayName);
    if (!isValidSlug(finalSlug)) {
      setError("Slug must be 3-32 lowercase letters/numbers/dashes");
      return;
    }
    setSlug(finalSlug);
    if (!contactEmail.includes("@")) {
      setError("Valid email required");
      return;
    }
    setStep("style");
  }

  function nextFromStyle() {
    setStep("review");
  }

  async function submit() {
    if (!publicKey) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/r/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          display_name: displayName,
          owner_wallet: publicKey.toBase58(),
          contact_email: contactEmail,
          primary_color: primaryColor,
          accent_color: accentColor,
          font_pair: fontPair,
        }),
      });
      if (res.status === 409) {
        setError("That slug is already taken. Pick another.");
        setStep("brand");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(`/r/${slug}/admin`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">Run your own raffle</h1>
      <p className="text-sm opacity-70">Step: {step}</p>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200">
          {error}
        </div>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p>First, connect the wallet that will own this raffle space. That wallet receives all creator fees.</p>
          <p className="opacity-60 text-sm">{connected ? `Connected: ${publicKey?.toBase58().slice(0, 8)}…` : "Not connected"}</p>
          <button
            disabled={!connected}
            onClick={nextFromWallet}
            className="px-4 py-2 rounded-md bg-mint text-black disabled:opacity-30"
          >
            Continue
          </button>
        </div>
      )}

      {step === "brand" && (
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm mb-1">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              placeholder="MrBeast Raffles"
            />
          </label>
          <label className="block">
            <span className="block text-sm mb-1">URL slug</span>
            <input
              type="text"
              value={slug || slugify(displayName)}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 font-mono"
              placeholder="mrbeast"
            />
            <span className="block text-xs opacity-50 mt-1">
              tombola.app/r/{slug || slugify(displayName) || "your-slug"}
            </span>
          </label>
          <label className="block">
            <span className="block text-sm mb-1">Contact email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              placeholder="you@yourbrand.com"
            />
          </label>
          <button onClick={nextFromBrand} className="px-4 py-2 rounded-md bg-mint text-black">
            Continue
          </button>
        </div>
      )}

      {step === "style" && (
        <div className="space-y-4">
          <label className="block">
            <span className="block text-sm mb-1">Primary color</span>
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
            <span className="ml-2 font-mono text-sm">{primaryColor}</span>
          </label>
          <label className="block">
            <span className="block text-sm mb-1">Accent color</span>
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
            <span className="ml-2 font-mono text-sm">{accentColor}</span>
          </label>
          <label className="block">
            <span className="block text-sm mb-1">Font</span>
            <select
              value={fontPair}
              onChange={(e) => setFontPair(e.target.value as typeof fontPair)}
              className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
            >
              {FONT_PAIRS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <button onClick={nextFromStyle} className="px-4 py-2 rounded-md bg-mint text-black">
            Continue
          </button>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-md border border-neutral-700 p-4 bg-neutral-900">
            <p><strong>Name:</strong> {displayName}</p>
            <p><strong>URL:</strong> tombola.app/r/{slug}</p>
            <p><strong>Email:</strong> {contactEmail}</p>
            <p><strong>Owner wallet:</strong> {publicKey?.toBase58().slice(0, 16)}…</p>
            <div className="flex gap-3 mt-3">
              <div className="w-12 h-12 rounded-md border border-white/30" style={{ background: primaryColor }} />
              <div className="w-12 h-12 rounded-md border border-white/30" style={{ background: accentColor }} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={tosAccepted} onChange={(e) => setTosAccepted(e.target.checked)} className="mt-1" />
            <span>I confirm I&apos;m legally authorized to run raffles in my jurisdiction and accept the Tombola Terms of Service. Tombola is not responsible for any regulatory consequences of raffles I run.</span>
          </label>
          <button
            onClick={submit}
            disabled={!tosAccepted || submitting}
            className="px-4 py-2 rounded-md bg-mint text-black disabled:opacity-30"
          >
            {submitting ? "Creating…" : "Create raffle space"}
          </button>
        </div>
      )}
    </div>
  );
}
