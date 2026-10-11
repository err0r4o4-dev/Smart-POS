import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateSkills } from './validate.mjs';

function fixture(context) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'smartpos-skill-validation-'),
  );
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.agents/skills/example'), { recursive: true });
  fs.mkdirSync(path.join(root, '.agents/skill-support'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.agents/skill-support/sources.json'),
    JSON.stringify({ version: 1, skills: [], snapshots: [] }),
  );
  fs.writeFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\n# Example\n',
  );
  return root;
}

function hasCode(issues, code) {
  return issues.some((issue) => issue.code === code);
}

test('accepts a valid local manifest and source registry', (context) => {
  assert.deepEqual(validateSkills(fixture(context)), []);
});

test('rejects a malformed YAML manifest', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    '---\nname: [invalid\ndescription: example\n---\n',
  );
  assert.ok(hasCode(validateSkills(root), 'invalid-frontmatter'));
});

test('rejects missing name and description', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    '---\nmetadata: {}\n---\n',
  );
  const issues = validateSkills(root);
  assert.ok(hasCode(issues, 'invalid-name'));
  assert.ok(hasCode(issues, 'invalid-description'));
});

test('detects duplicate skill identities', (context) => {
  const root = fixture(context);
  fs.mkdirSync(path.join(root, '.agents/skills/another'));
  fs.copyFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    path.join(root, '.agents/skills/another/SKILL.md'),
  );
  assert.ok(hasCode(validateSkills(root), 'duplicate-name'));
});

test('detects a broken relative reference', (context) => {
  const root = fixture(context);
  fs.appendFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    '\n[Missing](references/missing.md)\n',
  );
  assert.ok(hasCode(validateSkills(root), 'missing-reference'));
});

test('rejects source paths outside the local skill scope', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.agents/skill-support/sources.json'),
    JSON.stringify({
      version: 1,
      skills: [],
      snapshots: [{ path: '../../global/SKILL.md', sha256LF: '0'.repeat(64) }],
    }),
  );
  assert.ok(hasCode(validateSkills(root), 'unsafe-source-path'));
});

test('detects modified imported source content', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.agents/skill-support/sources.json'),
    JSON.stringify({
      version: 1,
      skills: [],
      snapshots: [
        { path: '.agents/skills/example/SKILL.md', sha256LF: '0'.repeat(64) },
      ],
    }),
  );
  assert.ok(hasCode(validateSkills(root), 'snapshot-drift'));
});

test('normalizes line endings for source integrity', (context) => {
  const root = fixture(context);
  const content = fs.readFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    'utf8',
  );
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  fs.writeFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    content.replaceAll('\n', '\r\n'),
  );
  fs.writeFileSync(
    path.join(root, '.agents/skill-support/sources.json'),
    JSON.stringify({
      version: 1,
      skills: [],
      snapshots: [
        { path: '.agents/skills/example/SKILL.md', sha256LF: digest },
      ],
    }),
  );
  assert.deepEqual(validateSkills(root), []);
});

test('validates links inside supporting references too', (context) => {
  const root = fixture(context);
  fs.mkdirSync(path.join(root, '.agents/skills/example/references'));
  fs.writeFileSync(
    path.join(root, '.agents/skills/example/references/details.md'),
    '# Detail\n\n[Missing](other.md)\n',
  );
  assert.ok(hasCode(validateSkills(root), 'missing-reference'));
});

test('detects a provenance record pointing at an absent skill', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.agents/skill-support/sources.json'),
    JSON.stringify({
      version: 1,
      skills: [{ name: 'absent', origin: 'local-authored' }],
      snapshots: [],
    }),
  );
  assert.ok(hasCode(validateSkills(root), 'missing-source-skill'));
});
