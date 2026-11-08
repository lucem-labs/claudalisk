import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(repository, 'templates', 'app');
const workflows = join(app, '.github', 'workflows');
const manifest = JSON.parse(readFileSync(join(repository, 'packages', 'scripts', 'package.json'), 'utf8'));

const load = (name) => parse(readFileSync(join(workflows, name), 'utf8'));
const ci = load('ci.yml');
const base = load('base.yml');
const security = load('security.yml');

const RUNS_ON = "${{ fromJSON(vars.CI_RUNS_ON || '[\"self-hosted\",\"linux\",\"ci\"]') }}";
const ROOT_INSTALL = 'npm ci --ignore-scripts --no-audit --no-fund';
const jobsOf = (workflow) => Object.entries(workflow.jobs);
const stepsOf = (workflow) => jobsOf(workflow).flatMap(([id, job]) => job.steps.map((step) => ({ id, step })));
const isScriptStep = (step) => /(?:^|\s)scripts\//.test(step.run ?? '');
const isRootInstall = (step) => step.run === ROOT_INSTALL && step['working-directory'] === undefined;

test('ci runs on every push but main and on dispatch, one run per ref', () => {
  assert.deepEqual(ci.name, 'ci');
  assert.deepEqual(Object.keys(ci.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(ci.on.push, { 'branches-ignore': ['main'] });
  assert.deepEqual(ci.concurrency, { group: 'ci-${{ github.ref }}', 'cancel-in-progress': true });
});

test('base runs on pushes to main and on dispatch, and cancels a superseded run', () => {
  assert.equal(base.name, 'base');
  assert.deepEqual(Object.keys(base.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(base.on.push, { branches: ['main'] });
  assert.equal(base.concurrency['cancel-in-progress'], true);
});

test('the jobs the layer flags and the base status need exist', () => {
  for (const id of ['base', 'backend', 'frontend', 'e2e', 'scripts', 'security']) assert.ok(ci.jobs[id], id);
  assert.deepEqual(Object.keys(base.jobs), ['base']);
});

test('every job of ci, base and security has a timeout, and all but the ZAP job use the runner the repository variable names', () => {
  for (const workflow of [ci, base, security]) {
    for (const [id, job] of jobsOf(workflow)) {
      if (workflow === security && id === 'zap') assert.deepEqual(job['runs-on'], ['self-hosted', 'linux', 'ci']);
      else assert.equal(job['runs-on'], RUNS_ON, id);
      assert.ok(Number.isInteger(job['timeout-minutes']) && job['timeout-minutes'] > 0, id);
    }
  }
});

test('every job that runs npm sets up Node 24 before it', () => {
  for (const workflow of [ci, base, security]) {
    for (const [id, job] of jobsOf(workflow)) {
      const runsNpm = job.steps.findIndex((step) => /(?:^|\s)npm /.test(step.run ?? ''));
      if (runsNpm < 0) continue;
      const setup = job.steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));
      assert.ok(setup >= 0 && setup < runsNpm, id);
      assert.equal(job.steps[setup].with['node-version'], 24, id);
      assert.equal(job.steps[setup].if, undefined, id);
    }
  }
});

test('permissions are read-only except the statuses of the base jobs', () => {
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.deepEqual(ci.jobs.base.permissions, { contents: 'read', statuses: 'write' });
  for (const [id, job] of jobsOf(ci)) {
    if (id !== 'base') assert.equal(job.permissions, undefined, id);
  }
  assert.deepEqual(base.permissions, {});
  assert.deepEqual(base.jobs.base.permissions, { contents: 'read', statuses: 'write', 'pull-requests': 'read' });
});

test('bash is the shell of every workflow', () => {
  for (const workflow of [ci, base, security]) {
    for (const [id, job] of jobsOf(workflow)) assert.equal((job.defaults ?? workflow.defaults).run.shell, 'bash', id);
    assert.ok(!JSON.stringify(workflow).includes('pwsh'));
    for (const { step } of stepsOf(workflow)) assert.equal(step.shell, undefined);
  }
});

test('every action is pinned to a full commit SHA', () => {
  for (const workflow of [ci, base, security]) {
    for (const { id, step } of stepsOf(workflow)) {
      if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/, `${id}: ${step.uses}`);
    }
  }
});

test('every run is one line and takes no expression of event data', () => {
  for (const workflow of [ci, base, security]) {
    for (const { id, step } of stepsOf(workflow)) {
      if (step.run === undefined) continue;
      assert.ok(!step.run.trim().includes('\n'), `${id}: ${step.run}`);
      assert.ok(!step.run.includes('${{'), `${id}: ${step.run}`);
    }
  }
});

test('every checkout drops the credentials, and the jobs that compare with origin/main fetch all history', () => {
  for (const workflow of [ci, base]) {
    for (const { id, step } of stepsOf(workflow)) {
      if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'], false, id);
    }
  }
  const checkout = (id) => ci.jobs[id].steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout('backend').with['fetch-depth'], 0);
  assert.equal(checkout('security').with['fetch-depth'], 0);
});

test('no job starts a database service, because the tests start theirs', () => {
  for (const [id, job] of jobsOf(ci)) assert.equal(job.services, undefined, id);
});

test('the scripts package is installed at the root before the first step that runs a script', () => {
  for (const workflow of [ci, base]) {
    for (const [id, job] of jobsOf(workflow)) {
      const install = job.steps.findIndex(isRootInstall);
      assert.ok(install >= 0, `${id} installs the scripts package`);
      const first = job.steps.findIndex(isScriptStep);
      if (first >= 0) assert.ok(install < first, id);
    }
  }
});

test('every script a workflow runs is an entry the template ships', () => {
  for (const workflow of [ci, base]) {
    for (const { id, step } of stepsOf(workflow)) {
      for (const [, name] of (step.run ?? '').matchAll(/\bscripts\/([\w-]+\.mjs)/g)) {
        assert.ok(existsSync(join(app, 'scripts', name)), `${id}: ${name}`);
      }
    }
  }
});

test('the backend job checks migrations, builds without node reuse and annotates failing tests', () => {
  const runs = ci.jobs.backend.steps.map((step) => step.run ?? '');
  assert.ok(runs.includes('node scripts/check-migrations.mjs'));
  assert.ok(runs.some((run) => /^dotnet build backend\/\S+\.slnx -nodeReuse:false$/.test(run)));
  assert.ok(runs.some((run) => /^dotnet test --solution backend\/\S+\.slnx --no-build --report-xunit-trx --results-directory "\$RUNNER_TEMP\/trx"$/.test(run)));
  const annotate = ci.jobs.backend.steps.find((step) => step.run?.startsWith('node scripts/trx-annotations.mjs'));
  assert.equal(annotate.if, 'failure()');
});

test('every .NET install runs only on GitHub-hosted runners, because self-hosted runners ship the SDK and cannot write its folder', () => {
  const installs = [ci, security].flatMap(stepsOf).filter(({ step }) => step.uses?.startsWith('actions/setup-dotnet@'));
  assert.ok(installs.length > 0);
  for (const { id, step } of installs) assert.equal(step.if, "runner.environment == 'github-hosted'", id);
});

test('a failing migration check still shows the build and test results', () => {
  const steps = ci.jobs.backend.steps;
  const build = steps.find((step) => step.name === 'Build');
  const tests = steps.find((step) => step.name === 'Tests');
  assert.equal(build.id, 'build');
  assert.equal(build.if, '${{ !cancelled() }}');
  assert.equal(tests.if, "${{ !cancelled() && steps.build.outcome == 'success' }}");
  assert.ok(steps.indexOf(build) > steps.findIndex((step) => step.run === 'node scripts/check-migrations.mjs'));
});

test('the e2e job gets free ports and uploads the Playwright report when it fails', () => {
  const steps = ci.jobs.e2e.steps;
  assert.ok(steps.some((step) => step.run === 'node scripts/free-ports.mjs E2E_API_PORT E2E_WEB_PORT'));
  const browser = steps.find((step) => step.name === 'Install the browser');
  assert.equal(browser.if, undefined);
  assert.equal(browser.run, 'if [ "$RUNNER_ENVIRONMENT" = "github-hosted" ]; then npx playwright install --with-deps chromium; else npx playwright install chromium; fi');
  assert.equal(browser['working-directory'], 'frontend');
  const upload = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.if, 'failure()');
  assert.equal(upload.with.path, 'frontend/playwright-report');
  assert.ok(steps.indexOf(upload) > steps.findIndex((step) => step.run === 'npm run e2e'));
});

test('the frontend job runs lint with GitHub annotations, typecheck, tests and the build', () => {
  const runs = ci.jobs.frontend.steps.filter((step) => step['working-directory'] === 'frontend').map((step) => step.run);
  assert.deepEqual(runs, [ROOT_INSTALL, 'npm run lint:ci', 'npm run typecheck', 'npm test', 'npm run build', 'npm run api:types && git diff --exit-code -- src/shared/api/schema.d.ts']);
  const frontend = ci.jobs.frontend.steps.filter((step) => step['working-directory'] === 'frontend');
  assert.equal(frontend.find((step) => step.run === 'npm run lint:ci').if, undefined);
  for (const command of ['npm run typecheck', 'npm test', 'npm run build']) {
    assert.equal(frontend.find((step) => step.run === command).if, '${{ !cancelled() }}', command);
  }
});

test('the scripts job runs the app tests and the comment check', () => {
  const runs = ci.jobs.scripts.steps.map((step) => step.run);
  assert.ok(runs.includes('node --test scripts/*.test.mjs'));
  assert.ok(runs.includes('node scripts/no-comments.mjs --skip frontend/.claude/skills/shadcn'));
});

test('the security job runs the checks of CLA-0026 and CLA-0071, each even when another failed', () => {
  const steps = ci.jobs.security.steps;
  for (const script of ['check-forbidden-files', 'check-source-hygiene', 'check-suppressions']) {
    const step = steps.find((candidate) => candidate.run === `node scripts/${script}.mjs`);
    assert.equal(step.if, '${{ !cancelled() }}', script);
  }
  const signatures = steps.findIndex((step) => step.run === 'npm audit signatures');
  assert.ok(signatures > steps.findIndex(isRootInstall));
});

test('each security step runs its command, and the scanners only when they were installed', () => {
  const steps = ci.jobs.security.steps;
  const always = '${{ !cancelled() }}';
  const installed = "${{ !cancelled() && steps.tools.outcome == 'success' }}";
  const install = steps.find((step) => step.id === 'tools');
  assert.equal(install.run, 'node scripts/install-security-tools.mjs --tool gitleaks,osv-scanner,trivy,zizmor,uv');
  const expected = [
    ['gitleaks', 'gitleaks git --redact --exit-code 1 .', installed],
    ['OSV-Scanner', 'osv-scanner scan --config osv-scanner.toml --lockfile package-lock.json --lockfile frontend/package-lock.json', installed],
    ['zizmor', 'zizmor --format github --config .github/zizmor.yml .github/workflows', installed],
    ['Trivy', 'trivy config --exit-code 1 --ignorefile .trivyignore.yaml .', installed],
    ['forbidden files', 'node scripts/check-forbidden-files.mjs', always],
    ['source hygiene', 'node scripts/check-source-hygiene.mjs', always],
    ['suppressions', 'node scripts/check-suppressions.mjs', always],
    ['npm audit signatures', 'npm audit signatures', always],
  ];
  for (const [name, run, condition] of expected) {
    const matching = steps.filter((step) => step.run === run);
    assert.equal(matching.length, 1, name);
    assert.equal(matching[0].if, condition, name);
  }
  const semgrep = steps.filter((step) => step.run?.includes(' semgrep scan '));
  assert.equal(semgrep.length, 1);
  assert.equal(semgrep[0].if, installed);
  assert.match(semgrep[0].run, /^uv tool run --python 3\.13 --from "semgrep==\$SEMGREP_VERSION" semgrep scan .*--error/);
  const nuget = steps.filter((step) => step.uses?.startsWith('lucem-labs/nuget-audit-action@'));
  assert.equal(nuget.length, 1);
  assert.equal(nuget[0].if, always);
  assert.equal(nuget[0].with.path.endsWith('.slnx'), true);
});

test('the base job passes the token through env, never inline', () => {
  for (const [workflow, command] of [[ci, 'node scripts/base-status.mjs'], [base, 'node scripts/base-status.mjs --open-pulls']]) {
    const step = workflow.jobs.base.steps.find((candidate) => candidate.run === command);
    assert.equal(step.env.GITHUB_TOKEN, '${{ github.token }}');
  }
});

test('the template package.json pins the scripts package exactly at the version in the repository', () => {
  const template = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  assert.equal(template.private, true);
  assert.equal(template.type, 'module');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(template.devDependencies, { '@claudalisk/scripts': manifest.version });
});

test('every entry in the template scripts folder has an exports entry in the package', () => {
  const entries = readdirSync(join(app, 'scripts')).filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs') && file !== 'verify.mjs');
  assert.ok(entries.length > 0);
  for (const file of entries) {
    const name = file.replace(/\.mjs$/, '');
    assert.ok(Object.hasOwn(manifest.exports, `./${name}`), name);
  }
});

test('every name an entry imports is exported by the module its export path points at', async () => {
  const entries = readdirSync(join(app, 'scripts')).filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs') && file !== 'verify.mjs');
  for (const file of entries) {
    const source = readFileSync(join(app, 'scripts', file), 'utf8');
    const imports = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@claudalisk\/scripts\/([\w-]+)'/g)];
    assert.ok(imports.length > 0, file);
    for (const [, names, subpath] of imports) {
      const target = manifest.exports[`./${subpath}`];
      assert.ok(target, `${file}: ./${subpath}`);
      const exported = await import(pathToFileURL(join(repository, 'packages', 'scripts', target)).href);
      for (const name of names.split(',').map((item) => item.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        assert.ok(Object.hasOwn(exported, name), `${file}: ${name} from ./${subpath}`);
      }
    }
  }
});

test('.gitattributes keeps LF line endings', () => {
  assert.match(readFileSync(join(app, '.gitattributes'), 'utf8'), /^\* text=auto eol=lf$/m);
});

test('no template file has CRLF line endings', () => {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(app);
  const crlf = files.filter((file) => {
    const buffer = readFileSync(file);
    return !buffer.includes(0) && buffer.includes('\r\n');
  });
  assert.deepEqual(crlf.map((file) => relative(repository, file)), []);
});
