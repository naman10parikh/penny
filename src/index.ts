// penny — package entry (A0 skeleton). B2 fills src/cli/*, the wire/review/etc. modules.
// Kept minimal and non-speculative: just a version constant + the pinned Stripe API version
// so `pnpm build` produces a valid dist/ before the command tree lands.

export const PENNY_VERSION = "0.1.0";

/** The pinned Stripe API version penny contracts against (brain: O-16 / S-17). */
export const STRIPE_API_VERSION = "2026-05-27.dahlia";
