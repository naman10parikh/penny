// SPT scope validator (pure). A Shared Payment Token is the agent's scoped credential: it is
// seller-locked + total-amount-capped + time-expiring, and meaningless outside that scope
// (O-11 / S-13). This is the payments-equivalent of "least agency". penny validates the scope
// BEFORE issuing and fuses it with helios's balance-gated cap (it consumes helios's ledger —
// it does NOT rebuild it). Pure function so the eval/test cluster can exercise it $0.

export interface SptScope {
  /** the only seller this token can pay (seller-locked) */
  readonly sellerId: string;
  /** total spend cap in the smallest currency unit (e.g. cents); must be > 0 */
  readonly capAmount: number;
  /** absolute expiry as a unix-ms timestamp; must be in the future */
  readonly expiresAt: number;
  /** the agent the credential is issued to (for the audit trail) */
  readonly agentId: string;
}

export type SptValidation =
  | { readonly ok: true; readonly scope: SptScope }
  | { readonly ok: false; readonly reason: string };

/**
 * Validate an SPT scope. Refuses anything unbounded — an uncapped, non-expiring, or
 * seller-unlocked token is exactly the "unbounded blast radius" O-11 forbids.
 */
export function validateSptScope(input: {
  sellerId?: string;
  capAmount?: number;
  expiresAt?: number;
  agentId?: string;
  now?: number;
}): SptValidation {
  const now = input.now ?? Date.now();

  if (!input.sellerId || input.sellerId.trim().length === 0) {
    return { ok: false, reason: "SPT must be seller-locked (--seller required). [O-11]" };
  }
  if (input.capAmount === undefined || !Number.isFinite(input.capAmount) || input.capAmount <= 0) {
    return { ok: false, reason: "SPT must be amount-capped (--cap must be a positive number). [O-11]" };
  }
  if (input.expiresAt === undefined || !Number.isFinite(input.expiresAt)) {
    return { ok: false, reason: "SPT must be time-expiring (--expires required). [O-11]" };
  }
  if (input.expiresAt <= now) {
    return { ok: false, reason: "SPT --expires must be in the future (an expired token is meaningless). [O-11]" };
  }
  if (!input.agentId || input.agentId.trim().length === 0) {
    return { ok: false, reason: "SPT must name the agent it is issued to (for the audit trail). [O-11]" };
  }

  return {
    ok: true,
    scope: {
      sellerId: input.sellerId,
      capAmount: input.capAmount,
      expiresAt: input.expiresAt,
      agentId: input.agentId,
    },
  };
}
