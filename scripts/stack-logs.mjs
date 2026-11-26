import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { normalizeComposeLine } from './log-format.mjs';

const args = process.argv.slice(2);
const dockerArgs = ['compose', 'logs', '--no-color', '--timestamps'];
const services = [];
let showHealth = false;
let raw = false;
let tail = '100';

for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument === '--follow' || argument === '-f') dockerArgs.push('--follow');
  else if (argument === '--all') showHealth = true;
  else if (argument === '--raw') raw = true;
  else if (argument === '--tail') {
    tail = args[++index];
    if (!/^\d+$/.test(tail ?? ''))
      throw new Error('--tail requires a non-negative integer');
  } else if (/^[a-z][a-z0-9_-]*$/.test(argument)) services.push(argument);
  else throw new Error(`Unknown logging option: ${argument}`);
}

const child = spawn('docker', [...dockerArgs, '--tail', tail, ...services], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

for (const stream of [child.stdout, child.stderr]) {
  createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => {
    const output = raw ? line : normalizeComposeLine(line, { showHealth });
    if (output !== null) process.stdout.write(output + '\n');
  });
}

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child.kill('SIGTERM');
  });
}
child.on('error', (error) => {
  console.error(
    normalizeComposeLine(
      `docker | ${JSON.stringify({ level: 'ERROR', event: 'log_reader_failed', msg: error.message })}`,
    ),
  );
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  if (!stopping && (code !== 0 || signal)) {
    console.error(
      normalizeComposeLine(
        `docker | ${JSON.stringify({ level: 'ERROR', event: 'log_reader_failed', exit_code: code, msg: 'Docker Compose log reader failed' })}`,
      ),
    );
    process.exitCode = code || 1;
  }
});
