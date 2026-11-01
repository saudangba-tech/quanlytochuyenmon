// Chuyển công thức Equation của Word (OMML, thẻ m:oMath) → LaTeX
import { mapSymbols, FUNCTION_NAMES } from './latexSymbols.js';

const kids = (n) => Array.from(n?.childNodes || []).filter((c) => c.nodeType === 1);
const child = (n, name) => kids(n).find((c) => c.nodeName === name);
const prop = (n, prName, key) => {
  const pr = child(n, prName);
  const el = pr && child(pr, key);
  if (!el) return undefined;
  return el.getAttribute('m:val') ?? el.getAttribute('w:val') ?? '';
};
const isOn = (v) => v !== undefined && v !== '0' && v !== 'off' && v !== 'false';

const wrap = (s) => (s.length === 1 || /^\\[a-zA-Z]+$/.test(s) ? s : `{${s}}`);
const brace = (s) => `{${s}}`;

const NARY = { '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '⋃': '\\bigcup', '⋂': '\\bigcap' };
const FENCE = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '{': '\\{',
  '}': '\\}',
  '|': '|',
  '‖': '\\|',
  '⌊': '\\lfloor',
  '⌋': '\\rfloor',
  '⌈': '\\lceil',
  '⌉': '\\rceil',
  '⟨': '\\langle',
  '⟩': '\\rangle',
  '〈': '\\langle',
  '〉': '\\rangle',
  '': '.',
};
const fence = (c) => FENCE[c] ?? c;

function accent(chr, body) {
  const long = body.replace(/\\[a-zA-Z]+|[{}\s]/g, 'x').length > 1;
  switch (chr) {
    case '⃗':
    case '→':
    case '⃯':
      return long ? `\\overrightarrow{${body}}` : `\\vec{${body}}`;
    case '⃖':
    case '←':
      return `\\overleftarrow{${body}}`;
    case '⃡':
    case '↔':
      return `\\overleftrightarrow{${body}}`;
    case '̃':
    case '~':
      return long ? `\\widetilde{${body}}` : `\\tilde{${body}}`;
    case '̄':
    case '̅':
    case '¯':
      return `\\overline{${body}}`;
    case '̇':
      return `\\dot{${body}}`;
    case '̈':
      return `\\ddot{${body}}`;
    case '̌':
      return `\\check{${body}}`;
    case '̆':
      return `\\breve{${body}}`;
    case '̂':
    case '^':
    default:
      return long ? `\\widehat{${body}}` : `\\hat{${body}}`;
  }
}

function runText(r, inFuncName) {
  const t = kids(r)
    .filter((c) => c.nodeName === 'm:t' || c.nodeName === 'w:t')
    .map((c) => c.textContent)
    .join('');
  if (!t) return '';
  const rPr = child(r, 'm:rPr');
  const normal = rPr && (child(rPr, 'm:nor') || prop(r, 'm:rPr', 'm:sty') === 'p');
  const word = t.trim();
  if ((normal || inFuncName) && FUNCTION_NAMES.includes(word)) return `\\${word} `;
  // Chữ thường (tiếng Việt, từ ngữ) trong công thức → \text{}
  if ((rPr && child(rPr, 'm:nor')) || /[À-ỹ]/.test(t) || /[a-zA-Z]{2,}\s+[a-zA-Z]{2,}/.test(t)) {
    return `\\text{${t.replace(/([{}%#$&_])/g, '\\$1')}}`;
  }
  return mapSymbols(t);
}

function rows(n, rowTag, cellTag) {
  return kids(n)
    .filter((c) => c.nodeName === rowTag)
    .map((r) => (cellTag ? kids(r).filter((c) => c.nodeName === cellTag).map((c) => conv(c)).join(' & ') : conv(r)));
}

function conv(n, ctx = {}) {
  if (!n) return '';
  const name = n.nodeName;
  if (/Pr$/.test(name) && name !== 'm:sPre') return '';
  switch (name) {
    case 'm:r':
      return runText(n, ctx.funcName);
    case 'm:f': {
      const num = conv(child(n, 'm:num'));
      const den = conv(child(n, 'm:den'));
      const type = prop(n, 'm:fPr', 'm:type');
      if (type === 'lin') return `${wrap(num)}/${wrap(den)}`;
      if (type === 'noBar') return `\\genfrac{}{}{0pt}{}{${num}}{${den}}`;
      return `\\frac{${num}}{${den}}`;
    }
    case 'm:sSup':
      return `${wrap(conv(child(n, 'm:e')))}^${brace(conv(child(n, 'm:sup')))}`;
    case 'm:sSub':
      return `${wrap(conv(child(n, 'm:e')))}_${brace(conv(child(n, 'm:sub')))}`;
    case 'm:sSubSup':
      return `${wrap(conv(child(n, 'm:e')))}_${brace(conv(child(n, 'm:sub')))}^${brace(conv(child(n, 'm:sup')))}`;
    case 'm:sPre':
      return `{}_${brace(conv(child(n, 'm:sub')))}^${brace(conv(child(n, 'm:sup')))}${wrap(conv(child(n, 'm:e')))}`;
    case 'm:rad': {
      const deg = conv(child(n, 'm:deg')).trim();
      const e = conv(child(n, 'm:e'));
      return isOn(prop(n, 'm:radPr', 'm:degHide')) || !deg || deg === '2' ? `\\sqrt{${e}}` : `\\sqrt[${deg}]{${e}}`;
    }
    case 'm:nary': {
      const chr = prop(n, 'm:naryPr', 'm:chr') ?? '∫';
      const op = NARY[chr] || mapSymbols(chr);
      const sub = isOn(prop(n, 'm:naryPr', 'm:subHide')) ? '' : conv(child(n, 'm:sub'));
      const sup = isOn(prop(n, 'm:naryPr', 'm:supHide')) ? '' : conv(child(n, 'm:sup'));
      return `${op}${sub ? `_${brace(sub)}` : ''}${sup ? `^${brace(sup)}` : ''} ${conv(child(n, 'm:e'))}`;
    }
    case 'm:d': {
      const beg = prop(n, 'm:dPr', 'm:begChr') ?? '(';
      const end = prop(n, 'm:dPr', 'm:endChr') ?? ')';
      const sep = prop(n, 'm:dPr', 'm:sepChr') ?? '|';
      const es = kids(n).filter((c) => c.nodeName === 'm:e');
      const only = es.length === 1 ? kids(es[0]).filter((c) => !/Pr$/.test(c.nodeName)) : [];
      const arr = only.length === 1 && (only[0].nodeName === 'm:eqArr' || only[0].nodeName === 'm:m') ? only[0] : null;
      // Hệ phương trình { và hệ hoặc [
      if (arr && beg === '{' && !end) return `\\begin{cases} ${rowsOf(arr).join(' \\\\ ')} \\end{cases}`;
      if (arr && beg === '[' && !end) return `\\left[\\begin{array}{l} ${rowsOf(arr).join(' \\\\ ')} \\end{array}\\right.`;
      const inner = es.map((e) => conv(e)).join(` ${sep === '|' ? '\\mid' : mapSymbols(sep)} `);
      return `\\left${fence(beg)} ${inner} \\right${fence(end)}`;
    }
    case 'm:eqArr':
      return `\\begin{array}{l} ${rowsOf(n).join(' \\\\ ')} \\end{array}`;
    case 'm:m':
      return `\\begin{matrix} ${rowsOf(n).join(' \\\\ ')} \\end{matrix}`;
    case 'm:acc':
      return accent(prop(n, 'm:accPr', 'm:chr') ?? '̂', conv(child(n, 'm:e')));
    case 'm:bar':
      return prop(n, 'm:barPr', 'm:pos') === 'bot' ? `\\underline{${conv(child(n, 'm:e'))}}` : `\\overline{${conv(child(n, 'm:e'))}}`;
    case 'm:groupChr': {
      const chr = prop(n, 'm:groupChrPr', 'm:chr') ?? '⏟';
      const e = conv(child(n, 'm:e'));
      if (chr === '⏞') return `\\overbrace{${e}}`;
      if (chr === '⏟') return `\\underbrace{${e}}`;
      if (chr === '→') return `\\xrightarrow{${e}}`;
      return e;
    }
    case 'm:limLow': {
      const e = conv(child(n, 'm:e'), ctx).trim();
      const lim = conv(child(n, 'm:lim'));
      if (/^\\(lim|max|min|sup|inf)\s*$/.test(e) || /^(lim|max|min)$/.test(e)) return `\\${e.replace(/^\\/, '').trim()}_{${lim}}`;
      return `\\underset{${lim}}{${e}}`;
    }
    case 'm:limUpp':
      return `\\overset{${conv(child(n, 'm:lim'))}}{${conv(child(n, 'm:e'))}}`;
    case 'm:func': {
      const fn = conv(child(n, 'm:fName'), { funcName: true }).trim();
      return `${fn} ${conv(child(n, 'm:e'))}`;
    }
    case 'm:fName':
      return kids(n)
        .map((c) => conv(c, { funcName: true }))
        .join('');
    case 'w:r':
    case 'w:t':
      return mapSymbols(n.textContent || '');
    default:
      return kids(n)
        .map((c) => conv(c, ctx))
        .join('');
  }
}

function rowsOf(arr) {
  return arr.nodeName === 'm:m' ? rows(arr, 'm:mr', 'm:e') : rows(arr, 'm:e');
}

export function ommlToLatex(node) {
  return conv(node)
    .replace(/\s+/g, ' ')
    .replace(/\s*([_^])\s*/g, '$1')
    .trim();
}
