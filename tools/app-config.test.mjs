import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME } from '../templates/app/scripts/verify.mjs';
import { SCHEMA, readAppConfig, validateAppConfig } from './app-config.mjs';

const SCHEMA_URL = 'https://raw.githubusercontent.com/lucem-labs/claudalisk/main/tools/app-config.schema.json';

const minimal = () => ({
  name: 'shop',
  hostPrefix: 'shop',
  repo: 'acme/shop',
  databases: [{ role: 'app', envVar: 'DB' }],
  ports: { devDb: 5433, apiLocal: 5100 },
  uat: { composeProject: 'shop-uat', volume: 'shop-uat-data' },
});

const full = () => ({
  $schema: SCHEMA_URL,
  ...minimal(),
  databases: [{ role: 'app', envVar: 'DB' }, { role: 'identity', envVar: 'ID_DB' }],
  uat: { composeProject: 'shop-uat', volume: 'shop-uat-data', protectedVolumes: ['shop-uat-files'] },
  backup: { keep: 5 },
  askCommands: ['docker compose down'],
  ownerOnlyCommands: ['restore'],
  runnerLabel: 'ci',
  review: { uatData: ['db/**'], security: ['auth/**'] },
});

function appWith(text) {
  const root = mkdtempSync(join(tmpdir(), 'app-config-'));
  mkdirSync(join(root, '.claude'));
  writeFileSync(join(root, '.claude', 'claudalisk.json'), text);
  return root;
}

test('a full config is valid', () => {
  assert.deepEqual(validateAppConfig(full()), []);
});

test('a minimal config is valid', () => {
  assert.deepEqual(validateAppConfig(minimal()), []);
});

for (const key of ['name', 'hostPrefix', 'repo', 'databases', 'ports', 'uat']) {
  test(`${key} is required`, () => {
    const config = minimal();
    delete config[key];
    assert.deepEqual(validateAppConfig(config), [`$.${key}: is required`]);
  });
}

test('nested required fields are reported with their path', () => {
  const config = minimal();
  config.uat = {};
  config.ports = { devDb: 5433 };
  config.databases = [{ role: 'app' }];
  assert.deepEqual(validateAppConfig(config).sort(), [
    '$.databases[0].envVar: is required',
    '$.ports.apiLocal: is required',
    '$.uat.composeProject: is required',
    '$.uat.volume: is required',
  ]);
});

test('an unknown top-level key is a problem', () => {
  assert.deepEqual(validateAppConfig({ ...minimal(), askComands: [] }), ['$.askComands: is not a known key']);
});

test('an unknown nested key is a problem', () => {
  const config = minimal();
  config.uat.volumes = [];
  config.review = { uatDat: [] };
  assert.deepEqual(validateAppConfig(config).sort(), ['$.review.uatDat: is not a known key', '$.uat.volumes: is not a known key']);
});

test('a key named after an inherited property is still unknown', () => {
  for (const key of ['constructor', 'toString', 'hasOwnProperty']) {
    const problems = validateAppConfig(JSON.parse(JSON.stringify({ ...minimal(), [key]: 1 })));
    assert.ok(problems.some((p) => p.includes(key) && p.includes('not a known key')), key);
  }
});

test('uat names that Docker cannot use are problems', () => {
  const uat = (overrides) => validateAppConfig({ ...minimal(), uat: { composeProject: 'p', volume: 'v', ...overrides } });
  assert.deepEqual(uat({}), []);
  assert.notDeepEqual(uat({ composeProject: '' }), []);
  assert.notDeepEqual(uat({ volume: '' }), []);
  assert.notDeepEqual(uat({ protectedVolumes: ['bad name'] }), []);
});

test('verify.mjs checks a name with the same pattern as the schema', () => {
  assert.equal(APP_NAME.source, SCHEMA.properties.name.pattern);
});

test('e2e ports are not part of the config', () => {
  const config = minimal();
  config.ports.e2eApi = 5200;
  assert.deepEqual(validateAppConfig(config), ['$.ports.e2eApi: is not a known key']);
});

test('a bad name is a problem', () => {
  assert.equal(validateAppConfig({ ...minimal(), name: '../evil' }).length, 1);
  assert.equal(validateAppConfig({ ...minimal(), name: 'Shop' }).length, 1);
  assert.equal(validateAppConfig({ ...minimal(), hostPrefix: '-x' }).length, 1);
});

test('a bad repo is a problem', () => {
  assert.equal(validateAppConfig({ ...minimal(), repo: 'shop' }).length, 1);
});

test('ports out of range or not integers are problems', () => {
  const low = minimal();
  low.ports.devDb = 80;
  const high = minimal();
  high.ports.apiLocal = 70000;
  const text = minimal();
  text.ports.devDb = '5433';
  assert.match(validateAppConfig(low)[0], /^\$\.ports\.devDb: 80 is below 1024/);
  assert.match(validateAppConfig(high)[0], /^\$\.ports\.apiLocal: 70000 is above 65535/);
  assert.match(validateAppConfig(text)[0], /^\$\.ports\.devDb: must be integer/);
});

test('databases needs an item, and backup.keep at least 1', () => {
  assert.deepEqual(validateAppConfig({ ...minimal(), databases: [] }), ['$.databases: needs at least 1 item(s)']);
  assert.match(validateAppConfig({ ...minimal(), backup: { keep: 0 } })[0], /^\$\.backup\.keep/);
});

test('wrong types are problems', () => {
  assert.match(validateAppConfig({ ...minimal(), askCommands: 'x' })[0], /^\$\.askCommands: must be array/);
  assert.match(validateAppConfig({ ...minimal(), askCommands: [1] })[0], /^\$\.askCommands\[0\]: must be string/);
  assert.match(validateAppConfig([])[0], /^\$: must be object/);
});

test('the template example validates', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'app', '.claude', 'claudalisk.json');
  const example = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(example.name, 'example-app');
  assert.equal(example.$schema, SCHEMA_URL);
  assert.deepEqual(validateAppConfig(example), []);
});

test('readAppConfig returns null when the file is absent', () => {
  assert.equal(readAppConfig(mkdtempSync(join(tmpdir(), 'app-config-'))), null);
});

test('readAppConfig returns a valid config', () => {
  assert.deepEqual(readAppConfig(appWith(JSON.stringify(full()))), full());
});

test('readAppConfig strips a BOM', () => {
  assert.deepEqual(readAppConfig(appWith(`\uFEFF${JSON.stringify(minimal())}`)), minimal());
});

test('readAppConfig names the file when the JSON is broken', () => {
  const root = appWith('{ nope');
  assert.throws(() => readAppConfig(root), (e) => e.message.includes(join(root, '.claude', 'claudalisk.json')) && /not valid JSON/.test(e.message));
});

test('readAppConfig lists every problem', () => {
  const root = appWith(JSON.stringify({ ...minimal(), name: '../evil', extra: 1 }));
  assert.throws(() => readAppConfig(root), (e) => e.message.includes('$.name') && e.message.includes('$.extra') && e.message.includes('claudalisk.json'));
});
