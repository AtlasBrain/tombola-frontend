// Find the TicketBatch whose ticket-id range contains a winning_ticket_id.
// Pure function — extracted so it's unit-testable independent of React.

export interface BatchRange {
  batchAddress: string;
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
}

/**
 * Returns the batch whose [first, last] interval includes `winningTicketId`.
 * Returns null if no batch matches (impossible on-chain after a valid settle,
 * but defensive against pre-settle / data-race states).
 *
 * On-chain `settle_*` does the equivalent walk to validate `winning_batch`,
 * so the matching batch is always the canonical winner.
 */
export function findWinningBatch(
  batches: BatchRange[],
  winningTicketId: bigint,
): BatchRange | null {
  for (const b of batches) {
    if (
      b.firstTicketId <= winningTicketId &&
      winningTicketId <= b.lastTicketId
    ) {
      return b;
    }
  }
  return null;
}
