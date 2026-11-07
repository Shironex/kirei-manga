/** AA: 4.5 for text, 3 for large text and for UI parts (focus rings, thumbs, icons). */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

export interface ContrastPair {
  /** A token, or a stack of tokens composited bottom-up. */
  fg: [string, ...string[]];
  bg: [string, ...string[]];
  min: number;
  use: string;
}

/**
 * The colour pairs the interface actually paints. contrast.test.ts holds each one
 * to its minimum for every cover seed; the design page shows them live.
 */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { fg: ['--fg-1'], bg: ['--ink-0'], min: AA_TEXT, use: 'Body text' },
  { fg: ['--fg-1'], bg: ['--ink-1'], min: AA_TEXT, use: 'Text on rail and panels' },
  { fg: ['--fg-1'], bg: ['--ink-2'], min: AA_TEXT, use: 'Text on controls' },
  { fg: ['--fg-1'], bg: ['--ink-3'], min: AA_TEXT, use: 'Text on hovered controls' },
  { fg: ['--fg-2'], bg: ['--ink-0'], min: AA_TEXT, use: 'Secondary text' },
  { fg: ['--fg-2'], bg: ['--ink-1'], min: AA_TEXT, use: 'Secondary text on panels' },
  { fg: ['--fg-2'], bg: ['--ink-2'], min: AA_TEXT, use: 'Secondary text on controls' },
  { fg: ['--fg-3'], bg: ['--ink-0'], min: AA_TEXT, use: 'Meta text' },
  { fg: ['--fg-3'], bg: ['--ink-1'], min: AA_TEXT, use: 'Meta text on panels' },
  { fg: ['--accent'], bg: ['--ink-0'], min: AA_TEXT, use: 'Accent labels' },
  { fg: ['--accent'], bg: ['--ink-1'], min: AA_TEXT, use: 'Accent labels on panels' },
  {
    fg: ['--on-accent'],
    bg: ['--accent'],
    min: AA_TEXT,
    use: 'Primary button label, new chapter badge',
  },
  { fg: ['--ink-0'], bg: ['--fg-1'], min: AA_TEXT, use: 'Selected segment, tooltip' },
  { fg: ['--ink-0'], bg: ['--err'], min: AA_TEXT, use: 'Danger button label' },
  { fg: ['--fg-1'], bg: ['--ink-1', '--accent-wash'], min: AA_TEXT, use: 'Selected nav item' },
  { fg: ['--fg-1'], bg: ['--ink-0', '--accent-wash'], min: AA_TEXT, use: 'Selected chip' },
  { fg: ['--accent'], bg: ['--ink-0', '--accent-wash'], min: AA_TEXT, use: 'Current chapter page' },
  { fg: ['--fg-1'], bg: ['--ink-stage', '--glass'], min: AA_TEXT, use: 'Reader chrome title' },
  { fg: ['--fg-3'], bg: ['--ink-stage', '--glass'], min: AA_TEXT, use: 'Reader chrome meta' },
  { fg: ['--ok'], bg: ['--ink-1'], min: AA_TEXT, use: 'Success text' },
  { fg: ['--warn'], bg: ['--ink-1'], min: AA_TEXT, use: 'Warning text' },
  { fg: ['--err'], bg: ['--ink-0'], min: AA_TEXT, use: 'Error text' },
  { fg: ['--err'], bg: ['--ink-1'], min: AA_TEXT, use: 'Error text on panels' },
  { fg: ['--accent'], bg: ['--ink-0'], min: AA_UI, use: 'Focus ring' },
  { fg: ['--accent'], bg: ['--ink-1', '--accent-wash'], min: AA_UI, use: 'Selected nav icon' },
  { fg: ['--accent'], bg: ['--ink-3'], min: AA_UI, use: 'Slider fill against its track' },
  { fg: ['--fg-1'], bg: ['--ink-1'], min: AA_UI, use: 'Slider thumb' },
  { fg: ['--fg-2'], bg: ['--ink-3'], min: AA_UI, use: 'Switch thumb, off' },
  { fg: ['--on-accent'], bg: ['--accent'], min: AA_UI, use: 'Switch thumb, on' },
];
