function ts(): string {
  return new Date().toISOString();
}

function poolTag(address: string): string {
  return `[${address.slice(0, 8)}…]`;
}

export function log(poolAddress: string, msg: string): void {
  console.log(`${ts()} ${poolTag(poolAddress)} ${msg}`);
}

export function logError(poolAddress: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`${ts()} ${poolTag(poolAddress)} ERROR ${msg}: ${detail}`);
}

export function logInfo(msg: string): void {
  console.log(`${ts()} ${msg}`);
}
