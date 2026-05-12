// Client helper for /api/users/search.
//
// The palette uses this with a 150ms debounce to avoid spamming the
// endpoint on every keystroke. Results are typed so the palette can
// render pseudo / shortened wallet + privacy lock without
// re-validating shapes itself.

export interface UserSearchResult {
  wallet: string;
  /** null when the wallet has no claimed pseudo. */
  pseudo: string | null;
  isPublic: boolean;
}

export async function searchUsers(
  q: string,
  signal?: AbortSignal,
): Promise<UserSearchResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    if (res.status === 429) return [];
    throw new Error(`search ${res.status}`);
  }
  const json = (await res.json()) as { results?: UserSearchResult[] };
  return json.results ?? [];
}
