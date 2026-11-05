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
  fs.mkdirSync(path.join(root, '.claude/skills/example'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.agents/skill-support/sources.json'),
    JSON.stringify({ version: 1, skills: [], snapshots: [] }),
  );
  fs.writeFileSync(
    path.join(root, '.agents/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\n# Example\n',
  );
  fs.writeFileSync(
    path.join(root, '.claude/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\nRead `.agents/skills/example/SKILL.md`.\n',
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

test('requires an adapter for each canonical skill', (context) => {
  const root = fixture(context);
  fs.unlinkSync(path.join(root, '.claude/skills/example/SKILL.md'));
  assert.ok(hasCode(validateSkills(root), 'missing-adapter'));
});

test('rejects an adapter with no canonical skill', (context) => {
  const root = fixture(context);
  fs.mkdirSync(path.join(root, '.claude/skills/orphan'));
  fs.writeFileSync(
    path.join(root, '.claude/skills/orphan/SKILL.md'),
    '---\nname: orphan\ndescription: Orphan.\n---\n',
  );
  assert.ok(hasCode(validateSkills(root), 'orphan-adapter'));
});

test('rejects an adapter pointing to a different canonical skill', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.claude/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\nRead `.agents/skills/other/SKILL.md`.\n',
  );
  assert.ok(hasCode(validateSkills(root), 'invalid-adapter-pointer'));
});

test('does not accept the correct pointer inside a fenced code block', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.claude/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\n```text\n`.agents/skills/example/SKILL.md`\n```\n',
  );
  assert.ok(hasCode(validateSkills(root), 'invalid-adapter-pointer'));
});

test('does not accept the correct pointer inside a tilde fenced code block', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.claude/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\n~~~text\n`.agents/skills/example/SKILL.md`\n~~~\n',
  );
  assert.ok(hasCode(validateSkills(root), 'invalid-adapter-pointer'));
});

test('keeps indented fences open after a shorter closing marker', (context) => {
  const root = fixture(context);
  for (const marker of ['`', '~']) {
    fs.writeFileSync(
      path.join(root, '.claude/skills/example/SKILL.md'),
      `---\nname: example\ndescription: Inspect examples when requested.\n---\n\n   ${marker.repeat(4)}text\n  ${marker.repeat(3)}\n\`.agents/skills/example/SKILL.md\`\n ${marker.repeat(4)}\n`,
    );
    assert.ok(hasCode(validateSkills(root), 'invalid-adapter-pointer'), marker);
  }
});

test('keeps fences open after a different marker or trailing text', (context) => {
  const root = fixture(context);
  for (const [opening, closing] of [
    ['~~~', '```'],
    ['```', '~~~'],
    ['~~~', '~~~text'],
    ['```', '```text'],
  ]) {
    fs.writeFileSync(
      path.join(root, '.claude/skills/example/SKILL.md'),
      `---\nname: example\ndescription: Inspect examples when requested.\n---\n\n${opening}text\n${closing}\n\`.agents/skills/example/SKILL.md\`\n`,
    );
    assert.ok(
      hasCode(validateSkills(root), 'invalid-adapter-pointer'),
      `${opening}/${closing}`,
    );
  }
});

test('accepts an active pointer after an indented longer closing fence', (context) => {
  const root = fixture(context);
  for (const marker of ['`', '~']) {
    fs.writeFileSync(
      path.join(root, '.claude/skills/example/SKILL.md'),
      `---\nname: example\ndescription: Inspect examples when requested.\n---\n\n ${marker.repeat(3)}text\n\`.agents/skills/other/SKILL.md\`\n   ${marker.repeat(4)} \t\nRead \`.agents/skills/example/SKILL.md\`.\n`,
    );
    assert.deepEqual(validateSkills(root), [], marker);
  }
});

test('rejects a wrong pointer even when the correct path is also mentioned', (context) => {
  const root = fixture(context);
  fs.writeFileSync(
    path.join(root, '.claude/skills/example/SKILL.md'),
    '---\nname: example\ndescription: Inspect examples when requested.\n---\n\nRead `.agents/skills/other/SKILL.md`; expected `.agents/skills/example/SKILL.md`.\n',
  );
  assert.ok(hasCode(validateSkills(root), 'invalid-adapter-pointer'));
});

test('rejects malformed and non-mapping adapter YAML', (context) => {
  const root = fixture(context);
  const adapter = path.join(root, '.claude/skills/example/SKILL.md');
  for (const yaml of ['name: [invalid', 'null', 'example', '- example']) {
    fs.writeFileSync(
      adapter,
      `---\n${yaml}\n---\n\nRead \`.agents/skills/example/SKILL.md\`.\n`,
    );
    assert.ok(hasCode(validateSkills(root), 'invalid-frontmatter'), yaml);
  }
});

test('rejects invalid and mismatched adapter names', (context) => {
  const root = fixture(context);
  const adapter = path.join(root, '.claude/skills/example/SKILL.md');
  for (const name of ['INVALID', 'other', 'null']) {
    fs.writeFileSync(
      adapter,
      `---\nname: ${name}\ndescription: Inspect examples when requested.\n---\n\nRead \`.agents/skills/example/SKILL.md\`.\n`,
    );
    assert.ok(
      validateSkills(root).some(
        (issue) =>
          ['invalid-name', 'name-folder-mismatch'].includes(issue.code) &&
          issue.path.startsWith('.claude/'),
      ),
      name,
    );
  }
});

test('rejects missing or changed adapter descriptions', (context) => {
  const root = fixture(context);
  const adapter = path.join(root, '.claude/skills/example/SKILL.md');
  for (const [description, code] of [
    ['null', 'invalid-description'],
    ['Different description.', 'adapter-description-mismatch'],
  ]) {
    fs.writeFileSync(
      adapter,
      `---\nname: example\ndescription: ${description}\n---\n\nRead \`.agents/skills/example/SKILL.md\`.\n`,
    );
    assert.ok(hasCode(validateSkills(root), code), description);
  }
});
