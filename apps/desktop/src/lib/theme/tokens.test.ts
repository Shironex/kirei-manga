import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseRootTokens } from './contrast';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Every declaration in the file (comments and formatting ignored), in order. */
function declarations(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/[;{}]/)
    .map(d =>
      d
        .replace(/\s+/g, ' ')
        .replace(/\s*([:,()*/])\s*/g, '$1')
        .replace(/"/g, "'")
        .trim()
    )
    .filter(d => d.includes(':') && !d.startsWith('@'));
}

describe('tokens.css', () => {
  const app = read('../../styles/tokens.css');
  const approved = read('../../../../../docs/design/tokens.css');

  it('is the approved docs/design/tokens.css, declaration for declaration', () => {
    expect(declarations(app)).toEqual(declarations(approved));
  });

  it('declares the seed the cover sampler writes', () => {
    const tokens = parseRootTokens(app);
    expect(tokens.get('--seed-h')).toBe('268');
    expect(tokens.get('--seed-c')).toBe('0.13');
    expect(tokens.get('--strength')).toBe('1');
  });
});
