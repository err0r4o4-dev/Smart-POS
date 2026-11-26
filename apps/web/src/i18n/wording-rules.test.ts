import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findFiles(dir: string, matcher: (file: string) => boolean): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      result.push(...findFiles(full, matcher));
    } else if (matcher(full)) {
      result.push(full);
    }
  }
  return result;
}

describe('prohibited wording rules', () => {
  it('does not include the prohibited token in user-facing frontend source files', () => {
    const srcRoot = dirname(fileURLToPath(import.meta.url));
    const prohibitedToken = ['d', 'e', 'm', 'o'].join('');
    const sourceFiles = findFiles(
      srcRoot,
      (file) =>
        /\.(tsx?|css)$/.test(file) &&
        !file.includes('.test.') &&
        !file.includes('node_modules'),
    );
    const violations: { file: string; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8');
      const matches = content.match(
        new RegExp(`\\b${prohibitedToken}\\b`, 'i'),
      );
      if (matches) {
        violations.push({ file, match: matches[0] });
      }
    }

    expect(violations).toEqual([]);
  });
});
