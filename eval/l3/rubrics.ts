// L3 trajectory rubrics (E3) — the EXTERNAL "for the correct reason" rubric for GT-10..GT-13.
//
// Each rubric is the objective bar a candidate trajectory must clear: the required design moves
// (must-have), the traps it must avoid (must-not), and the brain law it must cite (no self-grading —
// the verdict is the rubric, not a model's confidence). Both judges (the $0 deterministic one and the
// claude-opus-4-8 LLM judge) grade against THIS rubric, so they are calibrated to the same bar.

export interface Rubric {
  readonly task: string;
  readonly scenario: string;
  readonly title: string;
  /** the JTBD/opinion law a correct trajectory must cite */
  readonly law: string;
  /** design moves a passing trajectory MUST exhibit (all required, semantically) */
  readonly mustHave: readonly string[];
  /** traps a passing trajectory MUST NOT prescribe */
  readonly mustNot: readonly string[];
  /** deterministic positive signals (regex, case-insensitive) */
  readonly positivePatterns: readonly RegExp[];
  /** deterministic trap signals (regex, case-insensitive) — presence fails the trajectory */
  readonly trapPatterns: readonly RegExp[];
  /** brain refs that satisfy the citation requirement */
  readonly citations: readonly string[];
}

export const RUBRICS: Record<string, Rubric> = {
  "GT-10": {
    task: "GT-10",
    scenario: "S-13",
    title: "issue a scoped agent credential",
    law: "O-11 — the agent holds a scoped, capped, expiring credential; never raw PAN or an unbounded key.",
    mustHave: [
      "issue a seller-locked + amount-capped + time-expiring Shared Payment Token",
      "fuse with helios's balance-gated cap (import, do not rebuild the ledger)",
      "reconcile the agent's ledger vs the provider record",
    ],
    mustNot: ["hand the agent the raw card / a broadly-scoped API key / an unbounded credential"],
    positivePatterns: [
      /shared payment token|spt/i,
      /seller-locked|seller.lock/i,
      /capp?ed|cap of|\$\d+ (?:total|cap)/i,
      /expir/i,
      /helios|balance-gated|balance cap/i,
    ],
    trapPatterns: [
      /give the agent the api key|hand the agent (?:a|the) card|high limit|broadly-scoped|unbounded|we'?ll watch the logs/i,
    ],
    citations: ["O-11", "S-13"],
  },
  "GT-11": {
    task: "GT-11",
    scenario: "S-06",
    title: "upgrade-then-decline rollback",
    law: "S-06 — treat upgrade rollback as application logic you own, not a Stripe primitive (pay_now is unconfirmed: GAPS G-01).",
    mustHave: [
      "preview with the Upcoming Invoice API",
      "attempt the explicit invoice payment",
      "on decline, roll the plan back yourself (application logic, not an assumed primitive)",
    ],
    mustNot: ["assume a pay_now atomic charge-or-rollback primitive exists / trust auto-retry to fix it"],
    positivePatterns: [
      /roll (?:the plan |it )?back yourself|roll back .* yourself|application logic|module you own/i,
      /upcoming invoice|preview/i,
      /don'?t assume .* pay_now|not a stripe guarantee|actively broken/i,
    ],
    trapPatterns: [
      /stripe will automatically roll it back|trust pay_now|pay_now to handle .* atomically|auto.*retry .* fix/i,
    ],
    citations: ["S-06", "G-01"],
  },
  "GT-12": {
    task: "GT-12",
    scenario: "S-10",
    title: "bill-shock degrade",
    law: "O-08 — bill-shock is a product failure; degrade gracefully, never bill through silently.",
    mustHave: [
      "set billing thresholds + usage alerts (warn BEFORE money moves)",
      "degrade gracefully at the cap (cheaper model / queue / human approval)",
    ],
    mustNot: ["bill straight through silently / treat the runaway invoice as merely correct"],
    positivePatterns: [
      /billing threshold|usage alert|warn before|cap with warning/i,
      /degrade gracefully|cheaper model|queue runs|human approval/i,
    ],
    trapPatterns: [
      /bill whatever the meter records|just send it|no cap needed|the \$?40k invoice is correct/i,
    ],
    citations: ["S-10", "O-08"],
  },
  "GT-13": {
    task: "GT-13",
    scenario: "S-18",
    title: "migration cutover",
    law: "O-15 — migration order is import-first, cancel-old-after; always run-both-and-diff before cutover.",
    mustHave: [
      "import live into the new system FIRST",
      "run both systems and diff invoices during a reconciliation window",
      "cancel the OLD subscriptions only after the import is verified; carry retries + proration + tax",
    ],
    mustNot: ["cancel old subs before the import / skip the diff / bulk-export raw PANs"],
    positivePatterns: [
      /import (?:live )?(?:into the new system )?first|import.first/i,
      /run both systems|diff invoices|reconciliation window|run-both-and-diff/i,
      /cancel .* (?:old|after)|carry retries|proration.*tax/i,
    ],
    trapPatterns: [
      /cancel .* old (?:subscriptions|subs) first|export the card numbers|without a diff|one shot without/i,
    ],
    citations: ["S-18", "O-15"],
  },
};
