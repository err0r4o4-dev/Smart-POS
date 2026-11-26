import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import YAML from 'yaml';

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(filename) : [filename];
  });
}

function withoutFencedCode(content) {
  let opening;
  return content
    .split('\n')
    .filter((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (opening) {
        if (
          marker &&
          marker[1][0] === opening[0] &&
          marker[1].length >= opening.length &&
          /^[ \t]*$/.test(marker[2])
        )
          opening = undefined;
        return false;
      }
      if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
        opening = marker[1];
        return false;
      }
      return true;
    })
    .join('\n');
}

export function validateSkills(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  const names = new Set();
  const addIssue = (code, filename, detail) =>
    issues.push({
      code,
      path: path.relative(root, filename).replaceAll('\\', '/'),
      detail,
    });
  const files = walk(path.join(root, '.agents/skills'));
  const canonical = files.filter((file) => path.basename(file) === 'SKILL.md');
  const adapters = walk(path.join(root, '.claude/skills')).filter(
    (file) => path.basename(file) === 'SKILL.md',
  );
  const canonicalMetadata = new Map();

  for (const filename of [...canonical, ...adapters]) {
    const isAdapter = adapters.includes(filename);
    const content = fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n');
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!frontmatter) {
      addIssue('invalid-frontmatter', filename, 'Expected YAML frontmatter.');
      continue;
    }
    let metadata;
    try {
      metadata = YAML.parse(frontmatter[1]);
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        throw new Error('Expected a mapping.');
    } catch {
      addIssue(
        'invalid-frontmatter',
        filename,
        'YAML must parse as a mapping.',
      );
      continue;
    }
    if (
      typeof metadata.name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name) ||
      metadata.name.length > 64
    ) {
      addIssue(
        'invalid-name',
        filename,
        'Expected a short hyphen-case skill name.',
      );
    } else {
      if (!isAdapter && names.has(metadata.name))
        addIssue('duplicate-name', filename, metadata.name);
      if (!isAdapter) names.add(metadata.name);
      if (path.basename(path.dirname(filename)) !== metadata.name)
        addIssue('name-folder-mismatch', filename, metadata.name);
    }
    if (
      typeof metadata.description !== 'string' ||
      !metadata.description.trim()
    )
      addIssue(
        'invalid-description',
        filename,
        'A nonempty description is required.',
      );
    if (!isAdapter) canonicalMetadata.set(filename, metadata);
  }

  const canonicalSet = new Set(canonical);
  const adapterSet = new Set(adapters);
  for (const filename of canonical) {
    const name = path.basename(path.dirname(filename));
    const adapter = path.join(root, '.claude/skills', name, 'SKILL.md');
    if (!adapterSet.has(adapter)) {
      addIssue('missing-adapter', adapter, name);
      continue;
    }
    const content = fs.readFileSync(adapter, 'utf8').replaceAll('\r\n', '\n');
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!frontmatter) continue;
    let metadata;
    try {
      metadata = YAML.parse(frontmatter[1]);
    } catch {
      continue;
    }
    const source = canonicalMetadata.get(filename);
    if (
      source &&
      typeof source.description === 'string' &&
      typeof metadata?.description === 'string' &&
      metadata.description.trim() &&
      metadata.description !== source.description
    )
      addIssue('adapter-description-mismatch', adapter, name);
    const body = withoutFencedCode(
      content.slice(frontmatter[0].length),
    ).replace(/<!--[\s\S]*?-->/g, '');
    const pointers = [
      ...body.matchAll(/`(\.agents\/skills\/[^`\n]+\/SKILL\.md)`/g),
    ].map((match) => match[1]);
    const expected = `.agents/skills/${name}/SKILL.md`;
    if (
      !pointers.includes(expected) ||
      pointers.some((pointer) => pointer !== expected)
    )
      addIssue('invalid-adapter-pointer', adapter, name);
  }
  for (const adapter of adapters) {
    const name = path.basename(path.dirname(adapter));
    const filename = path.join(root, '.agents/skills', name, 'SKILL.md');
    if (!canonicalSet.has(filename)) addIssue('orphan-adapter', adapter, name);
  }

  for (const filename of files.filter((file) => file.endsWith('.md'))) {
    const content = fs
      .readFileSync(filename, 'utf8')
      .replace(/```[\s\S]*?```/g, '');
    for (const match of content.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
      const target = match[1].trim().split(/\s+"/)[0].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue;
      const relative = target.split('#')[0];
      if (
        relative &&
        !fs.existsSync(path.resolve(path.dirname(filename), relative))
      )
        addIssue('missing-reference', filename, relative);
    }
  }

  const registryPath = path.join(root, '.agents/skill-support/sources.json');
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (
      registry.version !== 1 ||
      !Array.isArray(registry.skills) ||
      !Array.isArray(registry.snapshots)
    )
      throw new Error('Invalid registry schema.');
  } catch {
    addIssue(
      'invalid-source-registry',
      registryPath,
      'Expected a version 1 source registry.',
    );
    return issues;
  }
  const recordedNames = new Set();
  for (const skill of registry.skills) {
    if (
      !skill ||
      typeof skill.name !== 'string' ||
      typeof skill.origin !== 'string'
    ) {
      addIssue(
        'invalid-source-skill',
        registryPath,
        'Each skill needs a name and origin.',
      );
      continue;
    }
    if (recordedNames.has(skill.name))
      addIssue('duplicate-source-skill', registryPath, skill.name);
    recordedNames.add(skill.name);
    if (!names.has(skill.name))
      addIssue('missing-source-skill', registryPath, skill.name);
  }
  for (const snapshot of registry.snapshots) {
    const relative = snapshot?.path;
    if (
      typeof relative !== 'string' ||
      relative.includes('\\') ||
      relative
        .split('/')
        .some((segment) => segment === '..' || segment === '.') ||
      !/^(?:\.agents\/skills\/|\.agents\/skill-support\/licenses\/)/.test(
        relative,
      )
    ) {
      addIssue('unsafe-source-path', registryPath, String(relative));
      continue;
    }
    const filename = path.resolve(root, relative);
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      addIssue('missing-snapshot', registryPath, relative);
      continue;
    }
    const content = fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n');
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (digest !== snapshot.sha256LF)
      addIssue(
        'snapshot-drift',
        filename,
        'Imported snapshot no longer matches its recorded LF-normalized SHA-256.',
      );
  }
  return issues;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  const issues = validateSkills(root);
  for (const issue of issues) console.error(JSON.stringify(issue));
  if (!issues.length)
    console.log(
      'Skill manifests, Claude adapter parity, local references and imported-source integrity passed. Behavioral evaluations are not executed by this check.',
    );
  process.exitCode = issues.length ? 1 : 0;
}
