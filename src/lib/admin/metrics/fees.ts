// Shared fee-math helpers for admin aggregators. Mirrors the on-chain
// fee model exactly:
//
//   protocol_fee = total_pot * 50 / 10_000
//   creator_fee  = total_pot * creator_bps / 10_000   (private only)
//   winner_share = total_pot - protocol_fee - creator_fee
//
// VRF cost reimbursement is subtracted from the protocol fee at settle
// time, not from the winner share — see programs/raffle/src/instructions/
// settle_draw_*.rs for the canonical formula.

export const PROTOCOL_FEE_BPS = 50n;
export const BPS_DEN = 10_000n;

export function computeProtocolFee(totalPot: bigint): bigint {
  return (totalPot * PROTOCOL_FEE_BPS) / BPS_DEN;
}

export function computeCreatorFee(
  totalPot: bigint,
  creatorBps: bigint,
): bigint {
  if (creatorBps <= 0n) return 0n;
  return (totalPot * creatorBps) / BPS_DEN;
}

export function computeWinnerShare(
  totalPot: bigint,
  creatorBps: bigint,
): bigint {
  return (
    totalPot - computeProtocolFee(totalPot) - computeCreatorFee(totalPot, creatorBps)
  );
}

/** Net protocol fee actually accrued to treasury at settle (the
 *  `vrf_paid` reimbursement is taken out of the gross protocol fee). */
export function computeTreasuryShare(
  totalPot: bigint,
  vrfPaid: bigint,
): bigint {
  const gross = computeProtocolFee(totalPot);
  return gross > vrfPaid ? gross - vrfPaid : 0n;
}
