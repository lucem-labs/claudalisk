import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command, normalize, segments, substitutions } from './shell.mjs';

const words = (text, shell) => segments(text, { shell }).map((s) => s.words);

test('segments split on ; && || | newlines and a lone &', () => {
  assert.deepEqual(words('a b; c && d || e | f\ng'), [['a', 'b'], ['c'], ['d'], ['e'], ['f'], ['g']]);
  assert.deepEqual(words('sleep 1 & docker volume rm x'), [['sleep', '1'], ['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('a "b;c" \'d|e\' f'), [['a', 'b;c', 'd|e', 'f']]);
});

test('a redirect keeps its ampersand', () => {
  assert.deepEqual(words('make 2>&1 | tee out'), [['make', '2>&1'], ['tee', 'out']]);
  assert.deepEqual(words('make >&2'), [['make', '>&2']]);
  assert.deepEqual(words('make &> out.txt'), [['make', '&>', 'out.txt']]);
  assert.deepEqual(words('make 2>&1 && ls'), [['make', '2>&1'], ['ls']]);
});

test('the PowerShell call operator disappears', () => {
  assert.deepEqual(words("& 'C:\\Program Files\\Docker\\docker.exe' ps", 'powershell'), [['C:\\Program Files\\Docker\\docker.exe', 'ps']]);
  assert.deepEqual(words('& docker ps', 'powershell'), [['docker', 'ps']]);
});

test('segments know which one follows a pipe', () => {
  assert.deepEqual(segments('a | b && c').map((s) => s.piped), [false, true, false]);
  assert.deepEqual(segments('a || b').map((s) => s.piped), [false, false]);
});

test('CRLF is normalised', () => {
  assert.deepEqual(words('echo ok\r\ndocker volume rm x\r\n'), [['echo', 'ok'], ['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('a\r\nb', 'powershell'), [['a'], ['b']]);
});

test('line continuations join', () => {
  assert.deepEqual(words('docker volume \\\n  rm x', 'bash'), [['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('docker volume `\n  rm x', 'powershell'), [['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('docker volume \\\r\n  rm x', 'bash'), [['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('docker volume `\r\n  rm x', 'powershell'), [['docker', 'volume', 'rm', 'x']]);
});

test('a PowerShell backtick escapes the next character, quoted or not', () => {
  assert.deepEqual(words('d`o`cker volume rm x', 'powershell'), [['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('"d`ocker" ps', 'powershell'), [['docker', 'ps']]);
  assert.deepEqual(words("'d`ocker' ps", 'powershell'), [['d`ocker', 'ps']]);
});

test('a bash backslash escapes the next character', () => {
  assert.deepEqual(words('do\\cker volume rm x', 'bash'), [['docker', 'volume', 'rm', 'x']]);
  assert.deepEqual(words('echo a\\;b', 'bash'), [['echo', 'a;b']]);
  assert.deepEqual(words('echo "a\\"b"', 'bash'), [['echo', 'a"b']]);
});

test('without a shell a backslash is literal', () => {
  assert.deepEqual(words('node C:\\a\\b.mjs'), [['node', 'C:\\a\\b.mjs']]);
});

test('segments say which words were quoted', () => {
  const [segment] = segments('git commit -m ">> .env"');
  assert.deepEqual(segment.quoted, [false, false, false, true]);
});

test('heredoc bodies attach to their segment and are not tokenized', () => {
  const found = segments("cat <<'EOF' | grep x\ndocker volume rm y\nEOF\nls");
  assert.deepEqual(found.map((s) => s.words), [['cat', '<<EOF'], ['grep', 'x'], ['ls']]);
  assert.deepEqual(found[0].heredocs, ['docker volume rm y']);
  assert.deepEqual(found[1].heredocs, []);
  assert.deepEqual(found[2].heredocs, []);
});

test('two heredocs on one line and an indented terminator', () => {
  const found = segments('cat <<A <<-B\none\nA\ntwo\n\tB\nls', { shell: 'bash' });
  assert.deepEqual(found[0].heredocs, ['one', 'two']);
  assert.deepEqual(found.at(-1).words, ['ls']);
});

test('a heredoc marker inside quotes or a here-string starts no heredoc', () => {
  assert.deepEqual(words("echo '<<EOF'\nls\nEOF"), [['echo', '<<EOF'], ['ls'], ['EOF']]);
  assert.deepEqual(words('cat <<< hi\nls'), [['cat', '<<<', 'hi'], ['ls']]);
});

test('an unterminated heredoc swallows the rest as data', () => {
  const found = segments("cat <<'EOF'\ndocker volume rm y");
  assert.deepEqual(found.map((s) => s.words), [['cat', '<<EOF']]);
  assert.deepEqual(found[0].heredocs, ['docker volume rm y']);
});

test('PowerShell here-strings are one word', () => {
  assert.deepEqual(words("Set-Content x @'\nit's; a | b\n'@\nls", 'powershell'), [['Set-Content', 'x', "it's; a | b"], ['ls']]);
});

test('command returns the name, args and leading assignments', () => {
  assert.deepEqual(command(['A=1', 'B=two', 'docker', 'ps']), {
    name: 'docker',
    args: ['ps'],
    redirected: false,
    assignments: [{ name: 'A', value: '1' }, { name: 'B', value: 'two' }],
    redirects: [],
  });
});

test('command normalises the name and keeps the old wrapper skip', () => {
  assert.equal(command(['C:\\x\\Docker.EXE', 'ps']).name, 'docker');
  assert.equal(command(['/usr/bin/git', 'status']).name, 'git');
  assert.equal(command(['sudo', 'git', 'status']).name, 'git');
  assert.equal(command(['xargs', 'rm']).name, 'rm');
  assert.equal(command(['A=1']).name, '');
  assert.equal(normalize('./Scripts/Node.exe'), 'node');
});

test('command can be told to skip nothing', () => {
  assert.equal(command(['sudo', 'git'], undefined, { skip: [] }).name, 'sudo');
});

test('command separates redirects from args', () => {
  const found = command(['echo', 'x', '>', '.env', '2>&1', '>>log']);
  assert.deepEqual(found.args, ['x']);
  assert.equal(found.redirected, true);
  assert.deepEqual(found.redirects.map((r) => [r.op, r.target]), [['>', '.env'], ['>', '&1'], ['>>', 'log']]);
});

test('a quoted word is never a redirect', () => {
  const found = command(['git', 'commit', '-m', '>> .env'], [false, false, false, true]);
  assert.deepEqual(found.args, ['commit', '-m', '>> .env']);
  assert.deepEqual(found.redirects, []);
});

test('substitutions find $(), <() and backticks outside single quotes', () => {
  assert.deepEqual(substitutions('echo $(a b) x', 'bash'), ['a b']);
  assert.deepEqual(substitutions('diff <(a) <(b)', 'bash'), ['a', 'b']);
  assert.deepEqual(substitutions('echo `a b`', 'bash'), ['a b']);
  assert.deepEqual(substitutions("echo '$(a)' '`b`'", 'bash'), []);
  assert.deepEqual(substitutions('echo "x $(a) y `b`"', 'bash'), ['a', 'b']);
});

test('substitutions balance parentheses and quotes', () => {
  assert.deepEqual(substitutions('echo $(a (b) ")" c) d', 'bash'), ['a (b) ")" c']);
  assert.deepEqual(substitutions('echo $(echo $(a))', 'bash'), ['echo $(a)']);
});

test('a quoted heredoc body is data, an unquoted one expands', () => {
  const quoted = 'git commit -m "$(cat <<\'EOF\'\ngh pr merge; $(docker volume rm x)\nEOF\n)"';
  assert.deepEqual(substitutions(quoted, 'bash').map((s) => s.split('\n')[0]), ['cat <<\'EOF\'']);
  const unquoted = 'cat <<EOF\n$(docker volume rm x)\nEOF';
  assert.deepEqual(substitutions(unquoted, 'bash'), ['docker volume rm x']);
});

test('in PowerShell groups and script blocks are split out', () => {
  assert.deepEqual(substitutions('(docker volume rm x)', 'powershell'), ['docker volume rm x']);
  assert.deepEqual(substitutions('Get-Date; { docker volume rm x }', 'powershell'), [' docker volume rm x ']);
  assert.deepEqual(substitutions('echo "$(a)"', 'powershell'), ['a']);
  assert.deepEqual(substitutions("echo '(a)'", 'powershell'), []);
  assert.deepEqual(substitutions('echo `(a`)', 'powershell'), []);
});

test('substitutions with no shell behave as bash', () => {
  assert.deepEqual(substitutions('echo $(a)'), ['a']);
});

test('with a shell, a comment runs to the end of the line', () => {
  for (const shell of ['bash', 'powershell']) {
    assert.deepEqual(words("# don't touch uat\ngh pr merge 5", shell), [['gh', 'pr', 'merge', '5']], shell);
    assert.deepEqual(words('ls # note; gh pr merge 5\ngit status', shell), [['ls'], ['git', 'status']], shell);
    assert.deepEqual(words('echo a#b', shell), [['echo', 'a#b']], shell);
    assert.deepEqual(substitutions("# don't $(a)\necho $(b)", shell), ['b'], shell);
  }
  assert.deepEqual(words('echo # x'), [['echo', '#', 'x']]);
});

test('a redirect keeps its target when the target is quoted', () => {
  for (const text of ['echo x >".env"', "echo x >'.env'"]) {
    const [segment] = segments(text, { shell: 'bash' });
    const found = command(segment.words, segment.quoted);
    assert.deepEqual(found.redirects.map((r) => r.target), ['.env'], text);
    assert.deepEqual(found.args, ['x'], text);
  }
  const [data] = segments('git commit -m ">> .env"', { shell: 'bash' });
  assert.deepEqual(command(data.words, data.quoted).redirects, []);
});

test('<< inside arithmetic is not a heredoc', () => {
  for (const shell of ['bash', 'powershell', undefined]) {
    assert.deepEqual(words('echo $((1<<2))\ngh pr merge 5', shell), [['echo', '$((1<<2))'], ['gh', 'pr', 'merge', '5']], String(shell));
  }
  assert.deepEqual(substitutions('echo $((1<<2))\necho $(gh pr merge 5)', 'bash'), ['gh pr merge 5']);
});
