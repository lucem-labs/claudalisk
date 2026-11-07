import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectFolder, isInside, main, manifestPage, parseEnv, parseTarget } from './runners.mjs';
import { readRegistry, registerRunners } from './app-registry.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'runners-test-'));
let counter = 0;
const fresh = (...parts) => {
  const path = join(scratch, String(counter++), ...parts);
  mkdirSync(path, { recursive: true });
  return path;
};

const COMMIT = 'b'.repeat(40);
const IMAGE = `ghcr.io/lucem-labs/github-runner-dind@sha256:${'a'.repeat(64)}`;
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nSECRETMARKER123\n-----END RSA PRIVATE KEY-----';

const VALUES = {
  RUNNERS_PROJECT: 'acme-runners',
  RUNNERS_TARGET: '-Organization acme',
  RUNNERS_GROUP_ID: '7',
  RUNNERS_NAME_PREFIX: 'acme-runner',
  RUNNERS_LABELS: 'ci',
  RUNNER_MEMORY: '4g',
  RUNNER_IMAGE: IMAGE,
  RUNNERS_KIT_COMMIT: COMMIT,
};

const dotenv = (values) => `${Object.entries(values).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('\n')}\n`;

function makeFolder({ values = {}, local = {}, overlays = [], keyAt } = {}) {
  const dir = fresh('config');
  const key = keyAt ?? join(fresh('keys'), 'app.pem');
  writeFileSync(key, 'not a real key');
  writeFileSync(join(dir, 'runners.env'), dotenv({ ...VALUES, ...values }));
  writeFileSync(join(dir, 'runners.local.env'), dotenv({ GITHUB_APP_ID: '12345', GITHUB_APP_KEY_FILE: key.replace(/\\/g, '/'), ...local }));
  for (const name of overlays) writeFileSync(join(dir, name), 'services: {}\n');
  return { dir, key };
}

function fakeGh(routes = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    assert.equal(args[0], 'api');
    const at = args.indexOf('--method');
    const method = at >= 0 ? args[at + 1] : 'GET';
    const path = at >= 0 ? args[at + 2] : args[1];
    const [bare, query = ''] = path.split('?');
    const page = Number(/(?:^|&)page=(\d+)/.exec(query)?.[1] ?? 1);
    const route = routes[`${method} ${bare}`];
    if (route === undefined) throw new Error(`no route for ${method} ${bare}`);
    if (route instanceof Error) throw route;
    return JSON.stringify(typeof route === 'function' ? route(page, args) : route);
  };
  return { gh, calls };
}

const methodOf = (args) => (args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET');
const writes = (calls) => calls.filter((args) => methodOf(args) !== 'GET');

function fakeDocker({ ps = [], fail = false } = {}) {
  const calls = [];
  const docker = (args, options) => {
    calls.push({ args, options });
    if (fail) throw new Error('docker is not running');
    if (args[0] === 'ps') return ps.map((r) => JSON.stringify(r)).join('\n');
    if (args[0] === 'logs') return 'supervisor log line';
    return '';
  };
  return { docker, calls };
}

const composeCalls = (calls) => calls.filter((c) => c.args[0] === 'compose');

function fakeGit({ dirty = false, wrongHead = false, existing = false } = {}) {
  const calls = [];
  let head = existing ? COMMIT : '';
  const git = (args, options) => {
    calls.push({ args, cwd: options?.cwd });
    if (args[0] === 'clone') mkdirSync(join(args.at(-1), '.git'), { recursive: true });
    if (args.includes('checkout')) head = wrongHead ? 'f'.repeat(40) : COMMIT;
    if (args[0] === 'rev-parse') {
      if (!head) throw new Error('not a repository');
      return `${head}\n`;
    }
    if (args[0] === 'status') return dirty ? ' M compose.yaml\n' : '';
    return '';
  };
  return { git, calls };
}

function fakeServer() {
  const state = { handler: null, closed: false, port: 4321 };
  const createServer = (handler) => {
    state.handler = handler;
    return {
      listen(port, host, callback) {
        state.listened = { port, host };
        callback();
      },
      address: () => ({ port: state.port }),
      close() {
        state.closed = true;
      },
    };
  };
  const hit = (url) => {
    const response = { status: null, body: '' };
    state.handler({ url, method: 'GET' }, {
      writeHead(status) {
        response.status = status;
      },
      end(body) {
        response.body = body;
      },
    });
    return response;
  };
  return { state, createServer, hit };
}

function setup(options = {}) {
  const home = options.home ?? fresh('home');
  const out = [];
  const g = fakeGh(options.routes);
  const d = fakeDocker(options.docker);
  const git = fakeGit(options.git);
  const server = fakeServer();
  const deps = {
    docker: d.docker,
    gh: g.gh,
    git: git.git,
    home,
    write: (m) => out.push(m),
    platform: options.platform ?? 'linux',
    env: options.env ?? {},
    createServer: server.createServer,
    random: () => 'STATE1',
    timeoutMs: options.timeoutMs ?? 5000,
  };
  return { home, out, deps, gh: g, docker: d, git, server, run: (argv) => main(argv, deps) };
}

const stackOf = (dir, extra = {}) => ({ composeProject: 'acme-runners', configDir: dir, scope: 'organization', target: 'acme', groupId: 7, ...extra });
const linux = { platform: 'linux', env: {} };

const GROUP_OK = { name: 'Default', visibility: 'selected', allows_public_repositories: false };
const GROUP_PATH = 'GET orgs/acme/actions/runner-groups/7';

test('parseEnv reads KEY=VALUE, skips comments and blanks and does not interpolate', () => {
  const values = parseEnv('# note\n\nA=1\nB=${A}x\r\nC="quoted value"\nnot a line\n  D = x\nE=a=b\n');
  assert.deepEqual(values, { A: '1', B: '${A}x', C: 'quoted value', E: 'a=b' });
});

test('parseTarget accepts an organization or a repository and nothing else', () => {
  assert.deepEqual(parseTarget('-Organization acme'), { scope: 'organization', target: 'acme' });
  assert.deepEqual(parseTarget('-Repository acme/shop'), { scope: 'repository', target: 'acme/shop' });
  for (const bad of ['', '-Organization', '-Organization a/b', '-Repository acme', 'acme', '-Organization acme extra', undefined]) assert.equal(parseTarget(bad), null, String(bad));
});

test('a valid folder has no problems and yields its stack', () => {
  const { dir } = makeFolder();
  const folder = inspectFolder(dir, linux);
  assert.deepEqual(folder.problems, []);
  assert.deepEqual(folder.stack, stackOf(dir));
});

test('every problem of a folder is listed at once', () => {
  const { dir } = makeFolder({
    values: { RUNNERS_PROJECT: 'Bad Name', RUNNERS_TARGET: '-Organization', RUNNER_IMAGE: 'ghcr.io/x/y:latest', RUNNERS_KIT_COMMIT: 'abc' },
    local: { GITHUB_APP_ID: 'x1', GITHUB_APP_KEY_FILE: 'relative.pem' },
  });
  const problems = inspectFolder(dir, linux).problems.join('\n');
  for (const part of ['RUNNERS_PROJECT', 'RUNNERS_TARGET', 'RUNNER_IMAGE', 'RUNNERS_KIT_COMMIT must be 40 hex', 'GITHUB_APP_ID', 'absolute']) assert.match(problems, new RegExp(part));
});

test('a missing group id, kit commit and key file are each reported', () => {
  const { dir } = makeFolder({ values: { RUNNERS_GROUP_ID: undefined, RUNNERS_KIT_COMMIT: undefined }, local: { GITHUB_APP_KEY_FILE: join(fresh('keys'), 'gone.pem').replace(/\\/g, '/') } });
  const folder = inspectFolder(dir, linux);
  const problems = folder.problems.join('\n');
  assert.match(problems, /RUNNERS_GROUP_ID must be an integer/);
  assert.match(problems, /add RUNNERS_KIT_COMMIT=<commit> to runners\.env, so every pin is in that file/);
  assert.match(problems, /gone\.pem does not exist/);
  assert.equal(folder.stack, null);
});

test('a repository target needs no group id', () => {
  const { dir } = makeFolder({ values: { RUNNERS_TARGET: '-Repository acme/shop', RUNNERS_GROUP_ID: undefined } });
  const folder = inspectFolder(dir, linux);
  assert.deepEqual(folder.problems, []);
  assert.deepEqual(folder.stack, { composeProject: 'acme-runners', configDir: dir, scope: 'repository', target: 'acme/shop' });
});

test('a key inside a git work tree is refused', () => {
  const tree = fresh('tree');
  mkdirSync(join(tree, '.git'));
  const { dir } = makeFolder({ keyAt: join(tree, 'app.pem') });
  assert.match(inspectFolder(dir, linux).problems.join('\n'), /inside a git work tree/);
});

test('on win32 the config folder and the key must not sit under LOCALAPPDATA', () => {
  const localApp = fresh('Local');
  const keyed = makeFolder({ keyAt: join(localApp, 'app.pem') });
  const inApp = join(localApp, 'cfg');
  mkdirSync(inApp);
  writeFileSync(join(inApp, 'runners.env'), readFileSync(join(keyed.dir, 'runners.env')));
  writeFileSync(join(inApp, 'runners.local.env'), readFileSync(join(keyed.dir, 'runners.local.env')));
  const problems = inspectFolder(inApp, { platform: 'win32', env: { LOCALAPPDATA: localApp } }).problems.join('\n');
  assert.match(problems, /is under %LOCALAPPDATA%/);
  assert.match(problems, /GITHUB_APP_KEY_FILE .* is under %LOCALAPPDATA%/);
  assert.deepEqual(inspectFolder(inApp, { platform: 'linux', env: { LOCALAPPDATA: localApp } }).problems, []);
});

test('isInside compares case-insensitively only on win32', () => {
  const base = fresh('Case');
  assert.equal(isInside(join(base, 'sub'), base.toUpperCase(), 'win32'), true);
  assert.equal(isInside(join(base, 'sub'), join(base, 'other'), 'win32'), false);
  assert.equal(isInside(base, base, 'linux'), true);
});

test('a folder without runners.env or runners.local.env says so', () => {
  const dir = fresh('empty');
  const problems = inspectFolder(dir, linux).problems.join('\n');
  assert.match(problems, /runners\.env is missing/);
  assert.match(problems, /runners\.local\.env is missing/);
  assert.match(inspectFolder(join(dir, 'nope'), linux).problems.join('\n'), /does not exist/);
});

const RUNNERS_BODY = {
  runners: [
    { name: 'acme-runner-1', status: 'online', busy: true, labels: [{ name: 'self-hosted' }, { name: 'ci' }] },
    { name: 'acme-runner-2', status: 'offline', busy: false, labels: [{ name: 'ci' }] },
    { name: 'someone-else', status: 'online', busy: false, labels: [] },
  ],
};

const PS_ROWS = [
  { Names: 'acme-runners-supervisor-1', State: 'running', Labels: 'com.docker.compose.project=acme-runners,com.docker.compose.service=supervisor' },
  { Names: 'acme-runners-dind-1-1', State: 'running', Labels: 'com.docker.compose.project=acme-runners,com.docker.compose.service=dind-1' },
];

test('status reports containers, runners filtered by prefix and the group, with reads only', async () => {
  const { dir } = makeFolder();
  const t = setup({
    routes: {
      'GET orgs/acme/actions/runners': RUNNERS_BODY,
      [GROUP_PATH]: GROUP_OK,
      'GET orgs/acme/actions/runner-groups/7/repositories': { repositories: [{ full_name: 'acme/shop', private: true }] },
    },
    docker: { ps: PS_ROWS },
  });
  registerRunners(stackOf(dir), { home: t.home });
  await t.run(['status']);
  const text = t.out.join('\n');
  assert.match(text, /stack acme-runners: organization acme/);
  assert.match(text, /supervisor: running/);
  assert.match(text, /dind-1: running/);
  assert.match(text, /runners: 1 of 2 online \(1 busy\)/);
  assert.match(text, /runner acme-runner-1: online, busy, labels self-hosted, ci/);
  assert.doesNotMatch(text, /someone-else/);
  assert.match(text, /runner group Default \(id 7\): visibility selected, public repositories not allowed/);
  assert.match(text, /group repository acme\/shop: private/);
  assert.deepEqual(writes(t.gh.calls), []);
  assert.deepEqual(t.docker.calls[0].args, ['ps', '--all', '--filter', 'label=com.docker.compose.project=acme-runners', '--format', '{{json .}}']);
  assert.equal(t.docker.calls.length, 1);
});

test('status pages through runners and group repositories', async () => {
  const { dir } = makeFolder();
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const t = setup({
    routes: {
      'GET orgs/acme/actions/runners': (page) => ({ runners: page === 1 ? many(100, (i) => ({ name: `acme-runner-${i}`, status: 'online', busy: false, labels: [] })) : [{ name: 'acme-runner-x', status: 'online', busy: false, labels: [] }] }),
      [GROUP_PATH]: GROUP_OK,
      'GET orgs/acme/actions/runner-groups/7/repositories': (page) => ({ repositories: page === 1 ? many(100, (i) => ({ full_name: `acme/r${i}`, private: true })) : [{ full_name: 'acme/last', private: false }] }),
    },
  });
  await t.run(['status', '--config', dir]);
  const text = t.out.join('\n');
  assert.match(text, /runners: 101 of 101 online/);
  assert.match(text, /group repository acme\/last: public/);
});

test('status works on an unregistered folder that lacks the kit commit and warns', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_KIT_COMMIT: undefined } });
  const t = setup({ routes: { 'GET orgs/acme/actions/runners': { runners: [] }, [GROUP_PATH]: GROUP_OK, 'GET orgs/acme/actions/runner-groups/7/repositories': { repositories: [] } } });
  await t.run(['status', '--config', dir]);
  assert.match(t.out.join('\n'), /warning: RUNNERS_KIT_COMMIT is missing/);
  assert.equal(existsSync(join(t.home, '.claudalisk', 'apps.json')), false);
});

test('status says unknown when docker or gh fail, and never throws', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { 'GET orgs/acme/actions/runners': new Error('gh: not logged in'), [GROUP_PATH]: new Error('gh: not logged in') }, docker: { fail: true } });
  await t.run(['status', '--config', dir]);
  const text = t.out.join('\n');
  assert.match(text, /containers: unknown \(docker is not running\)/);
  assert.match(text, /runners: unknown \(gh: not logged in\)/);
  assert.match(text, /runner group: unknown/);
});

test('status of a repository stack says whether the repository is private', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_TARGET: '-Repository acme/shop', RUNNERS_GROUP_ID: undefined } });
  const t = setup({ routes: { 'GET repos/acme/shop/actions/runners': { runners: [] }, 'GET repos/acme/shop': { private: false } } });
  await t.run(['status', '--config', dir]);
  assert.match(t.out.join('\n'), /repository acme\/shop: PUBLIC/);
});

test('status with nothing registered says how to start', async () => {
  const t = setup();
  await t.run(['status']);
  assert.match(t.out.join('\n'), /no runner stack is registered/);
});

test('status --project names an unknown stack as an error', async () => {
  const t = setup();
  await assert.rejects(t.run(['status', '--project', 'nope']), /no runner stack named nope/);
});

test('adopt registers a valid folder and starts nothing', async () => {
  const { dir } = makeFolder();
  const t = setup();
  await t.run(['adopt', dir]);
  assert.deepEqual(readRegistry({ home: t.home }).runners, [stackOf(dir)]);
  assert.deepEqual(composeCalls(t.docker.calls), []);
  assert.deepEqual(t.docker.calls.map((c) => c.args[0]), ['ps']);
  assert.deepEqual(writes(t.gh.calls), []);
  assert.match(t.out.join('\n'), /nothing was started/);
});

test('adopt says it adopts the containers that already run', async () => {
  const { dir } = makeFolder();
  const t = setup({ docker: { ps: PS_ROWS } });
  await t.run(['adopt', dir]);
  assert.match(t.out.join('\n'), /2 container\(s\) of acme-runners are running; adopting them/);
});

test('adopt refuses on any problem and writes nothing', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_KIT_COMMIT: undefined, RUNNER_IMAGE: 'x:latest' } });
  const t = setup();
  await assert.rejects(t.run(['adopt', dir]), (e) => /RUNNERS_KIT_COMMIT/.test(e.message) && /RUNNER_IMAGE/.test(e.message) && /Nothing was changed/.test(e.message));
  assert.equal(existsSync(join(t.home, '.claudalisk', 'apps.json')), false);
  assert.deepEqual(t.docker.calls, []);
});

test('adopt refuses a second folder for a project that is registered elsewhere', async () => {
  const first = makeFolder();
  const second = makeFolder();
  const t = setup();
  await t.run(['adopt', first.dir]);
  await assert.rejects(t.run(['adopt', second.dir]), /already registered with the config folder/);
  assert.equal(readRegistry({ home: t.home }).runners[0].configDir, first.dir);
});

const INIT_ARGS = ['init', '--org', 'acme', '--kit-commit', COMMIT, '--image', IMAGE];

const ORG_ROUTES = {
  'GET users/acme': { type: 'Organization' },
  'GET orgs/acme/actions/runner-groups': { runner_groups: [{ id: 3, default: false }, { id: 1, default: true }] },
};

test('init writes runners.env for an organization with the default group and prints the next steps', async () => {
  const dir = join(fresh(), 'stack');
  const t = setup({ routes: ORG_ROUTES });
  await t.run([...INIT_ARGS, '--dir', dir]);
  assert.equal(readFileSync(join(dir, 'runners.env'), 'utf8'), [
    'RUNNERS_PROJECT=acme-runners',
    'RUNNERS_TARGET=-Organization acme',
    'RUNNERS_GROUP_ID=1',
    'RUNNERS_NAME_PREFIX=acme-runners',
    'RUNNERS_LABELS=ci',
    'RUNNER_MEMORY=4g',
    `RUNNER_IMAGE=${IMAGE}`,
    `RUNNERS_KIT_COMMIT=${COMMIT}`,
    '',
  ].join('\n'));
  assert.equal(existsSync(join(dir, 'runners.local.env')), false);
  const text = t.out.join('\n');
  assert.match(text, /app create/);
  assert.match(text, /group --config .* --apply/);
  assert.match(text, /up --config/);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('init uses the default folder under the home directory and honours the options', async () => {
  const t = setup({ routes: ORG_ROUTES });
  await t.run([...INIT_ARGS, '--project', 'mine', '--group-id', '9', '--prefix', 'pfx', '--labels', 'ci,big', '--memory', '8g']);
  const text = readFileSync(join(t.home, '.claudalisk', 'runners', 'mine', 'runners.env'), 'utf8');
  for (const line of ['RUNNERS_PROJECT=mine', 'RUNNERS_GROUP_ID=9', 'RUNNERS_NAME_PREFIX=pfx', 'RUNNERS_LABELS=ci,big', 'RUNNER_MEMORY=8g']) assert.ok(text.includes(line), line);
});

test('init refuses a user account for an organization stack and writes nothing', async () => {
  const dir = join(fresh(), 'stack');
  const t = setup({ routes: { 'GET users/acme': { type: 'User' } } });
  await assert.rejects(t.run([...INIT_ARGS, '--dir', dir]), /runners can only be shared between repositories in an organization; a free org is enough, or use --repo for one stack per repository/);
  assert.equal(existsSync(dir), false);
});

test('init in repository mode writes a repository target and refuses a public repository', async () => {
  const dir = join(fresh(), 'stack');
  const args = ['init', '--repo', 'acme/Shop.App', '--kit-commit', COMMIT, '--image', IMAGE, '--dir', dir];
  const publicRepo = setup({ routes: { 'GET users/acme': { type: 'User' }, 'GET repos/acme/Shop.App': { private: false } } });
  await assert.rejects(publicRepo.run(args), /is public/);
  assert.equal(existsSync(dir), false);
  const t = setup({ routes: { 'GET users/acme': { type: 'User' }, 'GET repos/acme/Shop.App': { private: true } } });
  await t.run(args);
  const text = readFileSync(join(dir, 'runners.env'), 'utf8');
  assert.match(text, /RUNNERS_PROJECT=shop-app-runners/);
  assert.match(text, /RUNNERS_TARGET=-Repository acme\/Shop\.App/);
  assert.doesNotMatch(text, /RUNNERS_GROUP_ID/);
});

test('init refuses an existing runners.env and leaves it untouched', async () => {
  const { dir } = makeFolder();
  const before = readFileSync(join(dir, 'runners.env'), 'utf8');
  const t = setup({ routes: ORG_ROUTES });
  await assert.rejects(t.run([...INIT_ARGS, '--dir', dir]), /already exists/);
  assert.equal(readFileSync(join(dir, 'runners.env'), 'utf8'), before);
  assert.deepEqual(t.gh.calls, []);
});

test('init refuses bad pins and bad names before any call', async () => {
  const t = setup({ routes: ORG_ROUTES });
  const cases = [
    [['init', '--org', 'acme', '--kit-commit', 'abc', '--image', IMAGE], /40 hex/],
    [['init', '--org', 'acme', '--kit-commit', COMMIT, '--image', 'ghcr.io/x:latest'], /pinned by digest/],
    [['init', '--org', 'acme', '--repo', 'a/b', '--kit-commit', COMMIT, '--image', IMAGE], /exactly one/],
    [['init', '--kit-commit', COMMIT, '--image', IMAGE], /exactly one/],
    [[...INIT_ARGS, '--project', 'Bad Project'], /not a valid Compose project name/],
    [[...INIT_ARGS, '--group-id', 'x'], /integer/],
  ];
  for (const [argv, pattern] of cases) await assert.rejects(t.run(argv), pattern);
  assert.deepEqual(t.gh.calls, []);
});

test('init refuses a folder under LOCALAPPDATA on win32', async () => {
  const localApp = fresh('Local');
  const t = setup({ routes: ORG_ROUTES, platform: 'win32', env: { LOCALAPPDATA: localApp } });
  await assert.rejects(t.run([...INIT_ARGS, '--dir', join(localApp, 'x')]), /LOCALAPPDATA/);
  assert.equal(existsSync(join(localApp, 'x')), false);
});

const CONVERSION = { id: 4242, slug: 'acme-runners-runners', pem: PEM };
const CONVERT = 'POST app-manifests/CODE123/conversions';
const CALLBACK = '/callback?code=CODE123&state=STATE1';

async function untilListening(t) {
  for (let i = 0; i < 50 && !t.server.state.handler; i += 1) await new Promise((r) => setImmediate(r));
  assert.ok(t.server.state.handler, 'the server never started');
  await new Promise((r) => setImmediate(r));
}

test('app create serves the manifest page, converts the code and saves the key without printing it', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { [CONVERT]: CONVERSION } });
  const done = t.run(['app', 'create', '--config', dir]);
  await untilListening(t);
  assert.deepEqual(t.server.state.listened, { port: 0, host: '127.0.0.1' });
  assert.match(t.out.join('\n'), /http:\/\/127\.0\.0\.1:4321\//);
  const page = t.server.hit('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /action="https:\/\/github\.com\/organizations\/acme\/settings\/apps\/new\?state=STATE1"/);
  const manifest = JSON.parse(/name="manifest" value="([^"]*)"/.exec(page.body)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(manifest, {
    name: 'acme-runners runners',
    url: 'https://github.com/lucem-labs/claudalisk',
    hook_attributes: { active: false },
    redirect_url: 'http://127.0.0.1:4321/callback',
    public: false,
    default_events: [],
    default_permissions: { organization_self_hosted_runners: 'write' },
  });
  assert.equal(t.server.hit('/callback?code=CODE123&state=WRONG').status, 400);
  assert.equal(t.server.state.closed, false);
  assert.equal(t.server.hit(CALLBACK).status, 200);
  await done;
  assert.equal(t.server.state.closed, true);
  const keyPath = join(t.home, '.config', 'claudalisk-runners', 'acme-runners-runners.pem');
  assert.equal(readFileSync(keyPath, 'utf8'), PEM);
  if (process.platform !== 'win32') assert.equal(statSync(keyPath).mode & 0o777, 0o600);
  const local = parseEnv(readFileSync(join(dir, 'runners.local.env'), 'utf8'));
  assert.equal(local.GITHUB_APP_ID, '4242');
  assert.equal(local.GITHUB_APP_KEY_FILE, keyPath.replace(/\\/g, '/'));
  assert.deepEqual(writes(t.gh.calls), [['api', '--method', 'POST', 'app-manifests/CODE123/conversions']]);
  const text = t.out.join('\n');
  assert.doesNotMatch(text, /SECRETMARKER123|BEGIN RSA/);
  assert.match(text, /App id: 4242/);
  assert.match(text, /App slug: acme-runners-runners/);
  assert.match(text, /https:\/\/github\.com\/apps\/acme-runners-runners\/installations\/new/);
  assert.equal(inspectFolder(dir, linux).problems.some((p) => /GITHUB_APP/.test(p)), false);
});

test('app create keeps other lines of runners.local.env and replaces the two it owns', async () => {
  const { dir } = makeFolder({ local: { EXTRA: 'keep' } });
  const t = setup({ routes: { [CONVERT]: CONVERSION } });
  const done = t.run(['app', 'create', '--config', dir, '--name', 'My runners']);
  await untilListening(t);
  assert.match(t.server.hit('/').body, /My runners/);
  t.server.hit(CALLBACK);
  await done;
  const local = parseEnv(readFileSync(join(dir, 'runners.local.env'), 'utf8'));
  assert.equal(local.EXTRA, 'keep');
  assert.equal(local.GITHUB_APP_ID, '4242');
});

test('app create in repository mode asks for administration on a user account', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_TARGET: '-Repository kacper/shop', RUNNERS_GROUP_ID: undefined } });
  const t = setup({ routes: { [CONVERT]: CONVERSION, 'GET users/kacper': { type: 'User' } } });
  const done = t.run(['app', 'create', '--config', dir]);
  await untilListening(t);
  const page = t.server.hit('/').body;
  assert.match(page, /action="https:\/\/github\.com\/settings\/apps\/new\?state=STATE1"/);
  assert.match(page, /administration/);
  assert.doesNotMatch(page, /organization_self_hosted_runners/);
  t.server.hit(CALLBACK);
  await done;
});

test('app create never leaks the key when the key file cannot be written', async () => {
  const { dir } = makeFolder();
  const before = readFileSync(join(dir, 'runners.local.env'), 'utf8');
  const t = setup({ routes: { [CONVERT]: CONVERSION } });
  const keyDir = join(t.home, '.config', 'claudalisk-runners');
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(join(keyDir, 'acme-runners-runners.pem'), 'existing');
  const done = t.run(['app', 'create', '--config', dir]);
  await untilListening(t);
  t.server.hit(CALLBACK);
  await assert.rejects(done, (e) => /already exists/.test(e.message) && !e.message.includes('SECRETMARKER123'));
  assert.equal(readFileSync(join(keyDir, 'acme-runners-runners.pem'), 'utf8'), 'existing');
  assert.equal(readFileSync(join(dir, 'runners.local.env'), 'utf8'), before);
  assert.doesNotMatch(t.out.join('\n'), /SECRETMARKER123/);
});

test('app create does not echo what GitHub or gh said when the conversion fails', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { [CONVERT]: new Error(`boom ${PEM}`) } });
  const done = t.run(['app', 'create', '--config', dir]);
  await untilListening(t);
  t.server.hit(CALLBACK);
  await assert.rejects(done, (e) => !e.message.includes('SECRETMARKER123') && /no App key was saved/.test(e.message));
  assert.equal(existsSync(join(t.home, '.config')), false);
  assert.doesNotMatch(t.out.join('\n'), /SECRETMARKER123/);
});

test('app create refuses an unexpected conversion shape without echoing it', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { [CONVERT]: { id: 'x', slug: '../evil', pem: PEM } } });
  const done = t.run(['app', 'create', '--config', dir]);
  await untilListening(t);
  t.server.hit(CALLBACK);
  await assert.rejects(done, (e) => !e.message.includes('SECRETMARKER123') && /unexpected shape/.test(e.message));
  assert.equal(existsSync(join(t.home, '.config')), false);
});

test('app create times out, closes the server and changes nothing', async () => {
  const { dir } = makeFolder();
  const before = readFileSync(join(dir, 'runners.local.env'), 'utf8');
  const t = setup({ routes: { [CONVERT]: CONVERSION }, timeoutMs: 20 });
  await assert.rejects(t.run(['app', 'create', '--config', dir]), /no callback arrived/);
  assert.equal(t.server.state.closed, true);
  assert.equal(readFileSync(join(dir, 'runners.local.env'), 'utf8'), before);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('app create ignores a callback code that is not a plain token', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { [CONVERT]: CONVERSION }, timeoutMs: 60 });
  const done = t.run(['app', 'create', '--config', dir]);
  await untilListening(t);
  assert.equal(t.server.hit('/callback?code=../../x&state=STATE1').status, 400);
  assert.equal(t.server.hit('/other').status, 404);
  await assert.rejects(done, /no callback arrived/);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('app create needs a runners.env first', async () => {
  const t = setup();
  await assert.rejects(t.run(['app', 'create', '--config', fresh('empty')]), /run "init"/);
  assert.equal(t.server.state.handler, null);
});

test('the manifest page escapes the manifest', () => {
  const page = manifestPage({ action: 'https://x/?a=1&b=2', manifest: { name: '"><script>' } });
  assert.doesNotMatch(page, /"><script>/);
  assert.match(page, /a=1&amp;b=2/);
});

test('group reports a good group and changes nothing', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { [GROUP_PATH]: GROUP_OK } });
  await t.run(['group', '--config', dir, '--apply']);
  assert.match(t.out.join('\n'), /as the runners need it/);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('group without --apply explains what is wrong and changes nothing', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { [GROUP_PATH]: { name: 'Default', visibility: 'private', allows_public_repositories: true } } });
  await t.run(['group', '--config', dir]);
  const text = t.out.join('\n');
  assert.match(text, /wrong: visibility is private, not selected/);
  assert.match(text, /wrong: it allows public repositories/);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('group --apply patches the group with the exact fields', async () => {
  const { dir } = makeFolder();
  let patched = false;
  const t = setup({ routes: {
    [GROUP_PATH]: () => (patched ? GROUP_OK : { name: 'Default', visibility: 'private', allows_public_repositories: true }),
    'PATCH orgs/acme/actions/runner-groups/7': () => { patched = true; return {}; },
  } });
  await t.run(['group', '--config', dir, '--apply']);
  assert.deepEqual(writes(t.gh.calls), [['api', '--method', 'PATCH', 'orgs/acme/actions/runner-groups/7', '-f', 'visibility=selected', '-F', 'allows_public_repositories=false']]);
  assert.match(t.out.join('\n'), /visibility selected, public repositories not allowed/);
});

test('group --apply refuses to leave visibility all when no repository is selected', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: {
    [GROUP_PATH]: { name: 'Default', visibility: 'all', allows_public_repositories: false },
    'GET orgs/acme/actions/runner-groups/7/repositories': { repositories: [] },
  } });
  await assert.rejects(t.run(['group', '--config', dir, '--apply']), /cut off every repository.*Nothing was changed/);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('group --apply from visibility all with a selected list warns and patches', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: {
    [GROUP_PATH]: { name: 'Default', visibility: 'all', allows_public_repositories: false },
    'GET orgs/acme/actions/runner-groups/7/repositories': { repositories: [{ full_name: 'acme/shop' }] },
    'PATCH orgs/acme/actions/runner-groups/7': {},
  } });
  await t.run(['group', '--config', dir, '--apply']);
  assert.match(t.out.join('\n'), /cuts off every repository not yet selected; selected now: acme\/shop/);
  assert.equal(writes(t.gh.calls).length, 1);
});

test('group refuses a repository stack', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_TARGET: '-Repository acme/shop', RUNNERS_GROUP_ID: undefined } });
  const t = setup();
  await assert.rejects(t.run(['group', '--config', dir]), /no runner group/);
});

function appRoot(repo) {
  const root = fresh('app');
  mkdirSync(join(root, '.claude'));
  writeFileSync(join(root, '.claude', 'claudalisk.json'), JSON.stringify({
    name: 'shop',
    hostPrefix: 'shop',
    repo,
    databases: [{ role: 'app', envVar: 'DB' }],
    ports: { devDb: 5433, apiLocal: 5100 },
    uat: { composeProject: 'shop-uat', volume: 'shop-uat-data' },
  }));
  return root;
}

const SHOP = { id: 555, private: true, allow_update_branch: false };
const MEMBERS = 'GET orgs/acme/actions/runner-groups/7/repositories';

test('enroll adds the repository to the group and allows Update branch, step by step', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { 'GET repos/Acme/shop': SHOP, [MEMBERS]: { repositories: [{ id: 1 }] }, 'PUT orgs/acme/actions/runner-groups/7/repositories/555': {}, 'PATCH repos/Acme/shop': {} } });
  registerRunners(stackOf(dir), { home: t.home });
  await t.run(['enroll', appRoot('Acme/shop')]);
  assert.deepEqual(writes(t.gh.calls), [
    ['api', '--method', 'PUT', 'orgs/acme/actions/runner-groups/7/repositories/555'],
    ['api', '--method', 'PATCH', 'repos/Acme/shop', '-F', 'allow_update_branch=true'],
  ]);
  const text = t.out.join('\n');
  assert.match(text, /added Acme\/shop to the runner group/);
  assert.match(text, /allowed Update branch/);
});

test('enroll says already for each step that was done and writes nothing', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { 'GET repos/acme/shop': { ...SHOP, allow_update_branch: true }, [MEMBERS]: { repositories: [{ id: 555 }] } } });
  registerRunners(stackOf(dir), { home: t.home });
  await t.run(['enroll', appRoot('acme/shop')]);
  assert.deepEqual(writes(t.gh.calls), []);
  const text = t.out.join('\n');
  assert.match(text, /already in the runner group/);
  assert.match(text, /Update branch is already allowed/);
});

test('enroll refuses a repository that is not private and writes nothing', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: { 'GET repos/acme/shop': { ...SHOP, private: false } } });
  registerRunners(stackOf(dir), { home: t.home });
  await assert.rejects(t.run(['enroll', appRoot('acme/shop')]), /not private/);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('enroll refuses when no registered stack serves the repository', async () => {
  const { dir } = makeFolder();
  const t = setup();
  registerRunners(stackOf(dir), { home: t.home });
  await assert.rejects(t.run(['enroll', appRoot('other/shop')]), /no registered runner stack serves other\/shop/);
  assert.deepEqual(t.gh.calls, []);
});

test('enroll with a repository stack matches the repository and only sets Update branch', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_TARGET: '-Repository acme/shop', RUNNERS_GROUP_ID: undefined } });
  const t = setup({ routes: { 'GET repos/acme/shop': SHOP, 'PATCH repos/acme/shop': {} } });
  registerRunners({ composeProject: 'acme-runners', configDir: dir, scope: 'repository', target: 'acme/shop' }, { home: t.home });
  await t.run(['enroll', appRoot('acme/shop')]);
  assert.deepEqual(writes(t.gh.calls), [['api', '--method', 'PATCH', 'repos/acme/shop', '-F', 'allow_update_branch=true']]);
  assert.match(t.out.join('\n'), /no runner group applies/);
});

test('enroll reports a missing app config', async () => {
  const t = setup();
  await assert.rejects(t.run(['enroll', fresh('bare')]), /claudalisk\.json is missing/);
});

const UP_ROUTES = { [GROUP_PATH]: GROUP_OK, 'GET orgs/acme/actions/runners': { runners: [] }, 'GET orgs/acme/actions/runner-groups/7/repositories': { repositories: [] } };

test('up fetches the kit, runs compose with the overlays in order, registers and prints status', async () => {
  const { dir } = makeFolder({ overlays: ['compose.slots.yaml', 'compose.a.yaml', 'notes.yaml'] });
  const t = setup({ routes: UP_ROUTES, docker: { ps: PS_ROWS } });
  await t.run(['up', '--config', dir]);
  const kit = join(dir, '.kit', COMMIT.slice(0, 12));
  assert.deepEqual(t.git.calls.map((c) => c.args), [
    ['clone', '--quiet', '--no-checkout', 'https://github.com/lucem-labs/github-runner-dind.git', kit],
    ['rev-parse', 'HEAD'],
    ['fetch', 'origin', COMMIT],
    ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--force', COMMIT],
    ['rev-parse', 'HEAD'],
    ['status', '--porcelain'],
  ]);
  assert.deepEqual(composeCalls(t.docker.calls).map((c) => c.args), [[
    'compose',
    '--file', join(kit, 'compose.yaml'),
    '--file', join(dir, 'compose.a.yaml'),
    '--file', join(dir, 'compose.slots.yaml'),
    '--env-file', join(dir, 'runners.env'),
    '--env-file', join(dir, 'runners.local.env'),
    '--profile', 'supervisor',
    'up', '--detach', '--wait', '--remove-orphans',
  ]]);
  assert.deepEqual(readRegistry({ home: t.home }).runners, [stackOf(dir)]);
  assert.match(t.out.join('\n'), /supervisor: running/);
});

test('up reuses a kit that is already at the commit', async () => {
  const { dir } = makeFolder();
  mkdirSync(join(dir, '.kit', COMMIT.slice(0, 12), '.git'), { recursive: true });
  const t = setup({ routes: UP_ROUTES, git: { existing: true } });
  await t.run(['up', '--config', dir]);
  assert.deepEqual(t.git.calls.map((c) => c.args[0]), ['rev-parse', 'rev-parse', 'status']);
});

test('up refuses a kit that is dirty or at another commit, before compose', async () => {
  for (const git of [{ dirty: true }, { wrongHead: true }]) {
    const { dir } = makeFolder();
    const t = setup({ routes: UP_ROUTES, git });
    await assert.rejects(t.run(['up', '--config', dir]), /local changes|is not at/);
    assert.deepEqual(composeCalls(t.docker.calls), []);
    assert.equal(existsSync(join(t.home, '.claudalisk', 'apps.json')), false);
  }
});

test('up refuses a folder with problems and does nothing', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_KIT_COMMIT: undefined } });
  const t = setup({ routes: UP_ROUTES });
  await assert.rejects(t.run(['up', '--config', dir]), /RUNNERS_KIT_COMMIT/);
  assert.deepEqual(t.git.calls, []);
  assert.deepEqual(t.docker.calls, []);
  assert.deepEqual(t.gh.calls, []);
});

test('up refuses a group that allows public repositories or has visibility all', async () => {
  for (const group of [{ name: 'Default', visibility: 'selected', allows_public_repositories: true }, { name: 'Default', visibility: 'all', allows_public_repositories: false }]) {
    const { dir } = makeFolder();
    const t = setup({ routes: { [GROUP_PATH]: group } });
    await assert.rejects(t.run(['up', '--config', dir]), /group --apply/);
    assert.deepEqual(t.git.calls, []);
    assert.deepEqual(composeCalls(t.docker.calls), []);
  }
});

test('up in repository mode refuses a public repository', async () => {
  const { dir } = makeFolder({ values: { RUNNERS_TARGET: '-Repository acme/shop', RUNNERS_GROUP_ID: undefined } });
  const t = setup({ routes: { 'GET repos/acme/shop': { private: false } } });
  await assert.rejects(t.run(['up', '--config', dir]), /is public/);
  assert.deepEqual(composeCalls(t.docker.calls), []);
  assert.deepEqual(t.git.calls, []);
});

test('up never makes a write call to GitHub', async () => {
  const { dir } = makeFolder();
  const t = setup({ routes: UP_ROUTES });
  await t.run(['up', '--config', dir]);
  assert.deepEqual(writes(t.gh.calls), []);
});

test('logs tails the supervisor container without following', async () => {
  const { dir } = makeFolder();
  const t = setup();
  registerRunners(stackOf(dir), { home: t.home });
  await t.run(['logs']);
  assert.deepEqual(t.docker.calls[0].args, ['logs', '--tail', '100', 'acme-runners-supervisor-1']);
  assert.deepEqual(t.out, ['supervisor log line']);
});

test('there is no down command, and unknown input prints the usage', async () => {
  const t = setup();
  for (const argv of [[], ['down'], ['app'], ['status', '--bogus'], ['adopt']]) await assert.rejects(t.run(argv), /usage|unknown argument/);
  assert.deepEqual(t.docker.calls, []);
});
