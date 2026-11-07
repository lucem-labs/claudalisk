import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const USAGE = 'Usage: node scripts/scan-images.mjs [--build] [--scan] --image <name>=<Dockerfile>...';

export class UsageError extends Error {
  exitCode = 2;
  constructor(message) {
    super(`${message}\n${USAGE}`);
  }
}

export function parseArgs(argv) {
  const options = { build: false, scan: false, images: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--build') options.build = true;
    else if (arg === '--scan') options.scan = true;
    else if (arg === '--image') options.images.push(parseImage(argv[++i]));
    else throw new UsageError(`Unknown argument '${arg}'.`);
  }
  if (!options.build && !options.scan) throw new UsageError('Pass --build, --scan or both.');
  if (options.images.length === 0) throw new UsageError('Name each image with --image <name>=<Dockerfile>.');
  return options;
}

export function parseImage(value) {
  const match = /^([a-z0-9][a-z0-9._-]*)=((backend|frontend)\/[A-Za-z0-9._/-]*Dockerfile[A-Za-z0-9._-]*)$/.exec(String(value ?? ''));
  if (!match || match[2].split('/').some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new UsageError(`'${value}' is not <name>=<Dockerfile>, with the Dockerfile under backend/ or frontend/.`);
  }
  return { tag: `${match[1]}:security`, dockerfile: match[2], context: match[3] };
}

export function buildImages({ images, root, run }) {
  for (const image of images) {
    const result = run('docker', ['build', '--pull', '--tag', image.tag, '--file', join(root, image.dockerfile), join(root, image.context)], { inherit: true });
    if (result.code !== 0) throw new Error(`Building ${image.tag} from ${image.dockerfile} failed.`);
  }
}

export function scanSavedImages({ images, root, run, work }) {
  const failed = [];
  for (const image of images) {
    const archive = join(work, `${image.tag.replace(/[:/]/g, '-')}.tar`);
    const saved = run('docker', ['save', '--output', archive, image.tag], {});
    if (saved.code !== 0) throw new Error(`Saving ${image.tag} failed; build it first with --build.`);
    const scan = run(
      'trivy',
      ['image', '--input', archive, '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL', '--ignore-unfixed', '--ignorefile', join(root, '.trivyignore.yaml'), '--exit-code', '1'],
      { inherit: true },
    );
    if (scan.code !== 0) failed.push(image.tag);
  }
  if (failed.length > 0) throw new Error(`Trivy found fixable HIGH or CRITICAL vulnerabilities in ${failed.join(', ')}.`);
}

export function runner(spawn = spawnSync) {
  return (command, args, { inherit }) => {
    const result = spawn(command, args, { stdio: inherit ? 'inherit' : 'pipe', encoding: 'utf8' });
    if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
    if (!inherit && result.status !== 0 && result.stderr) console.error(result.stderr);
    return { code: result.status ?? 1 };
  };
}

export function main(argv, { root, run = runner(), makeWork = () => mkdtempSync(join(tmpdir(), 'image-scan-')) } = {}) {
  const options = parseArgs(argv);
  if (options.build) buildImages({ images: options.images, root, run });
  if (options.scan) {
    const work = makeWork();
    try {
      scanSavedImages({ images: options.images, root, run, work });
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
}


export function scanImages({ appRoot, argv }) {
  main(argv, { root: appRoot });
}
