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

  for (const filename of files.filter(
    (file) => path.basename(file) === 'SKILL.md',
  )) {
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
      if (names.has(metadata.name))
        addIssue('duplicate-name', filename, metadata.name);
      names.add(metadata.name);
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
      'Skill manifests, local references and imported-source integrity passed. Behavioral evaluations are not executed by this check.',
    );
  process.exitCode = issues.length ? 1 : 0;
}
