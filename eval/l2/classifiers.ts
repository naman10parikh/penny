// L2 behavioral classifiers (E2) — the deterministic ($0) "for the correct reason" gates for
// GT-5..GT-9. Each returns pass|fail for a candidate response by checking BOTH (a) the correct
// behavior pattern from the brain and (b) a brain citation (the anti-slop / no-self-grading rule:
// a right answer for the wrong reason fails, because the next variant breaks it).
//
// These are NOT LLM judges (that is the L3 tier) — they are objective text predicates over the
// scenario's known correct/wrong fork (BATTLE-TESTED-SCENARIOS S-01/S-02/S-07/S-09/S-15). The
// scorer (run.ts) measures each classifier's agreement with the hand labels via F1 + Cohen's κ.

export type Verdict = "pass" | "fail";

/** A candidate passes only if the correct behavior is present AND a relevant brain ref is cited. */
function gate(behaviorOk: boolean, citesBrain: boolean): Verdict {
  return behaviorOk && citesBrain ? "pass" : "fail";
}

const cite = (s: string, ...refs: string[]): boolean => refs.some((r) => s.includes(r));

/** GT-5 · S-02 — dedup row + side-effect in ONE transaction (or event-id-as-PK); reject "write after". */
export function classifyGt5(c: string): Verdict {
  const t = c.toLowerCase();
  const oneTxn =
    /one (database )?transaction|same transaction|unique[- ]constraint|unique primary key|commit together|on conflict/.test(t);
  // The trap is PRESCRIBING a write-after-the-work (the vulnerable design), e.g. "INSERT … after
  // grantAccess completes". A correct answer that WARNS against it ("does not save you", "not safe")
  // must not trip the trap — exclude negated/cautionary mentions.
  const prescribesWriteAfter =
    /(insert into .*|write to it) after (doing the work|grantaccess|the work)/.test(t) &&
    !/does not save|not save you|do not write|don't write|is not safe/.test(t);
  return gate(oneTxn && !prescribesWriteAfter, cite(c, "S-02", "O-02"));
}

/** GT-6 · S-01 — re-fetch the canonical object; reject "trust payload order". */
export function classifyGt6(c: string): Verdict {
  const t = c.toLowerCase();
  const reFetch = /re-?fetch|retrieve the canonical|stripe\.subscriptions\.retrieve|canonical (subscription|object)/.test(t);
  const trustPayloadTrap =
    /from each (webhook )?payload|payload\.plan|data\.object\.plan|order the events by .* timestamp in the payload/.test(t);
  return gate(reFetch && !trustPayloadTrap, cite(c, "S-01", "Corollary A", "P-01"));
}

/** GT-7 · S-15 — entitlement off a derived paid-through date; reject raw status==='active'. */
export function classifyGt7(c: string): Verdict {
  const t = c.toLowerCase();
  const derived = /paid[- ]through|paid_through|derived .* date|last successful invoice/.test(t);
  // The trap is PRESCRIBING a raw-status gate ("grant access whenever status === active"). A correct
  // answer that NAMES the raw status only to reject it ("not the raw subscription.status") must not
  // trip — require an affirmative grant-on-status phrasing, not a mere mention.
  const rawStatusTrap =
    /grant access whenever .*active|if \(?\s*status\s*===?\s*'?active'?\s*\)?\s*grant|status is not 'canceled'/.test(t);
  return gate(derived && !rawStatusTrap, cite(c, "S-15", "O-03", "P-14"));
}

/** GT-8 · S-09 — real-time flush + daily reconcile + period/35-day rules; reject "nightly batch, Stripe queues". */
export function classifyGt8(c: string): Verdict {
  const t = c.toLowerCase();
  const realtimeReconcile =
    /(real[- ]time|near real-time).*(reconcil|meter-event-summary)|reconcil.*(daily|meter-event-summary)/.test(t);
  const batchTrap = /flush it nightly|nightly batch|stripe will queue|staging passed/.test(t);
  return gate(realtimeReconcile && !batchTrap, cite(c, "S-09", "O-06", "P-09"));
}

/** GT-9 · S-07 — re-read the anchor after conversion, expect immediate full charge; reject "anchor fixed". */
export function classifyGt9(c: string): Verdict {
  const t = c.toLowerCase();
  const reReadAnchor = /re-?read the (billing[_ ]cycle[_ ])?anchor|anchor .* resets? to trial-end|recompute .* (dates|reminders)/.test(t);
  const fixedAnchorTrap = /original pre-trial .* anchor|anchor is fixed|cache it once/.test(t);
  return gate(reReadAnchor && !fixedAnchorTrap, cite(c, "S-07", "P-07"));
}

export const CLASSIFIERS: Record<string, (c: string) => Verdict> = {
  "GT-5": classifyGt5,
  "GT-6": classifyGt6,
  "GT-7": classifyGt7,
  "GT-8": classifyGt8,
  "GT-9": classifyGt9,
};
