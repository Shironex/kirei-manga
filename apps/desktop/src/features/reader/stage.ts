/**
 * Background of the full-window reader before pages show: the loading and
 * message screens, and the route's pending screen while its chunk loads.
 * Kept out of ReaderPage so the router can use it without loading the reader.
 */
export const READER_STAGE =
  'fixed inset-0 bg-[radial-gradient(70%_80%_at_50%_45%,oklch(0.17_calc(var(--accent-c)*0.35)_var(--seed-h)),var(--ink-stage)_75%)]';
