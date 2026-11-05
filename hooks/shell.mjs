const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const REDIRECT = /^(\d|&)?(>>?|<)$/;
const HEREDOC = /<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s'"|;&<>()]+))/y;
const DEFAULT_SKIP = ['sudo', 'command', 'xargs', '&'];

export function normalize(name) {
  return String(name ?? '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
}

function prepare(text, shell) {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

function heredocAt(source, i, shell) {
  if (source[i] !== '<' || source[i + 1] !== '<' || source[i + 2] === '<' || source[i - 1] === '<') return null;
  HEREDOC.lastIndex = i;
  const m = HEREDOC.exec(source);
  if (!m) return null;
  const quoted = m[2] !== undefined || m[3] !== undefined;
  if (shell === 'powershell' && !quoted) return null;
  return { delim: m[2] ?? m[3] ?? m[4], dash: m[1] === '-', expand: !quoted };
}

function arithmeticEnd(s, i, shell) {
  if (shell === 'powershell' || s[i] !== '$' || s[i + 1] !== '(' || s[i + 2] !== '(') return -1;
  let depth = 0;
  let inner = -1;
  for (let k = i + 1; k < s.length; k++) {
    if (s[k] === '(') depth++;
    else if (s[k] === ')') {
      depth--;
      if (depth === 1 && inner < 0) inner = k;
      if (depth === 0) return inner === k - 1 ? k + 1 : -1;
    }
  }
  return -1;
}

function takeBody(source, from, delim) {
  const lines = [];
  let pos = from;
  while (pos < source.length) {
    let eol = source.indexOf('\n', pos);
    if (eol < 0) eol = source.length;
    const line = source.slice(pos, eol);
    pos = Math.min(eol + 1, source.length);
    if (line.trim() === delim) return { body: lines.join('\n'), next: pos };
    lines.push(line);
  }
  return { body: lines.join('\n'), next: source.length };
}

export function segments(text, { shell } = {}) {
  const source = prepare(text, shell);
  const result = [];
  const pending = [];
  let words = [];
  let quoted = [];
  let heredocs = [];
  let word = null;
  let wasQuoted = false;
  let quote = null;
  let piped = false;
  const endWord = () => {
    if (word !== null) { words.push(word); quoted.push(wasQuoted); }
    word = null;
    wasQuoted = false;
  };
  const endSegment = (pipe, after) => {
    endWord();
    if (words.length) result.push({ words, quoted, piped, heredocs, after });
    words = [];
    quoted = [];
    heredocs = [];
    piped = pipe;
  };
  const add = (chars) => { word = (word ?? '') + chars; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === '$' && source[i + 1] === '(') {
        const end = scan(source, i + 2, shell, ')', [], false).end;
        add(source.slice(i, end + 1));
        i = end;
      }
      else if (quote === '"' && shell === 'bash' && c === '\\' && source[i + 1] === '\n') i++;
      else if (quote === '"' && shell === 'bash' && c === '\\' && '"\\$`'.includes(source[i + 1] ?? '')) add(source[++i]);
      else if (quote === '"' && shell === 'powershell' && c === '`' && source[i + 1] === '\n') i++;
      else if (quote === '"' && shell === 'powershell' && c === '`' && i + 1 < source.length) add(source[++i]);
      else add(c);
      continue;
    }
    if (shell === 'powershell' && c === '@' && (source[i + 1] === "'" || source[i + 1] === '"') && source[i + 2] === '\n') {
      const end = source.indexOf(`\n${source[i + 1]}@`, i + 3);
      add(end < 0 ? source.slice(i + 3) : source.slice(i + 3, end));
      wasQuoted = true;
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === '#' && shell && word === null) {
      while (i + 1 < source.length && source[i + 1] !== '\n') i++;
      continue;
    }
    if (c === '<' && source[i + 1] === '#' && shell === 'powershell' && word === null) {
      const end = source.indexOf('#>', i + 2);
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    const arithmetic = c === '$' ? arithmeticEnd(source, i, shell) : -1;
    if (arithmetic > 0) {
      add(source.slice(i, arithmetic));
      i = arithmetic - 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      if (word === null || !/^\d*[<>&]+$/.test(word)) wasQuoted = true;
      word = word ?? '';
      continue;
    }
    if ((c === '\\' && shell === 'bash') || (c === '`' && shell === 'powershell')) {
      if (source[i + 1] === '\n') i++;
      else if (i + 1 < source.length) { add(source[++i]); wasQuoted = true; }
      continue;
    }
    if (c === '<' || c === '>') {
      const heredoc = c === '<' ? heredocAt(source, i, shell) : null;
      if (heredoc) pending.push({ ...heredoc, into: heredocs });
      if (word !== null && !/^\d*[<>&]*$/.test(word)) endWord();
      add(c);
      continue;
    }
    if (c === '|' || c === ';' || c === '\n' || c === '&') {
      const next = source[i + 1];
      if (c === '&' && next !== '&' && (source[i - 1] === '>' || source[i - 1] === '<' || next === '>')) { add(c); continue; }
      const double = (c === '&' && next === '&') || (c === '|' && next === '|');
      const pipe = c === '|' && !double;
      if (double) i++;
      if (c === '\n' && pending.length) {
        let pos = i + 1;
        for (const p of pending.splice(0)) {
          const taken = takeBody(source, pos, p.delim);
          p.into.push(taken.body);
          pos = taken.next;
        }
        i = pos - 1;
      }
      endSegment(pipe, double ? c + c : c);
      continue;
    }
    if (/\s/.test(c)) endWord();
    else add(c);
  }
  endSegment(false, null);
  return result;
}

export function command(tokens, quoted, { skip = DEFAULT_SKIP } = {}) {
  let i = 0;
  const assignments = [];
  while (i < tokens.length && ASSIGNMENT.test(tokens[i])) {
    const eq = tokens[i].indexOf('=');
    assignments.push({ name: tokens[i].slice(0, eq), value: tokens[i].slice(eq + 1) });
    i++;
  }
  if (skip.includes(tokens[i])) i++;
  const name = normalize(tokens[i]);
  const args = [];
  const redirects = [];
  let redirected = false;
  for (let j = i + 1; j < tokens.length; j++) {
    const m = quoted?.[j] ? null : tokens[j].match(/^(\d|&)?(>>?|<<?)(.*)$/);
    if (!m) { args.push(tokens[j]); continue; }
    if (m[2].startsWith('>') && m[1] !== '2') redirected = true;
    let target = m[3];
    if (m[3] === '' && REDIRECT.test(tokens[j])) { j++; target = tokens[j] ?? ''; }
    redirects.push({ op: m[2], fd: m[1] ?? null, target });
  }
  return { name, args, redirected, assignments, redirects };
}

function scan(s, start, shell, closer, found, dataOnly) {
  const powershell = shell === 'powershell';
  const pending = [];
  let single = false;
  let double = false;
  let escaped = -1;
  let i = start;
  const wordStart = () => i === start || (/[\s;|&(]/.test(s[i - 1]) && escaped !== i - 1);
  const nested = (from, close) => scan(s, from, shell, close, [], false);
  const open = (from, close, record) => {
    const r = nested(from, close);
    if (record) found.push(s.slice(from, r.end));
    return r.end + 1;
  };
  while (i < s.length) {
    const c = s[i];
    if (single) {
      if (c === "'") single = false;
      i++;
      continue;
    }
    if (c === '\n' && pending.length && !double) {
      let pos = i + 1;
      for (const p of pending.splice(0)) {
        const taken = takeBody(s, pos, p.delim);
        if (p.expand) scan(taken.body, 0, shell, null, found, true);
        pos = taken.next;
      }
      i = pos;
      continue;
    }
    if ((!powershell && c === '\\') || (powershell && c === '`')) { escaped = i + 1; i += 2; continue; }
    if (powershell && !dataOnly && c === '@' && s[i + 2] === '\n' && (s[i + 1] === "'" || s[i + 1] === '"')) {
      const end = s.indexOf(`\n${s[i + 1]}@`, i + 3);
      const stop = end < 0 ? s.length : end;
      if (s[i + 1] === '"') scan(s.slice(i + 3, stop), 0, shell, null, found, true);
      i = end < 0 ? s.length : end + 3;
      continue;
    }
    if (!dataOnly) {
      if (c === "'" && !double) { single = true; i++; continue; }
      if (c === '"') { double = !double; i++; continue; }
    }
    if (c === '#' && shell && !dataOnly && !double && wordStart()) {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '<' && s[i + 1] === '#' && powershell && !dataOnly && !double && wordStart()) {
      const end = s.indexOf('#>', i + 2);
      i = end < 0 ? s.length : end + 2;
      continue;
    }
    if (closer && c === closer && !double) return { end: i };
    const arithmetic = c === '$' ? arithmeticEnd(s, i, shell) : -1;
    if (arithmetic > 0) {
      scan(s.slice(i + 3, arithmetic - 2), 0, shell, null, found, true);
      i = arithmetic;
      continue;
    }
    if (c === '$' && s[i + 1] === '(') { i = open(i + 2, ')', true); continue; }
    if (c === '`' && !powershell) {
      let end = i + 1;
      while (end < s.length && s[end] !== '`') end += s[end] === '\\' ? 2 : 1;
      found.push(s.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (dataOnly) { i++; continue; }
    if (!double && (c === '<' || c === '>') && s[i + 1] === '(') { i = open(i + 2, ')', true); continue; }
    if (!double && c === '(') { i = open(i + 1, ')', true); continue; }
    if (!double && powershell && c === '{') { i = open(i + 1, '}', true); continue; }
    if (!double && c === '<') {
      const heredoc = heredocAt(s, i, shell);
      if (heredoc) { pending.push(heredoc); i += 2; continue; }
    }
    i++;
  }
  return { end: s.length };
}

export function substitutions(text, shell) {
  const found = [];
  scan(prepare(text, shell), 0, shell, null, found, false);
  return found;
}
