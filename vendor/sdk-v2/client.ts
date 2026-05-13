// Tombola RaffleClient facade: a thin handwritten layer over the Codama-generated
// instruction builders + account decoders (D-061). Each method takes user-friendly
// arguments, derives the right PDAs via sdk/src/pdas.ts, and returns a Kit
// `Instruction` ready to drop into a transaction message. Account fetchers
// re-export the generated async fetchers, scoped to the RaffleClient's RPC.
//
// Step 11 SDK contract (D-058, D-061).

import {
  type Address,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Instruction,
  type Rpc,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type TransactionSigner,
} from "@solana/kit";

import {
  PROGRAM_ID,
  findConfigPda,
  findCounterPda,
  findPublicPoolPda,
  findPrivatePoolPda,
  findTicketBatchPda,
  findRedeemedCodePda,
  findWhitelistedPda,
} from "./pdas.js";
import { hashCode, type CodeTree } from "./codes.js";
import {
  // instruction builders
  getInitializeProtocolInstruction,
  getInitializePublicPoolInstruction,
  getBuyTicketPublicInstruction,
  getCommitDrawPublicInstruction,
  getSettleDrawPublicInstruction,
  getRetryDrawPublicInstruction,
  getReopenPublicPoolInstruction,
  getCreatePrivatePoolInstruction,
  getRedeemInviteCodeWhitelistInstruction,
  getRedeemInviteCodeOneTicketInstruction,
  getBuyTicketPrivateInstruction,
  getCommitDrawPrivateInstruction,
  getSettleDrawPrivateInstruction,
  getCloseEmptyPrivatePoolInstruction,
  getVoidInviteCodeInstruction,
  // account fetchers
  fetchProtocolConfig,
  fetchPublicPool,
  fetchPrivatePool,
  fetchPoolTypeCounter,
  fetchTicketBatch,
  fetchRedeemedCode,
  fetchWhitelisted,
  // types
  type AccessModeArgs,
  type ProtocolConfig,
  type PublicPool,
  type PrivatePool,
  type PoolTypeCounter,
  type TicketBatch,
  type RedeemedCode,
  type Whitelisted,
} from "./generated/index.js";

/** BPF Upgradeable Loader; owns ProgramData accounts. */
const BPF_LOADER_UPGRADEABLE = address(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

/** Public pool types — values match programs/raffle/src/state.rs::PoolType discriminants. */
export const PoolType = {
  Weekly: 0,
  Biweekly: 1,
  Triweekly: 2,
  Monthly: 3,
} as const;
export type PoolTypeValue = (typeof PoolType)[keyof typeof PoolType];

/** Public-pool durations in seconds (spec lines 29–34). */
export const POOL_DURATION_SECONDS: Record<PoolTypeValue, number> = {
  [PoolType.Weekly]: 7 * 86_400,
  [PoolType.Biweekly]: 14 * 86_400,
  [PoolType.Triweekly]: 21 * 86_400,
  [PoolType.Monthly]: 28 * 86_400,
};

export const TICKET_PRICE_LAMPORTS = 10_000_000n;

export type RaffleRpc = Rpc<GetAccountInfoApi & GetMultipleAccountsApi>;

export interface RaffleClientConfig {
  rpc: RaffleRpc;
  /** Defaults to the canonical raffle PROGRAM_ID. Override for forks/redeployments. */
  programId?: Address;
}

export class RaffleClient {
  readonly rpc: RaffleRpc;
  readonly programId: Address;

  constructor(cfg: RaffleClientConfig) {
    this.rpc = cfg.rpc;
    this.programId = cfg.programId ?? address(PROGRAM_ID);
  }

  // ===== PDA helpers =====

  configPda(): Promise<[Address, number]> {
    return findConfigPda(this.programId);
  }
  counterPda(poolType: PoolTypeValue): Promise<[Address, number]> {
    return findCounterPda(this.programId, poolType);
  }
  publicPoolPda(
    poolType: PoolTypeValue,
    round: bigint,
  ): Promise<[Address, number]> {
    return findPublicPoolPda(this.programId, poolType, round);
  }
  privatePoolPda(creator: Address, poolId: bigint): Promise<[Address, number]> {
    return findPrivatePoolPda(this.programId, creator, poolId);
  }
  ticketBatchPda(
    pool: Address,
    firstTicketId: bigint,
  ): Promise<[Address, number]> {
    return findTicketBatchPda(this.programId, pool, firstTicketId);
  }
  redeemedCodePda(
    pool: Address,
    codeHash: Uint8Array,
  ): Promise<[Address, number]> {
    return findRedeemedCodePda(this.programId, pool, codeHash);
  }
  whitelistedPda(pool: Address, wallet: Address): Promise<[Address, number]> {
    return findWhitelistedPda(this.programId, pool, wallet);
  }

  /** ProgramData PDA under the BPF Upgradeable Loader. Required by initialize_protocol. */
  async programDataPda(): Promise<Address> {
    const { 0: pda } = await getProgramDerivedAddress({
      programAddress: BPF_LOADER_UPGRADEABLE,
      seeds: [getAddressEncoder().encode(this.programId)],
    });
    return pda;
  }

  // ===== Account fetchers =====

  async getProtocolConfig(): Promise<ProtocolConfig> {
    const [pda] = await this.configPda();
    const acc = await fetchProtocolConfig(this.rpc, pda);
    return acc.data;
  }

  async getPublicPool(
    poolType: PoolTypeValue,
    round: bigint,
  ): Promise<PublicPool> {
    const [pda] = await this.publicPoolPda(poolType, round);
    const acc = await fetchPublicPool(this.rpc, pda);
    return acc.data;
  }

  async getPrivatePool(creator: Address, poolId: bigint): Promise<PrivatePool> {
    const [pda] = await this.privatePoolPda(creator, poolId);
    const acc = await fetchPrivatePool(this.rpc, pda);
    return acc.data;
  }

  async getPoolTypeCounter(poolType: PoolTypeValue): Promise<PoolTypeCounter> {
    const [pda] = await this.counterPda(poolType);
    const acc = await fetchPoolTypeCounter(this.rpc, pda);
    return acc.data;
  }

  async getTicketBatch(
    pool: Address,
    firstTicketId: bigint,
  ): Promise<TicketBatch> {
    const [pda] = await this.ticketBatchPda(pool, firstTicketId);
    const acc = await fetchTicketBatch(this.rpc, pda);
    return acc.data;
  }

  async getRedeemedCode(
    pool: Address,
    codeHash: Uint8Array,
  ): Promise<RedeemedCode> {
    const [pda] = await this.redeemedCodePda(pool, codeHash);
    const acc = await fetchRedeemedCode(this.rpc, pda);
    return acc.data;
  }

  async getWhitelisted(pool: Address, wallet: Address): Promise<Whitelisted> {
    const [pda] = await this.whitelistedPda(pool, wallet);
    const acc = await fetchWhitelisted(this.rpc, pda);
    return acc.data;
  }

  // ===== Instruction builders =====

  /** Initialize the protocol-singleton ProtocolConfig. Called once at deploy. */
  async initializeProtocol(args: {
    deployer: TransactionSigner;
    treasury: Address;
    vrfOracle: Address;
  }): Promise<Instruction> {
    const [config] = await this.configPda();
    const programData = await this.programDataPda();
    return getInitializeProtocolInstruction(
      {
        config,
        deployer: args.deployer,
        program: this.programId,
        programData,
        treasury: args.treasury,
        vrfOracle: args.vrfOracle,
      },
      { programAddress: this.programId },
    );
  }

  /** Bootstrap a public pool of the given type with its first close_time. */
  async initializePublicPool(args: {
    payer: TransactionSigner;
    poolType: PoolTypeValue;
    firstCloseTime: bigint;
  }): Promise<Instruction> {
    const [counter] = await this.counterPda(args.poolType);
    const [pool] = await this.publicPoolPda(args.poolType, 1n);
    return getInitializePublicPoolInstruction(
      {
        counter,
        pool,
        payer: args.payer,
        poolType: args.poolType,
        firstCloseTime: args.firstCloseTime,
      },
      { programAddress: this.programId },
    );
  }

  /**
   * Buy `quantity` tickets in the (poolType, round) public pool.
   * Returns the instruction + the firstTicketId used to derive the new TicketBatch PDA.
   * Two concurrent buyers can collide on first_ticket_id; on collision retry with the
   * latest pool.totalTickets via `firstTicketIdHint`.
   */
  async buyTicketPublic(args: {
    buyer: TransactionSigner;
    poolType: PoolTypeValue;
    round: bigint;
    quantity: bigint;
    firstTicketIdHint?: bigint;
  }): Promise<{
    instruction: Instruction;
    ticketBatch: Address;
    firstTicketId: bigint;
  }> {
    const [pool] = await this.publicPoolPda(args.poolType, args.round);
    const firstTicketId =
      args.firstTicketIdHint ??
      (await this.getPublicPool(args.poolType, args.round)).totalTickets;
    const [ticketBatch] = await this.ticketBatchPda(pool, firstTicketId);
    const instruction = getBuyTicketPublicInstruction(
      {
        pool,
        ticketBatch,
        buyer: args.buyer,
        poolType: args.poolType,
        round: args.round,
        quantity: args.quantity,
      },
      { programAddress: this.programId },
    );
    return { instruction, ticketBatch, firstTicketId };
  }

  /** Permissionless commit step. Bundle this with Switchboard's own commit ix in the same tx. */
  async commitDrawPublic(args: {
    caller: TransactionSigner;
    poolType: PoolTypeValue;
    round: bigint;
    randomnessAccount: Address;
  }): Promise<Instruction> {
    const [pool] = await this.publicPoolPda(args.poolType, args.round);
    return getCommitDrawPublicInstruction(
      {
        pool,
        randomnessAccount: args.randomnessAccount,
        caller: args.caller,
        poolType: args.poolType,
        round: args.round,
      },
      { programAddress: this.programId },
    );
  }

  /** Settle after the Switchboard reveal lands. Caller computes the winning batch off-chain. */
  async settleDrawPublic(args: {
    caller: TransactionSigner;
    poolType: PoolTypeValue;
    round: bigint;
    winningBatch: Address;
    winner: Address;
    treasury: Address;
    randomnessAccount: Address;
  }): Promise<Instruction> {
    const [pool] = await this.publicPoolPda(args.poolType, args.round);
    const [config] = await this.configPda();
    return getSettleDrawPublicInstruction(
      {
        pool,
        winningBatch: args.winningBatch,
        winner: args.winner,
        config,
        treasury: args.treasury,
        randomnessAccount: args.randomnessAccount,
        caller: args.caller,
        poolType: args.poolType,
        round: args.round,
      },
      { programAddress: this.programId },
    );
  }

  /** Reset back to Open if the oracle never reveals within 1h of close. */
  async retryDrawPublic(args: {
    caller: TransactionSigner;
    poolType: PoolTypeValue;
    round: bigint;
  }): Promise<Instruction> {
    const [pool] = await this.publicPoolPda(args.poolType, args.round);
    return getRetryDrawPublicInstruction(
      {
        pool,
        caller: args.caller,
        poolType: args.poolType,
        round: args.round,
      },
      { programAddress: this.programId },
    );
  }

  /** Open round N+1 after round N is Resolved. */
  async reopenPublicPool(args: {
    payer: TransactionSigner;
    poolType: PoolTypeValue;
  }): Promise<Instruction> {
    const counterAcc = await this.getPoolTypeCounter(args.poolType);
    const currentRound = counterAcc.currentRound;
    const [counter] = await this.counterPda(args.poolType);
    const [previousPool] = await this.publicPoolPda(
      args.poolType,
      currentRound,
    );
    const [newPool] = await this.publicPoolPda(
      args.poolType,
      currentRound + 1n,
    );
    return getReopenPublicPoolInstruction(
      {
        counter,
        previousPool,
        newPool,
        payer: args.payer,
        poolType: args.poolType,
      },
      { programAddress: this.programId },
    );
  }

  /**
   * Create a fresh private pool. `merkleRoot` should come from
   * `buildCodeTree(codes).root`. Use `accessMode = AccessMode.WhitelistMode | OneCodePerTicket`
   * via the generated AccessMode helper or the type alias re-exported from index.
   */
  async createPrivatePool(args: {
    creator: TransactionSigner;
    poolId: bigint;
    ticketPrice: bigint;
    duration: bigint;
    creatorFeeBps: number;
    accessMode: AccessModeArgs;
    merkleRoot: Uint8Array;
  }): Promise<Instruction> {
    const [pool] = await this.privatePoolPda(args.creator.address, args.poolId);
    return getCreatePrivatePoolInstruction(
      {
        pool,
        creator: args.creator,
        poolId: args.poolId,
        ticketPrice: args.ticketPrice,
        duration: args.duration,
        creatorFeeBps: args.creatorFeeBps,
        accessMode: args.accessMode,
        merkleRoot: args.merkleRoot,
      },
      { programAddress: this.programId },
    );
  }

  /** Redeem an invite code in WhitelistMode → emits a `Whitelisted` PDA for the buyer. */
  async redeemInviteCodeWhitelist(args: {
    buyer: TransactionSigner;
    pool: Address;
    code: string;
    proof: Uint8Array[];
  }): Promise<Instruction> {
    const codeBytes = new TextEncoder().encode(args.code);
    const codeHash = hashCode(args.code);
    const [redemptionRecord] = await this.redeemedCodePda(args.pool, codeHash);
    const [whitelisted] = await this.whitelistedPda(
      args.pool,
      args.buyer.address,
    );
    return getRedeemInviteCodeWhitelistInstruction(
      {
        pool: args.pool,
        redemptionRecord,
        whitelisted,
        buyer: args.buyer,
        code: codeBytes,
        proof: args.proof,
      },
      { programAddress: this.programId },
    );
  }

  /** Redeem an invite code in OneCodePerTicket mode → directly mints a single-ticket batch. */
  async redeemInviteCodeOneTicket(args: {
    buyer: TransactionSigner;
    pool: Address;
    code: string;
    proof: Uint8Array[];
  }): Promise<Instruction> {
    const codeBytes = new TextEncoder().encode(args.code);
    const codeHash = hashCode(args.code);
    const [redemptionRecord] = await this.redeemedCodePda(args.pool, codeHash);
    const poolAcc = await fetchPrivatePool(this.rpc, args.pool);
    const [ticketBatch] = await this.ticketBatchPda(
      args.pool,
      poolAcc.data.totalTickets,
    );
    return getRedeemInviteCodeOneTicketInstruction(
      {
        pool: args.pool,
        redemptionRecord,
        ticketBatch,
        buyer: args.buyer,
        code: codeBytes,
        proof: args.proof,
      },
      { programAddress: this.programId },
    );
  }

  /** Buy `quantity` tickets in a WhitelistMode private pool (buyer must already be whitelisted). */
  async buyTicketPrivate(args: {
    buyer: TransactionSigner;
    pool: Address;
    quantity: bigint;
    firstTicketIdHint?: bigint;
  }): Promise<{
    instruction: Instruction;
    ticketBatch: Address;
    firstTicketId: bigint;
  }> {
    const [whitelisted] = await this.whitelistedPda(
      args.pool,
      args.buyer.address,
    );
    const firstTicketId =
      args.firstTicketIdHint ??
      (await fetchPrivatePool(this.rpc, args.pool)).data.totalTickets;
    const [ticketBatch] = await this.ticketBatchPda(args.pool, firstTicketId);
    const instruction = getBuyTicketPrivateInstruction(
      {
        pool: args.pool,
        whitelisted,
        ticketBatch,
        buyer: args.buyer,
        quantity: args.quantity,
      },
      { programAddress: this.programId },
    );
    return { instruction, ticketBatch, firstTicketId };
  }

  /** Permissionless private-pool commit. Bundle with Switchboard's commit ix in the same tx. */
  async commitDrawPrivate(args: {
    caller: TransactionSigner;
    pool: Address;
    randomnessAccount: Address;
  }): Promise<Instruction> {
    return getCommitDrawPrivateInstruction(
      {
        pool: args.pool,
        randomnessAccount: args.randomnessAccount,
        caller: args.caller,
      },
      { programAddress: this.programId },
    );
  }

  /** Settle a private pool — three-way payout (winner, treasury, creator). */
  async settleDrawPrivate(args: {
    caller: TransactionSigner;
    pool: Address;
    winningBatch: Address;
    winner: Address;
    creator: Address;
    treasury: Address;
    randomnessAccount: Address;
  }): Promise<Instruction> {
    const [config] = await this.configPda();
    return getSettleDrawPrivateInstruction(
      {
        pool: args.pool,
        winningBatch: args.winningBatch,
        winner: args.winner,
        config,
        treasury: args.treasury,
        creator: args.creator,
        randomnessAccount: args.randomnessAccount,
        caller: args.caller,
      },
      { programAddress: this.programId },
    );
  }

  /** Reclaim rent from an empty private pool that nobody bought into. Creator only. */
  closeEmptyPrivatePool(args: {
    creator: TransactionSigner;
    pool: Address;
  }): Instruction {
    return getCloseEmptyPrivatePoolInstruction(
      {
        pool: args.pool,
        creator: args.creator,
      },
      { programAddress: this.programId },
    );
  }

  /**
   * v2-only: creator burns an unredeemed invite code by creating the
   * RedeemedCode PDA with a sentinel redeemer (Pubkey::default()). Pool
   * must be in Open state and caller must be pool.creator.
   *
   * @param args.creator   Signer — must equal the pool's creator.
   * @param args.pool      Pool PDA address.
   * @param args.code      Raw invite code bytes (the on-chain Merkle leaf).
   * @param args.proof     Merkle proof for `code` against the pool's stored root.
   */
  async voidInviteCode(args: {
    creator: TransactionSigner;
    pool: Address;
    code: Uint8Array;
    proof: Uint8Array[];
  }): Promise<Instruction> {
    const codeHash = hashCode(args.code);
    const [redemptionRecord] = await findRedeemedCodePda(
      this.programId,
      args.pool,
      codeHash,
    );

    return getVoidInviteCodeInstruction(
      {
        pool: args.pool,
        creator: args.creator,
        redemptionRecord,
        code: args.code,
        proof: args.proof,
      },
      { programAddress: this.programId },
    );
  }
}

// Re-export the few generated symbols a typical SDK consumer wants ergonomic access to.
export type {
  ProtocolConfig,
  PublicPool,
  PrivatePool,
  PoolTypeCounter,
  TicketBatch,
  RedeemedCode,
  Whitelisted,
  AccessModeArgs,
  CodeTree,
};
export { AccessMode } from "./generated/index.js";
