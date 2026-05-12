// Persistent notification store backed by localStorage. Notifications survive
// page refreshes; they live per-wallet so connecting a different wallet shows
// that wallet's history (and an unconnected visitor sees an empty inbox).
//
// API is dispatch-style: callers call `pushNotification(...)` from anywhere
// (winning a pool, creating a pool, redeeming a code), and the bell-icon
// component subscribes via the `subscribeNotifications(...)` listener.
//
// Schema is versioned. Old payloads from a previous schema get dropped on
// load (best-effort migration).

const SCHEMA_VERSION = 1;
const KEY_PREFIX = "tombola.notifications.v1.";
const MAX_PER_WALLET = 100;

export type NotificationKind =
  | "win"        // 🏆 — you won a pool
  | "purchase"   // ✓ — you bought tickets
  | "drawing"    // ◷ — pool you're in is drawing
  | "resolved"   // ✓ — pool you're in resolved (you didn't win)
  | "created"    // + — you created a new pool
  | "fee-paid"   // $ — your created pool settled, fees credited
  | "redeemed"   // ✦ — code redeemed in your pool
  | "invite"     // 🎟 — a friend invited you to a private pool
  | "friend-request" // 👤 — someone sent you a friend request
  | "info";      // i — generic informational

export interface Notification {
  id: string;          // unique, used for read tracking
  kind: NotificationKind;
  title: string;       // short headline (1 line)
  body?: string;       // optional secondary line
  /** href to navigate to on click. Optional — info notifications can be empty. */
  href?: string;
  /** unix seconds */
  createdAt: number;
  read: boolean;
}

interface OnDiskShape {
  schemaVersion: number;
  walletAddress: string;
  notifications: Notification[];
}

// ---------- storage ----------

function keyFor(wallet: string): string {
  return `${KEY_PREFIX}${wallet}`;
}

function loadFromStorage(wallet: string): Notification[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(wallet));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OnDiskShape;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return [];
    if (parsed.walletAddress !== wallet) return [];
    return parsed.notifications;
  } catch {
    return [];
  }
}

function writeToStorage(wallet: string, list: Notification[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: OnDiskShape = {
      schemaVersion: SCHEMA_VERSION,
      walletAddress: wallet,
      notifications: list.slice(0, MAX_PER_WALLET),
    };
    localStorage.setItem(keyFor(wallet), JSON.stringify(payload));
  } catch {
    // localStorage full / private mode — ignore
  }
}

// ---------- pub/sub ----------

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function notify(wallet: string): void {
  const set = listeners.get(wallet);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      // listener bug shouldn't break the store
    }
  }
}

export function subscribeNotifications(
  wallet: string,
  listener: Listener,
): () => void {
  let set = listeners.get(wallet);
  if (!set) {
    set = new Set();
    listeners.set(wallet, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(wallet);
  };
}

// Listen for cross-tab storage events (another tab pushed a notification).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(KEY_PREFIX)) return;
    const wallet = e.key.slice(KEY_PREFIX.length);
    notify(wallet);
  });
}

// ---------- API ----------

export interface PushArgs {
  wallet: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  /** Idempotency key — if a notification with this id already exists, skip
   *  the push. Useful for win events where the bus might fire twice. */
  dedupeId?: string;
}

export function pushNotification(args: PushArgs): Notification | null {
  const list = loadFromStorage(args.wallet);
  if (args.dedupeId) {
    const existingIdx = list.findIndex((n) => n.id === args.dedupeId);
    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      // Same dedupeId + same title/body/href = nothing to do. Don't
      // bump createdAt or mark unread; this is the hot-path on every
      // poll tick.
      if (
        existing.title === args.title &&
        existing.body === args.body &&
        existing.href === args.href
      ) {
        return null;
      }
      // Same dedupeId but title or body changed — typically because a
      // pseudo finally resolved and the renderer's body now reads
      // "marwan reserved a seat" instead of "5mvi…dYv5 reserved …".
      // Update in place WITHOUT bumping createdAt so the notification
      // doesn't jump back to the top of the list. Preserve the read flag
      // — if the user already saw it, no reason to re-surface as unread.
      const updated: Notification = {
        ...existing,
        title: args.title,
        body: args.body,
        href: args.href,
      };
      const next = [...list];
      next[existingIdx] = updated;
      writeToStorage(args.wallet, next);
      notify(args.wallet);
      return updated;
    }
  }
  const id = args.dedupeId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const note: Notification = {
    id,
    kind: args.kind,
    title: args.title,
    body: args.body,
    href: args.href,
    createdAt: Math.floor(Date.now() / 1000),
    read: false,
  };
  const next = [note, ...list].slice(0, MAX_PER_WALLET);
  writeToStorage(args.wallet, next);
  notify(args.wallet);
  return note;
}

export function getNotifications(wallet: string): Notification[] {
  return loadFromStorage(wallet);
}

export function unreadCount(wallet: string): number {
  return loadFromStorage(wallet).filter((n) => !n.read).length;
}

export function markAllRead(wallet: string): void {
  const list = loadFromStorage(wallet);
  const next = list.map((n) => (n.read ? n : { ...n, read: true }));
  writeToStorage(wallet, next);
  notify(wallet);
}

export function markRead(wallet: string, id: string): void {
  const list = loadFromStorage(wallet);
  const idx = list.findIndex((n) => n.id === id);
  if (idx === -1 || list[idx].read) return;
  const next = [...list];
  next[idx] = { ...next[idx], read: true };
  writeToStorage(wallet, next);
  notify(wallet);
}

export function clearAll(wallet: string): void {
  writeToStorage(wallet, []);
  notify(wallet);
}

/** Remove a single notification by id — used by the /notifications page's
 *  per-row delete button. No-op when the id isn't present. */
export function removeNotification(wallet: string, id: string): void {
  const list = loadFromStorage(wallet);
  const next = list.filter((n) => n.id !== id);
  if (next.length === list.length) return;
  writeToStorage(wallet, next);
  notify(wallet);
}
