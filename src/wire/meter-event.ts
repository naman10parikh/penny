// Meter-event timestamp guard (S-09 / P-09 / O-06) — the executable form of "the metered timestamp
// drop". Stripe SILENTLY DROPS meter events whose timestamp is outside the accepted window — no
// backfill, no error, you just under-bill, and staging never catches it because staging never
// crosses a billing-period boundary (BATTLE-TESTED-SCENARIOS S-09). The fix the brain earned: send
// near real-time and REJECT-LOUDLY any event you're about to flush late, rather than hand it to
// Stripe to silently drop. This pure validator is that loud rejection — `penny meter validate-event`
// and the chaos suite drive it.
//
// The accepted window (P-09, field-03 §2):
//   • not more than 35 CALENDAR DAYS in the past
//   • not more than 5 MINUTES in the future
//   • not OUTSIDE the current billing period (when a period is known)
// Any of those → reject (would be silently dropped by Stripe = a revenue leak). The point is the
// alarm: a dropped event must never be silent (JTBD-0 applied to usage telemetry).

/** The reason a meter-event timestamp would be silently dropped by Stripe (so penny rejects it loudly). */
export type DropReason =
  | "too_old" // > 35 calendar days in the past
  | "too_future" // > 5 minutes in the future
  | "outside_period"; // before the current billing period start / after its end

export interface MeterEventCheck {
  readonly accepted: boolean;
  /** Present iff !accepted — the specific window rule that would cause a silent drop. */
  readonly reason?: DropReason;
  /** A human/agent-readable line that ALWAYS cites the brain (the anti-slop / no-silent-drop gate). */
  readonly message: string;
}

// The documented window constants (P-09). Exported so the test asserts the exact boundaries, not magic numbers.
export const MAX_PAST_MS = 35 * 24 * 60 * 60 * 1000; // 35 calendar days
export const MAX_FUTURE_MS = 5 * 60 * 1000; // 5 minutes

/** An optional known billing period — when present, an event outside [start, end] is rejected (S-09's exact trap). */
export interface BillingPeriod {
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * Decide whether a meter event with `eventTsMs` (unix-ms) would be ACCEPTED by Stripe, or would be
 * SILENTLY DROPPED — in which case penny rejects it loudly with the brain-cited reason. `nowMs` is
 * injectable so the check is deterministic in tests. `period` is optional: when the current billing
 * period is known, the S-09 trap (timestamp outside the now-closed period) is caught directly.
 */
export function validateMeterEventTimestamp(
  eventTsMs: number,
  nowMs: number = Date.now(),
  period?: BillingPeriod,
): MeterEventCheck {
  // Guard against a NaN / non-finite timestamp up front (a malformed flush is exactly the S-09 input).
  if (!Number.isFinite(eventTsMs)) {
    return {
      accepted: false,
      reason: "too_old",
      message:
        "meter event timestamp is not a finite number — reject, do not flush a malformed event " +
        "(Stripe would drop it silently). [S-09 / P-09]",
    };
  }

  const ageMs = nowMs - eventTsMs; // positive = in the past

  if (ageMs > MAX_PAST_MS) {
    return {
      accepted: false,
      reason: "too_old",
      message:
        `meter event is ${Math.floor(ageMs / 86_400_000)}d old (> 35-day window) — Stripe SILENTLY DROPS it, ` +
        "no backfill. Send near real-time; reconcile vs meter-event-summary daily. [S-09 / P-09 / O-06]",
    };
  }

  if (-ageMs > MAX_FUTURE_MS) {
    return {
      accepted: false,
      reason: "too_future",
      message:
        "meter event timestamp is > 5 minutes in the future — rejected (clock skew / bad flush). " +
        "Emit at usage time, near real-time. [S-09 / P-09]",
    };
  }

  // The S-09 headline trap: the flush crosses a billing-period boundary, so the event lands OUTSIDE
  // the now-closed period and Stripe drops it with no error. When the period is known, catch it here.
  if (period) {
    if (eventTsMs < period.startMs || eventTsMs > period.endMs) {
      return {
        accepted: false,
        reason: "outside_period",
        message:
          "meter event timestamp is OUTSIDE the current billing period — Stripe silently drops it (the " +
          "S-09 nightly-batch-across-a-boundary leak). Treat UTC-midnight-on-anchor-day as a hard flush " +
          "deadline; alarm on divergence — never a silent drop. [S-09 / P-09 / O-06]",
      };
    }
  }

  return {
    accepted: true,
    message: "meter event within the accepted window (≤35d past, ≤5min future, in-period). [S-09 / P-09]",
  };
}
