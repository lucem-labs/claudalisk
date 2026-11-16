import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWatcher, descendants, insideAny, isBuildProcess, listProcesses, parsePosixList, parseWindowsList, selectLeftovers, subtree, sweep } from './processes.mjs'

const row = (pid, ppid, name, extra = {}) => ({ pid, ppid, name, commandLine: name, startedAt: `t${pid}`, ...extra })

test('build processes are recognised by name with or without .exe, in any case', () => {
  for (const name of ['dotnet', 'dotnet.exe', 'DOTNET.EXE', 'MSBuild.exe', 'VBCSCompiler', 'vbcscompiler.exe', '/usr/share/dotnet/dotnet']) assert.equal(isBuildProcess(name), true, name)
  for (const name of ['node', 'dotnet-watch', 'claude', 'dotnetx.exe']) assert.equal(isBuildProcess(name), false, name)
})

test('ps output is parsed into rows with the start time', () => {
  const text = [
    '    1     0 Mon Nov 16 10:00:00 2026 /sbin/init splash',
    '  200   100 Tue Nov  3 09:01:02 2026 /usr/share/dotnet/dotnet /sdk/MSBuild.dll /nodemode:1',
    'garbage',
  ].join('\n')

  assert.deepEqual(parsePosixList(text), [
    { pid: 1, ppid: 0, name: 'init', commandLine: '/sbin/init splash', startedAt: 'Mon Nov 16 10:00:00 2026' },
    { pid: 200, ppid: 100, name: 'dotnet', commandLine: '/usr/share/dotnet/dotnet /sdk/MSBuild.dll /nodemode:1', startedAt: 'Tue Nov 3 09:01:02 2026' },
  ])
})

test('powershell output is parsed whether it holds one process or many', () => {
  const one = '{"pid":4,"ppid":0,"name":"dotnet.exe","commandLine":null,"startedAt":"2026-11-16T10:00:00.0000000Z"}'

  assert.deepEqual(parseWindowsList(one), [{ pid: 4, ppid: 0, name: 'dotnet.exe', commandLine: '', startedAt: '2026-11-16T10:00:00.0000000Z' }])
  assert.equal(parseWindowsList(`[${one},${one}]`).length, 2)
  assert.deepEqual(parseWindowsList('  '), [])
})

test('listing uses powershell on Windows and ps elsewhere, and reads cwd on Linux only', () => {
  const calls = []
  const run = (command) => {
    calls.push(command)
    return command === 'ps' ? '  7  1 Mon Nov 16 10:00:00 2026 dotnet build\n' : '[]'
  }
  const readlink = (path) => `${path}-target`

  assert.deepEqual(listProcesses({ platform: 'win32', run }), [])
  assert.equal(listProcesses({ platform: 'darwin', run, readlink })[0].cwd, undefined)
  assert.equal(listProcesses({ platform: 'linux', run, readlink })[0].cwd, '/proc/7/cwd-target')
  assert.deepEqual(calls, ['powershell', 'ps', 'ps'])
})

test('descendants of a tracked root are remembered, including grandchildren', () => {
  const snapshot = [row(1, 0, 'init'), row(10, 1, 'claude'), row(11, 10, 'bash'), row(12, 11, 'dotnet'), row(20, 1, 'dotnet')]

  const found = descendants(snapshot, new Map(), [10])

  assert.deepEqual([...found.keys()].sort((a, b) => a - b), [10, 11, 12])
})

test('a remembered descendant stays remembered after its parent exits', () => {
  const first = descendants([row(10, 1, 'claude'), row(12, 10, 'dotnet')], new Map(), [10])
  const second = descendants([row(12, 1, 'dotnet')], first, [10])

  assert.equal(second.get(12), 't12')
})

test('a child of a reused parent pid is not adopted', () => {
  const remembered = new Map([[10, 'old']])
  const snapshot = [{ ...row(10, 1, 'other'), startedAt: 'new' }, row(30, 10, 'dotnet')]

  assert.equal(descendants(snapshot, remembered).has(30), false)
})

test('the descendant dotnet is selected and the owner unrelated dotnet is left alone', () => {
  const snapshot = [row(12, 1, 'dotnet'), row(20, 1, 'dotnet'), row(21, 1, 'node')]
  const remembered = new Map([[12, 't12'], [21, 't21']])

  const picked = selectLeftovers({ snapshot, remembered, folders: ['/tmp/run/app'], platform: 'linux', self: 999 })

  assert.deepEqual(picked.map((item) => item.pid), [12])
})

test('a reused pid with another start time is left alone', () => {
  const snapshot = [{ ...row(12, 1, 'dotnet'), startedAt: 'later' }]

  const picked = selectLeftovers({ snapshot, remembered: new Map([[12, 't12']]), folders: ['/tmp/run/app'], platform: 'linux', self: 999 })

  assert.deepEqual(picked, [])
})

test('a process whose command line or cwd is inside the copy is selected on POSIX', () => {
  const snapshot = [
    row(1, 1, 'dotnet', { commandLine: 'dotnet build /tmp/run/app/backend/App.sln' }),
    row(2, 1, 'dotnet', { cwd: '/tmp/run/app/backend' }),
    row(3, 1, 'dotnet', { commandLine: 'dotnet build /tmp/other/app', cwd: '/tmp/other' }),
    row(4, 1, 'dotnet', { commandLine: 'dotnet build /TMP/RUN/APP' }),
  ]

  const picked = selectLeftovers({ snapshot, remembered: new Map(), folders: ['/tmp/run/app'], platform: 'linux', self: 999 })

  assert.deepEqual(picked.map((item) => item.pid), [1, 2])
})

test('Windows paths match with either slash and without regard to case', () => {
  const folder = 'C:\\Users\\Me\\AppData\\Local\\Temp\\claudalisk-bench-run-x\\app'

  assert.equal(insideAny('dotnet.exe build c:/users/me/appdata/local/temp/CLAUDALISK-BENCH-RUN-X/app/backend', [folder], 'win32'), true)
  assert.equal(insideAny('"C:\\USERS\\ME\\APPDATA\\LOCAL\\TEMP\\claudalisk-bench-run-x\\app\\a.sln"', [folder], 'win32'), true)
  assert.equal(insideAny('C:\\Users\\Me\\Other', [folder], 'win32'), false)
  assert.equal(insideAny('/tmp/RUN/app', ['/tmp/run/app'], 'linux'), false)
})

test('the sweeper process is never selected', () => {
  const snapshot = [row(5, 1, 'dotnet', { commandLine: 'dotnet /tmp/run/app' })]

  assert.deepEqual(selectLeftovers({ snapshot, remembered: new Map(), folders: ['/tmp/run/app'], platform: 'linux', self: 5 }), [])
})

test('a subtree is listed children first', () => {
  const snapshot = [row(1, 0, 'a'), row(2, 1, 'b'), row(3, 2, 'c'), row(4, 1, 'd')]

  assert.deepEqual(subtree(snapshot, 1), [3, 2, 4, 1])
})

test('the sweep kills what the watcher remembered and reports the names', () => {
  const live = [row(10, 1, 'claude'), row(12, 10, 'MSBuild.exe'), row(13, 10, 'VBCSCompiler.exe'), row(20, 1, 'dotnet.exe')]
  const watcher = createWatcher({ list: () => live })
  watcher.track(10)
  watcher.sample()
  const killed = []

  const result = sweep({ watcher, folders: ['/tmp/run/app'], platform: 'win32', kill: (pid) => killed.push(pid), self: 999 })

  assert.deepEqual(killed, [12, 13])
  assert.deepEqual(result, { killed: 2, names: ['msbuild', 'vbcscompiler'] })
})

test('the sweep reports nothing killed when the listing fails', () => {
  const watcher = createWatcher({
    list: () => {
      throw new Error('no ps')
    },
  })

  assert.deepEqual(sweep({ watcher, folders: ['/x'], kill: () => assert.fail('nothing to kill') }), { killed: 0, names: [] })
})

test('a folder matches only at a path boundary, not as the prefix of a longer name', () => {
  assert.equal(insideAny('dotnet build /tmp/run-ab/app', ['/tmp/run-ab'], 'linux'), true)
  assert.equal(insideAny('dotnet build "/tmp/run-ab"', ['/tmp/run-ab'], 'linux'), true)
  assert.equal(insideAny('/tmp/run-ab', ['/tmp/run-ab'], 'linux'), true)
  assert.equal(insideAny('dotnet build /tmp/run-abc/app', ['/tmp/run-ab'], 'linux'), false)
  assert.equal(insideAny('dotnet build /tmp/run-abc/app /tmp/run-ab/x', ['/tmp/run-ab'], 'linux'), true)
})
