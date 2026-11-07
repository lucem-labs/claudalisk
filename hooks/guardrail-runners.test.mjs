import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, protectedNames } from './guardrail.mjs';
import { readRegistry } from '../tools/app-registry.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'guardrail-runners-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const STACK = join(scratch, 'stack');
mkdirSync(STACK);
const S = STACK.split(String.fromCharCode(92)).join('/');
const home = join(scratch, 'home');
mkdirSync(home);

const FIXTURE = { names: ['acme-runners'], config: null, configDirs: [STACK] };

function call(command, { tool = 'Bash', cwd = scratch, deps = {} } = {}) {
  return decide({ tool_name: tool, tool_input: { command }, cwd }, { env: {}, home, protect: () => FIXTURE, git: () => { throw new Error('git'); }, gh: () => { throw new Error('gh'); }, ...deps });
}

const verdict = (r) => r?.hookSpecificOutput?.permissionDecision ?? 'allow';
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

test('normalised absolute forms into a config folder are denied for container tools', () => {
  const forms = [
    `${S}/../stack/compose.yaml`,
    `${S}/./compose.yaml`,
    `${S}//compose.yaml`,
    `${S}/sub/../compose.yaml`,
    `-v${S}:/x`,
    `source=${S}/./.kit,target=/k`,
  ];
  for (const form of forms) for (const tool of ['Bash', 'PowerShell']) assert.equal(verdict(call(`docker compose -f ${form} ps`, { tool })), 'deny', form);
  assert.equal(verdict(call(`docker run -v ${S}/../stack:/x alpine ls`)), 'deny');
  assert.equal(verdict(call(`docker compose -f ${S}/../other/compose.yaml ps`)), 'allow');
});

test('the extended-length and device prefixes do not hide a config folder', () => {
  assert.equal(verdict(call(`docker compose -f //?/${S}/compose.yaml ps`)), 'deny');
  assert.equal(verdict(call(`docker compose -f //./${S}/compose.yaml ps`)), 'deny');
});

test('shell writes into a config folder ask, and reads stay allowed', () => {
  const writes = [
    `echo x > ${S}/runners.env`,
    `echo x >> ${S}/runners.env`,
    `echo x | tee ${S}/runners.env`,
    `echo x | tee -a ${S}/runners.local.env`,
    `cp /tmp/a ${S}/runners.env`,
    `mv /tmp/a ${S}/compose.a.yaml`,
    `install /tmp/a ${S}/runners.env`,
    `sed -i s/a/b/ ${S}/runners.env`,
    `sed -i.bak s/a/b/ ${S}/runners.env`,
    `perl -pi -e s/a/b/ ${S}/runners.env`,
    `echo x > ${S}/../stack/runners.env`,
  ];
  for (const command of writes) {
    const r = call(command);
    assert.equal(verdict(r), 'ask', command);
    assert.match(reason(r), /Rule 16/);
  }
  const ps = [
    `Set-Content ${S}/runners.env x`,
    `Add-Content ${S}/runners.env x`,
    `Copy-Item a.txt -Destination ${S}/runners.env`,
    `Move-Item a.txt ${S}/runners.env`,
    `'x' | Out-File ${S}/runners.env`,
    `echo x > ${S}/runners.env`,
  ];
  for (const command of ps) assert.equal(verdict(call(command, { tool: 'PowerShell' })), 'ask', command);
  for (const command of [`cat ${S}/runners.env`, `ls ${S}`, `sed s/a/b/ ${S}/runners.env`, `grep KIT ${S}/runners.env`, `cp ${S}/runners.env /tmp/copy`, `echo x > ${scratch.split(String.fromCharCode(92)).join('/')}/other.txt`]) {
    assert.equal(verdict(call(command)), 'allow', command);
  }
});

test('a relative write from inside the config folder asks', () => {
  assert.equal(verdict(call('echo x > runners.env', { cwd: STACK })), 'ask');
  assert.equal(verdict(call('echo x > runners.env', { cwd: scratch })), 'allow');
});

test('a write is not checked when there are no config folders', () => {
  assert.equal(verdict(call(`echo x > ${S}/runners.env`, { deps: { protect: () => ({ names: [], config: null }) } })), 'allow');
});

test('rule 11 sees runner registration on org and repo paths, with a host or a leading slash', () => {
  const asks = [
    'gh api -X POST orgs/o/actions/runners/registration-token',
    'gh api --method POST /orgs/o/actions/runners/generate-jitconfig',
    'gh api -X DELETE https://api.github.com/orgs/o/actions/runners/5',
    'gh api -X POST https://api.github.com/repos/o/r/actions/runners/registration-token',
    'gh api --method POST /repos/o/r/actions/runners/registration-token',
    'gh api -X PATCH https://api.github.com/orgs/o/actions/runner-groups/2',
    'gh api -X PUT /orgs/o/actions/runner-groups/2/repositories/5',
  ];
  for (const command of asks) assert.equal(verdict(call(command)), 'ask', command);
  for (const command of ['gh api orgs/o/actions/runners', 'gh api https://api.github.com/orgs/o/actions/runners', 'gh api /repos/o/r/actions/runners', 'gh api -X GET /orgs/o/actions/runner-groups/2']) {
    assert.equal(verdict(call(command)), 'allow', command);
  }
});

test('a legacy registry with runners as an object keeps the project protected', () => {
  const place = join(scratch, 'legacy-home');
  mkdirSync(join(place, '.claudalisk'), { recursive: true });
  writeFileSync(join(place, '.claudalisk', 'apps.json'), JSON.stringify({ apps: [], runners: { composeProject: 'old-runners' } }));
  const registry = readRegistry({ home: place });
  assert.deepEqual(registry.runners, [{ composeProject: 'old-runners' }]);
  assert.ok(protectedNames(registry, null).includes('old-runners'));
});
