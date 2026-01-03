/**
 * Tiny syntax highlighter — regex-based, no deps.
 *
 * Covers C++/C/Java/JavaScript/Python/Go/Rust/Kotlin/C# good enough for
 * code-viewer purposes (read-only). Not a full lexer — handles comments,
 * strings, numbers, keywords, types. Returns an array of { class, text }
 * segments so React can render <span className=...> for each.
 */

export interface Segment {
  kind: 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'type' | 'fn';
  text: string;
}

const KEYWORDS: Record<string, Set<string>> = {
  cpp: new Set([
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'goto', 'try', 'catch', 'throw', 'class', 'struct',
    'union', 'enum', 'public', 'private', 'protected', 'virtual', 'override',
    'final', 'using', 'namespace', 'template', 'typename', 'const', 'constexpr',
    'static', 'inline', 'extern', 'volatile', 'mutable', 'auto', 'new', 'delete',
    'this', 'nullptr', 'true', 'false', 'sizeof', 'typedef', 'operator',
    'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast',
    'noexcept', 'explicit', 'friend', '#include', '#define', '#ifdef',
    '#ifndef', '#endif', '#pragma',
  ]),
  c: new Set([
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'goto', 'struct', 'union', 'enum', 'typedef',
    'const', 'static', 'extern', 'volatile', 'inline', 'sizeof',
    '#include', '#define', '#ifdef', '#ifndef', '#endif', '#pragma',
  ]),
  java: new Set([
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'try', 'catch', 'finally', 'throw', 'throws',
    'class', 'interface', 'extends', 'implements', 'public', 'private',
    'protected', 'static', 'final', 'abstract', 'synchronized', 'volatile',
    'transient', 'native', 'new', 'this', 'super', 'null', 'true', 'false',
    'package', 'import', 'instanceof', 'void',
  ]),
  python: new Set([
    'if', 'elif', 'else', 'while', 'for', 'in', 'not', 'and', 'or', 'is',
    'return', 'break', 'continue', 'pass', 'def', 'class', 'lambda',
    'try', 'except', 'finally', 'raise', 'with', 'as', 'import', 'from',
    'global', 'nonlocal', 'yield', 'async', 'await', 'True', 'False', 'None',
    'del', 'assert',
  ]),
  javascript: new Set([
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'try', 'catch', 'finally', 'throw', 'class',
    'extends', 'function', 'const', 'let', 'var', 'new', 'this', 'super',
    'null', 'undefined', 'true', 'false', 'typeof', 'instanceof', 'in',
    'of', 'delete', 'void', 'import', 'from', 'export', 'default',
    'async', 'await', 'yield', 'static',
  ]),
  typescript: new Set([
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'try', 'catch', 'finally', 'throw', 'class',
    'extends', 'interface', 'type', 'enum', 'function', 'const', 'let', 'var',
    'new', 'this', 'super', 'null', 'undefined', 'true', 'false', 'typeof',
    'instanceof', 'in', 'of', 'delete', 'void', 'import', 'from', 'export',
    'default', 'async', 'await', 'yield', 'static', 'readonly', 'public',
    'private', 'protected', 'abstract', 'as', 'is', 'keyof', 'never', 'any',
    'unknown',
  ]),
  go: new Set([
    'if', 'else', 'for', 'switch', 'case', 'default', 'break', 'continue',
    'return', 'go', 'defer', 'select', 'chan', 'func', 'package', 'import',
    'type', 'struct', 'interface', 'map', 'range', 'var', 'const', 'nil',
    'true', 'false', 'goto', 'fallthrough',
  ]),
  rust: new Set([
    'if', 'else', 'while', 'for', 'in', 'loop', 'match', 'break', 'continue',
    'return', 'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum',
    'impl', 'trait', 'pub', 'mod', 'use', 'crate', 'self', 'Self', 'super',
    'where', 'as', 'move', 'ref', 'async', 'await', 'true', 'false',
    'unsafe', 'extern', 'type', 'dyn', 'box',
  ]),
  kotlin: new Set([
    'if', 'else', 'while', 'for', 'do', 'when', 'is', 'in', 'as', 'break',
    'continue', 'return', 'try', 'catch', 'finally', 'throw', 'class',
    'object', 'interface', 'fun', 'val', 'var', 'public', 'private',
    'protected', 'internal', 'open', 'final', 'abstract', 'override', 'this',
    'super', 'null', 'true', 'false', 'package', 'import', 'companion',
    'data', 'sealed', 'enum', 'typealias',
  ]),
  csharp: new Set([
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'try', 'catch', 'finally', 'throw', 'class',
    'struct', 'interface', 'public', 'private', 'protected', 'internal',
    'static', 'readonly', 'abstract', 'sealed', 'virtual', 'override',
    'new', 'this', 'base', 'null', 'true', 'false', 'using', 'namespace',
    'void', 'var', 'async', 'await', 'is', 'as', 'in', 'out', 'ref',
    'params', 'typeof',
  ]),
};

const TYPES: Record<string, Set<string>> = {
  cpp: new Set([
    'int', 'long', 'short', 'char', 'float', 'double', 'bool', 'void',
    'unsigned', 'signed', 'string', 'vector', 'map', 'set', 'pair', 'std',
    'size_t', 'int32_t', 'int64_t', 'uint32_t', 'uint64_t', 'wchar_t',
    'cin', 'cout', 'cerr', 'endl', 'iostream', 'sync_with_stdio',
  ]),
  c: new Set([
    'int', 'long', 'short', 'char', 'float', 'double', 'void', 'unsigned',
    'signed', 'size_t', 'FILE',
  ]),
  java: new Set([
    'int', 'long', 'short', 'char', 'float', 'double', 'boolean', 'byte',
    'String', 'Integer', 'Long', 'Double', 'Boolean', 'Object', 'List',
    'Map', 'Set', 'ArrayList', 'HashMap', 'HashSet', 'System', 'out',
  ]),
  python: new Set([
    'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'bytes',
    'object', 'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter',
    'sum', 'min', 'max', 'abs', 'open', 'input', 'type', 'isinstance',
  ]),
};

function pickLang(language: string): string {
  const l = language.toLowerCase();
  if (l.startsWith('cpp') || l.startsWith('c++') || l.startsWith('clang')) return 'cpp';
  if (l === 'c') return 'c';
  if (l.startsWith('java') && !l.startsWith('javascript')) return 'java';
  if (l.startsWith('py')) return 'python';
  if (l === 'js' || l.startsWith('javascript') || l === 'node') return 'javascript';
  if (l === 'ts' || l.startsWith('typescript')) return 'typescript';
  if (l === 'go' || l === 'golang') return 'go';
  if (l === 'rs' || l === 'rust') return 'rust';
  if (l === 'kt' || l === 'kotlin') return 'kotlin';
  if (l === 'cs' || l === 'csharp' || l === 'c#') return 'csharp';
  return '';
}

/**
 * Tokenise source into coloured segments. Greedy single-pass scanner:
 * comments and strings consume until they end, otherwise word/number/symbol.
 */
export function tokenize(code: string, language: string): Segment[] {
  const lang = pickLang(language);
  const kw = KEYWORDS[lang] ?? new Set<string>();
  const types = TYPES[lang] ?? new Set<string>();
  const out: Segment[] = [];
  let i = 0;
  const n = code.length;
  const isIdStart = (c: string) => /[A-Za-z_#]/.test(c);
  const isIdPart = (c: string) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);

  while (i < n) {
    const c = code[i];
    const next = code[i + 1] ?? '';

    // line comment // or # (python/shell)
    if ((c === '/' && next === '/') || (c === '#' && (lang === 'python' || lang === ''))) {
      const start = i;
      while (i < n && code[i] !== '\n') i++;
      out.push({ kind: 'comment', text: code.slice(start, i) });
      continue;
    }
    // block comment /* ... */
    if (c === '/' && next === '*') {
      const start = i;
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      if (i < n) i += 2;
      out.push({ kind: 'comment', text: code.slice(start, i) });
      continue;
    }
    // triple-quoted python docstring
    if (lang === 'python' && (c === '"' || c === "'") && code[i + 1] === c && code[i + 2] === c) {
      const q = c;
      const start = i;
      i += 3;
      while (i < n - 2 && !(code[i] === q && code[i + 1] === q && code[i + 2] === q)) i++;
      if (i < n - 2) i += 3;
      out.push({ kind: 'string', text: code.slice(start, i) });
      continue;
    }
    // string "..." or '...'
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = i;
      i++;
      while (i < n) {
        if (code[i] === '\\' && i + 1 < n) { i += 2; continue; }
        if (code[i] === quote) { i++; break; }
        if (code[i] === '\n' && quote !== '`') break; // unterminated single-line string
        i++;
      }
      out.push({ kind: 'string', text: code.slice(start, i) });
      continue;
    }
    // numbers
    if (isDigit(c) || (c === '.' && isDigit(next))) {
      const start = i;
      while (i < n && /[0-9._eExXa-fA-F]/.test(code[i])) i++;
      out.push({ kind: 'number', text: code.slice(start, i) });
      continue;
    }
    // identifier / keyword. '#' starts a preprocessor directive — extend
    // the run to include the directive name (e.g. '#include').
    if (isIdStart(c)) {
      const start = i;
      i++; // consume the start char unconditionally (covers bare '#')
      while (i < n && isIdPart(code[i])) i++;
      const w = code.slice(start, i);
      if (kw.has(w)) out.push({ kind: 'keyword', text: w });
      else if (types.has(w)) out.push({ kind: 'type', text: w });
      else if (code[i] === '(') out.push({ kind: 'fn', text: w });
      else out.push({ kind: 'plain', text: w });
      continue;
    }
    // single char punctuation / whitespace
    let j = i + 1;
    while (j < n && !isIdStart(code[j]) && !isDigit(code[j]) &&
           code[j] !== '"' && code[j] !== "'" && code[j] !== '`' &&
           !(code[j] === '/' && (code[j + 1] === '/' || code[j + 1] === '*'))) {
      j++;
    }
    out.push({ kind: 'plain', text: code.slice(i, j) });
    i = j;
  }
  return out;
}

export const SEGMENT_CLASS: Record<Segment['kind'], string> = {
  plain: '',
  comment: 'text-muted-foreground italic',
  string: 'text-emerald-500 dark:text-emerald-400',
  number: 'text-amber-600 dark:text-amber-400',
  keyword: 'text-violet-600 dark:text-violet-400 font-medium',
  type: 'text-sky-600 dark:text-sky-400',
  fn: 'text-blue-600 dark:text-blue-400',
};
